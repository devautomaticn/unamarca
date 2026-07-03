// Genera el PDF de la carta poder (A4) desde el MISMO template que el preview
// del wizard (src/lib/checkout/cartaPoder.ts), con la firma embebida.
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { cartaPoderTexto, type CartaPoderData } from '../../src/lib/checkout/cartaPoder';

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 72;
const SIZE = 11;
const LH = SIZE * 1.55;

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
  firmaDataUrl?: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page: PDFPage = doc.addPage(A4);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const width = A4[0] - MARGIN * 2;
  let y = A4[1] - MARGIN;

  const drawLines = (lines: string[], f: PDFFont, x = MARGIN) => {
    for (const line of lines) {
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
    page.drawText('•', { x: MARGIN, y, size: SIZE, font });
    drawLines(lines, font, MARGIN + bulletIndent);
    y -= LH * 0.25;
  }
  y -= LH * 0.25;

  drawLines(wrapText(t.cierre, font, SIZE, width), font);

  // ── Firma ─────────────────────────────────────────────
  y -= LH * 1.5;
  const sigH = 52;
  if (firmaDataUrl?.startsWith('data:image/png;base64,')) {
    const b64 = firmaDataUrl.slice('data:image/png;base64,'.length);
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const png = await doc.embedPng(bytes);
    const scale = sigH / png.height;
    page.drawImage(png, {
      x: MARGIN,
      y: y - sigH,
      width: Math.min(png.width * scale, 220),
      height: sigH,
    });
  }
  y -= sigH + 4;

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + 200, y },
    thickness: 0.8,
  });
  y -= LH;
  page.drawText(t.firmaAclaracion, { x: MARGIN, y, size: SIZE - 1, font });
  y -= LH * 0.85;
  page.drawText(t.firmaDoc, { x: MARGIN, y, size: SIZE - 1, font });

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
