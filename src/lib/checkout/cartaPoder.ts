// Carta poder — única fuente del texto, templetizada.
// La usa el wizard para el preview HTML (paso 5) y la usará el backend para
// generar el PDF firmado: mismo template, imposible que diverjan.
// Basada en el modelo real usado en producción (spec docs/spec_self_checkout.md §5).

import { APODERADO, normalizeTipoMarca, tieneDenominacion, type TipoMarca } from './constants';

export interface CartaPoderData {
  nombreApellido: string;
  /** Tipo de documento: DNI | Pasaporte | Libreta Cívica | Libreta de Enrolamiento */
  docTipo: string;
  docNumero: string;
  cuit: string;
  calle: string;
  numero: string;
  piso?: string;
  depto?: string;
  codigoPostal: string;
  localidad: string;
  provincia: string;
  /** Un solo poder cubre todas las marcas del pedido: un bullet por marca.
   *  Las figurativas no llevan denominación: el `nombre` es interno nuestro y
   *  no se nombra en el poder. */
  marcas: { nombre: string; tipo?: TipoMarca; clases: number[] }[];
  fecha: { dia: number; mes: number; anio: number };
}

export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function joinClases(clases: number[]): string {
  if (clases.length === 0) return 'la clase que corresponda';
  if (clases.length === 1) return `la clase ${clases[0]}`;
  const nums = [...clases].sort((a, b) => a - b);
  const last = nums.pop();
  return `las clases ${nums.join(', ')} y ${last}`;
}

/** Cómo se nombra cada marca en el bullet del poder.
 *  La figurativa no tiene denominación: se la identifica por su tipo y sus
 *  clases, nunca por el nombre de referencia interno (que el INPI no conoce). */
function objetoMarca(m: { nombre: string; tipo?: TipoMarca }): string {
  const tipo = normalizeTipoMarca(m.tipo);
  if (!tieneDenominacion(tipo)) return 'la marca figurativa';
  const nombre = `“${m.nombre.trim().toUpperCase()}”`;
  return tipo === 'mixta' ? `la marca mixta ${nombre}` : `la marca ${nombre}`;
}

function domicilioLinea(d: CartaPoderData): string {
  let dir = `${d.calle} ${d.numero}`;
  if (d.piso) dir += `, piso ${d.piso}`;
  if (d.depto) dir += `, depto ${d.depto}`;
  // CABA no es una provincia — no anteponer "Provincia de"
  const prov = d.provincia === 'Ciudad Autónoma de Buenos Aires'
    ? d.provincia
    : `Provincia de ${d.provincia}`;
  return `${dir}, Código Postal ${d.codigoPostal}, ${d.localidad}, ${prov}, Argentina`;
}

export interface CartaPoderTexto {
  encabezado: string[];
  intro: string;
  bullets: string[];
  cierre: string;
  firmaAclaracion: string;
  firmaDoc: string;
}

export function cartaPoderTexto(d: CartaPoderData): CartaPoderTexto {
  // Las figurativas entran aunque no tengan nombre: no llevan denominación.
  const marcas = d.marcas.filter(
    m => m.nombre.trim() || !tieneDenominacion(normalizeTipoMarca(m.tipo)),
  );
  const varias = marcas.length > 1;
  const doc = `${d.docTipo || 'DNI'} ${d.docNumero}`;
  return {
    encabezado: [
      'Sres.',
      'Instituto Nacional de la Propiedad Industrial - INPI - Argentina',
    ],
    intro:
      `A los ${d.fecha.dia} días del mes de ${MESES[d.fecha.mes]} de ${d.fecha.anio}, ` +
      `yo, ${d.nombreApellido}, ${doc}, CUIT/CUIL ${d.cuit}, ` +
      `con domicilio en ${domicilioLinea(d)}, por la presente autorizo expresamente al ` +
      `${APODERADO.tratamiento} ${APODERADO.nombre}, DNI ${APODERADO.dni}, CUIT ${APODERADO.cuit}, ` +
      `con domicilio en ${APODERADO.domicilio}, para que en mi nombre y representación:`,
    bullets: [
      ...marcas.map(m =>
        `Solicite el registro de ${objetoMarca(m)} ante el Instituto Nacional de la Propiedad Industrial (INPI) en ${joinClases(m.clases)} de la Clasificación Internacional de NIZA;`,
      ),
      varias ? 'Realice el seguimiento de los trámites;' : 'Realice el seguimiento del trámite;',
      'Conteste vistas, observaciones y oposiciones;',
      varias
        ? 'Presente escritos, recursos y cualquier otra gestión necesaria hasta la finalización de los trámites.'
        : 'Presente escritos, recursos y cualquier otra gestión necesaria hasta la finalización del trámite.',
    ],
    cierre: varias
      ? 'La presente autorización se otorga a los efectos de que las marcas sean registradas a mi nombre.'
      : 'La presente autorización se otorga a los efectos de que la marca sea registrada a mi nombre.',
    firmaAclaracion: d.nombreApellido,
    firmaDoc: doc,
  };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Render HTML del documento (preview del paso 5). `firmaDataUrl` opcional. */
export function cartaPoderHTML(d: CartaPoderData, firmaDataUrl?: string): string {
  const t = cartaPoderTexto(d);
  return `
    <p class="ck-cp-dest">${t.encabezado.map(esc).join('<br>')}</p>
    <p class="ck-cp-p">${esc(t.intro)}</p>
    <ul class="ck-cp-ul">${t.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
    <p class="ck-cp-p">${esc(t.cierre)}</p>
    <div class="ck-cp-firma">
      ${firmaDataUrl ? `<img src="${firmaDataUrl}" alt="Firma" class="ck-cp-firma-img">` : '<div class="ck-cp-firma-space"></div>'}
      <div class="ck-cp-firma-linea"></div>
      <p class="ck-cp-firma-acl">${esc(t.firmaAclaracion)}<br>${esc(t.firmaDoc)}</p>
    </div>
  `;
}
