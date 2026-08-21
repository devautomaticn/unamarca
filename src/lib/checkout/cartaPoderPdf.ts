// Genera el PDF de la carta poder (A4) desde el MISMO template que el preview
// del wizard (cartaPoder.ts), con las firmas embebidas.
// Corre EN EL NAVEGADOR (import dinámico en el paso 7 y en /firmar/<token>):
// las Pages Functions del plan free no tienen CPU suficiente para pdf-lib
// (error 1102).
//
// Con varios cotitulares el documento crece —cada otorgante suma su párrafo en
// la intro y su pie de firma— así que el PDF pagina solo. Un poder que se corta
// a mitad de la hoja es un poder que hay que rehacer.
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { cartaPoderTexto, type CartaPoderData } from './cartaPoder';

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 72;
const SIZE = 11;
const LH = SIZE * 1.55;

/** Alto de un bloque de firma completo: imagen + renglón + aclaración. Se usa
 *  para decidir el salto de página ANTES de empezar a dibujarlo: una firma
 *  separada de su aclaración no sirve como prueba de nada. */
const SIG_H = 52;
const BLOQUE_FIRMA_H = SIG_H + 4 + LH * 3.2;

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildCartaPoderPdf(
  data: CartaPoderData,
  /** Un data URL por titular, apareado por posición. Los huecos quedan como
   *  renglón en blanco: así se ve qué firma falta. */
  firmas: (string | undefined)[] = [],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const width = A4[0] - MARGIN * 2;

  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - MARGIN;

  /** Abre hoja nueva si lo que viene no entra entero en lo que queda. */
  const ensureSpace = (alto: number) => {
    if (y - alto >= MARGIN) return;
    page = doc.addPage(A4);
    y = A4[1] - MARGIN;
  };

  const drawLines = (lines: string[], f: PDFFont, x = MARGIN) => {
    for (const line of lines) {
      ensureSpace(LH);
      page.drawText(line, { x, y, size: SIZE, font: f });
      y -= LH;
    }
  };

  const t = cartaPoderTexto(data);

  drawLines(t.encabezado, bold);
  y -= LH * 0.7;

  drawLines(wrapText(t.intro, font, SIZE, width), font);
  y -= LH * 0.5;

  const bulletIndent = 16;
  for (const bullet of t.bullets) {
    const lines = wrapText(bullet, font, SIZE, width - bulletIndent);
    // El bullet y su primera línea van juntos: el punto solo al pie de la hoja
    // se lee como un renglón perdido.
    ensureSpace(LH * 2);
    page.drawText('•', { x: MARGIN, y, size: SIZE, font });
    drawLines(lines, font, MARGIN + bulletIndent);
    y -= LH * 0.25;
  }
  y -= LH * 0.25;

  drawLines(wrapText(t.cierre, font, SIZE, width), font);

  // ── Firmas ────────────────────────────────────────────
  // Una por otorgante, apiladas. Cada bloque entra entero en su hoja.
  y -= LH * 1.5;
  for (let i = 0; i < t.firmas.length; i++) {
    const pie = t.firmas[i];
    ensureSpace(BLOQUE_FIRMA_H);

    const firmaDataUrl = firmas[i];
    if (firmaDataUrl?.startsWith('data:image/png;base64,')) {
      const b64 = firmaDataUrl.slice('data:image/png;base64,'.length);
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const png = await doc.embedPng(bytes);
      const scale = SIG_H / png.height;
      page.drawImage(png, {
        x: MARGIN,
        y: y - SIG_H,
        width: Math.min(png.width * scale, 220),
        height: SIG_H,
      });
    }
    y -= SIG_H + 4;

    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: MARGIN + 200, y },
      thickness: 0.8,
    });
    y -= LH;
    page.drawText(pie.aclaracion, { x: MARGIN, y, size: SIZE - 1, font });
    y -= LH * 0.85;
    page.drawText(pie.doc, { x: MARGIN, y, size: SIZE - 1, font });
    if (pie.porcentaje) {
      y -= LH * 0.85;
      page.drawText(pie.porcentaje, { x: MARGIN, y, size: SIZE - 1, font });
    }
    // Sin firma queda el aviso: el poder no está completo y el papel lo dice.
    if (!firmaDataUrl) {
      y -= LH * 0.85;
      page.drawText('(pendiente de firma)', { x: MARGIN, y, size: SIZE - 2, font: bold });
    }
    y -= LH * 1.6;
  }

  return doc.save();
}

/** Fecha actual en Buenos Aires (los Workers corren en UTC) */
export function hoyEnBuenosAires(): { dia: number; mes: number; anio: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(new Date());
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
  return { dia: get('day'), mes: get('month') - 1, anio: get('year') };
}
