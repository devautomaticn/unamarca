// Carta poder — única fuente del texto, templetizada.
// La usa el wizard para el preview HTML (paso 5) y la usará el backend para
// generar el PDF firmado: mismo template, imposible que diverjan.
// Basada en el modelo real usado en producción (spec docs/spec_self_checkout.md §5).

import { APODERADO } from './constants';

export interface CartaPoderData {
  nombreApellido: string;
  dni: string;
  cuit: string;
  calle: string;
  numero: string;
  piso?: string;
  depto?: string;
  codigoPostal: string;
  localidad: string;
  provincia: string;
  marca: string;
  /** v1 siempre una sola clase; el template soporta plural para v2 */
  clases: number[];
  fecha: { dia: number; mes: number; anio: number };
}

export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function joinClases(clases: number[]): string {
  if (clases.length === 1) return `la clase ${clases[0]}`;
  const nums = [...clases].sort((a, b) => a - b);
  const last = nums.pop();
  return `las clases ${nums.join(', ')} y ${last}`;
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
  firmaDni: string;
}

export function cartaPoderTexto(d: CartaPoderData): CartaPoderTexto {
  const marca = d.marca.trim().toUpperCase();
  return {
    encabezado: [
      'Sres.',
      'Instituto Nacional de la Propiedad Industrial - INPI - Argentina',
    ],
    intro:
      `A los ${d.fecha.dia} días del mes de ${MESES[d.fecha.mes]} de ${d.fecha.anio}, ` +
      `yo, ${d.nombreApellido}, DNI ${d.dni}, CUIT/CUIL ${d.cuit}, ` +
      `con domicilio en ${domicilioLinea(d)}, por la presente autorizo expresamente al ` +
      `${APODERADO.tratamiento} ${APODERADO.nombre}, DNI ${APODERADO.dni}, CUIT ${APODERADO.cuit}, ` +
      `con domicilio en ${APODERADO.domicilio}, para que en mi nombre y representación:`,
    bullets: [
      `Solicite el registro de la marca “${marca}” ante el Instituto Nacional de la Propiedad Industrial (INPI) en ${joinClases(d.clases)} de la Clasificación Internacional de NIZA;`,
      'Realice el seguimiento del trámite;',
      'Conteste vistas, observaciones y oposiciones;',
      'Presente escritos, recursos y cualquier otra gestión necesaria hasta la finalización del trámite.',
    ],
    cierre: 'La presente autorización se otorga a los efectos de que la marca sea registrada a mi nombre.',
    firmaAclaracion: d.nombreApellido,
    firmaDni: `DNI ${d.dni}`,
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
      <p class="ck-cp-firma-acl">${esc(t.firmaAclaracion)}<br>${esc(t.firmaDni)}</p>
    </div>
  `;
}
