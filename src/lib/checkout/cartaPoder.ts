// Carta poder — única fuente del texto, templetizada.
// La usa el wizard para el preview HTML (paso 7), la página /firmar/<token> de
// los cotitulares y el generador del PDF: mismo template, imposible que
// diverjan.
// Basada en el modelo real usado en producción (spec docs/spec_self_checkout.md §5).
//
// Un poder, N otorgantes: cuando la marca tiene más de un titular todos otorgan
// el MISMO documento y cada uno firma al pie. No se emite un poder por cabeza —
// el INPI recibe un solo papel con todas las firmas.
//
// EL PODER ES GENÉRICO: no nombra la denominación de la marca ni las clases.
// Autoriza a presentar "marcas, en las clases que correspondan". Es a
// propósito: el poder que se firma antes de presentar
// quedaba desmentido por cualquier ajuste posterior —una clase que se agrega,
// una figurativa que resulta mixta, un nombre que se corrige por una vista— y
// había que reemitirlo y hacerlo firmar de nuevo. Un poder sin esos datos sigue
// siendo válido para todo el trámite. La marca y las clases concretas viajan en
// el pedido, no en el papel.

import { APODERADO, formatPorcentaje, type TipoMarca } from './constants';

/** Un otorgante del poder. `porcentaje` solo se nombra cuando hay más de uno:
 *  en un poder de un solo titular decir "100%" es ruido.
 *
 *  Un cotitular puede estar TODAVÍA SIN DATOS: el que arma el pedido sólo carga
 *  su email y su porcentaje, y el resto lo completa él mismo al firmar. Ver
 *  `esPendiente()`. */
export interface TitularPoder {
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
  porcentaje?: number;
  /** Adónde se le mandó el link para firmar. Mientras no tenga los datos
   *  cargados es lo ÚNICO que lo identifica en el documento. */
  email?: string;
}

/** Un cotitular que todavía no cargó sus datos. Sin nombre no hay a quién
 *  nombrar: el poder lo deja en blanco, dice por qué, y el propio cotitular lo
 *  completa cuando entra a firmar. */
export function esPendiente(t: TitularPoder): boolean {
  return !t.nombreApellido.trim();
}

export interface CartaPoderData {
  /** 1..MAX_TITULARES otorgantes, en el orden en que firman al pie. */
  titulares: TitularPoder[];
  /** Las marcas del pedido. **No se imprimen en el documento** (ver arriba: el
   *  poder es genérico); viajan acá porque los llamadores arman el nombre del
   *  PDF y el email al estudio con la misma estructura. */
  marcas: { nombre: string; tipo?: TipoMarca; clases: number[] }[];
  fecha: { dia: number; mes: number; anio: number };
}

export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Los otorgantes en la intro. El bloque de cada uno ya lleva comas adentro
 *  (documento, CUIT, domicilio), así que separarlos con coma los pega en una
 *  sola parrafada donde no se ve dónde termina uno y empieza el otro: van con
 *  punto y coma, que es lo que corresponde en una enumeración compleja. */
function enumerarOtorgantes(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  const resto = xs.slice(0, -1);
  return `${resto.join('; ')}; y ${xs[xs.length - 1]}`;
}

function domicilioLinea(d: TitularPoder): string {
  let dir = `${d.calle} ${d.numero}`;
  if (d.piso) dir += `, piso ${d.piso}`;
  if (d.depto) dir += `, depto ${d.depto}`;
  // CABA no es una provincia — no anteponer "Provincia de"
  const prov = d.provincia === 'Ciudad Autónoma de Buenos Aires'
    ? d.provincia
    : `Provincia de ${d.provincia}`;
  return `${dir}, Código Postal ${d.codigoPostal}, ${d.localidad}, ${prov}, Argentina`;
}

function docDe(t: TitularPoder): string {
  return `${t.docTipo || 'DNI'} ${t.docNumero}`;
}

/** El bloque que identifica a un otorgante dentro de la intro.
 *
 *  Un cotitular sin datos NO se inventa ni se omite: queda a la vista que ese
 *  renglón está incompleto y quién lo va a completar. El primero firma sabiendo
 *  exactamente eso, y el documento definitivo —el que se presenta— sale recién
 *  cuando firmaron todos y ya no queda ningún renglón así. */
function otorganteLinea(t: TitularPoder): string {
  if (esPendiente(t)) {
    const quien = t.email ? ` (aviso enviado a ${t.email})` : '';
    return `el cotitular que suscribe al pie${quien}, cuyos datos personales ` +
      `completa al momento de su firma`;
  }
  return `${t.nombreApellido}, ${docDe(t)}, CUIT/CUIL ${t.cuit}, ` +
    `con domicilio en ${domicilioLinea(t)}`;
}

/** Un pie de firma. Con varios titulares lleva el porcentaje: es el dato que
 *  distingue una copropiedad 50/50 de una 90/10, y el papel firmado es donde
 *  tiene que quedar asentado. */
export interface FirmaPie {
  aclaracion: string;
  doc: string;
  /** "50% de titularidad" — vacío cuando el titular es uno solo */
  porcentaje: string;
}

export interface CartaPoderTexto {
  encabezado: string[];
  intro: string;
  bullets: string[];
  cierre: string;
  firmas: FirmaPie[];
}

export function cartaPoderTexto(d: CartaPoderData): CartaPoderTexto {
  // `d.marcas` NO entra en el texto: el poder es genérico (ver arriba).
  const titulares = d.titulares.length ? d.titulares : [vacio()];
  const variosTitulares = titulares.length > 1;

  // Toda la conjugación del documento cuelga de esto: un poder con dos dueños
  // no dice "yo autorizo … a mi nombre".
  const sujeto = variosTitulares ? 'nosotros' : 'yo';
  const verbo = variosTitulares ? 'autorizamos' : 'autorizo';
  const posesivo = variosTitulares ? 'nuestro' : 'mi';

  return {
    encabezado: [
      'Sres.',
      'Instituto Nacional de la Propiedad Industrial - INPI - Argentina',
    ],
    intro:
      `A los ${d.fecha.dia} días del mes de ${MESES[d.fecha.mes]} de ${d.fecha.anio}, ` +
      `${sujeto}, ${enumerarOtorgantes(titulares.map(otorganteLinea))}, ` +
      `por la presente ${verbo} expresamente al ` +
      `${APODERADO.tratamiento} ${APODERADO.nombre}, DNI ${APODERADO.dni}, CUIT ${APODERADO.cuit}, ` +
      `con domicilio en ${APODERADO.domicilio}, para que en ${posesivo} nombre y representación:`,
    // Plural y sin nombres propios: el mismo documento sirve para una marca o
    // para cinco, y para las clases que terminen presentándose.
    bullets: [
      'Solicite ante el Instituto Nacional de la Propiedad Industrial (INPI) el ' +
      'registro de marcas, en las clases de la Clasificación Internacional de ' +
      'Niza que en cada caso correspondan;',
      'Realice el seguimiento de los trámites;',
      'Conteste vistas, observaciones y oposiciones;',
      'Presente escritos, recursos y cualquier otra gestión necesaria hasta la finalización de los trámites.',
    ],
    cierre: cierreTexto(titulares),
    firmas: titulares.map(t => ({
      // Sin datos cargados, el pie se identifica por el email: es lo único que
      // se sabe de esa persona hasta que entra a firmar.
      aclaracion: esPendiente(t) ? (t.email || 'Cotitular') : t.nombreApellido,
      doc: esPendiente(t) ? 'Datos a completar por el cotitular' : docDe(t),
      porcentaje: variosTitulares && typeof t.porcentaje === 'number'
        ? `${formatPorcentaje(t.porcentaje)}% de titularidad`
        : '',
    })),
  };
}

/** Con un titular el poder dice "a mi nombre". Con varios hay que decir en qué
 *  proporción queda cada uno: es lo que el INPI carga en TITULARIDAD y lo único
 *  que después distingue quién es dueño de cuánto. */
function cierreTexto(titulares: TitularPoder[]): string {
  // "las marcas", en plural y sin nombrarlas: el poder no dice cuáles son.
  const cosa = 'las marcas sean registradas';
  if (titulares.length <= 1) {
    return `La presente autorización se otorga a los efectos de que ${cosa} a mi nombre.`;
  }
  const partes = titulares.map(t => {
    const quien = esPendiente(t) ? (t.email || 'el cotitular') : t.nombreApellido;
    return typeof t.porcentaje === 'number'
      ? `${quien}, ${formatPorcentaje(t.porcentaje)}%`
      : quien;
  });
  return `La presente autorización se otorga a los efectos de que ${cosa} a nombre de ` +
    `los otorgantes, en las siguientes proporciones de titularidad: ${partes.join('; ')}.`;
}

function vacio(): TitularPoder {
  return {
    nombreApellido: '', docTipo: 'DNI', docNumero: '', cuit: '',
    calle: '', numero: '', codigoPostal: '', localidad: '', provincia: '',
  };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Render HTML del documento (preview del paso 7 y de /firmar/<token>).
 *  `firmas` se aparea por posición con los titulares: un data URL donde ya
 *  firmaron, `undefined` donde todavía falta. Un pie sin firma no se esconde —
 *  se ve el renglón vacío, que es lo que muestra que el poder está incompleto. */
export function cartaPoderHTML(
  d: CartaPoderData,
  firmas: (string | undefined)[] = [],
): string {
  const t = cartaPoderTexto(d);
  const pies = t.firmas.map((f, i) => {
    const img = firmas[i];
    return `<div class="ck-cp-firma">
      ${img ? `<img src="${img}" alt="Firma" class="ck-cp-firma-img">` : '<div class="ck-cp-firma-space"></div>'}
      <div class="ck-cp-firma-linea"></div>
      <p class="ck-cp-firma-acl">${esc(f.aclaracion)}<br>${esc(f.doc)}${
        f.porcentaje ? `<br>${esc(f.porcentaje)}` : ''
      }</p>
    </div>`;
  }).join('');
  return `
    <p class="ck-cp-dest">${t.encabezado.map(esc).join('<br>')}</p>
    <p class="ck-cp-p">${esc(t.intro)}</p>
    <ul class="ck-cp-ul">${t.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
    <p class="ck-cp-p">${esc(t.cierre)}</p>
    <div class="ck-cp-firmas">${pies}</div>
  `;
}

// ── Nombre del archivo del PDF ────────────────────────────
// El poder se archiva por cliente, no por pedido: `carta-poder-UM-20260831-X9F2Q1`
// no dice nada cuando hay treinta en la misma carpeta. `Guerrero_Caminantes_2026-08-31`
// se lee, se busca por apellido y ordena por fecha solo.

/** Un tramo del nombre: sin acentos, sin puntuación y sin espacios, para que
 *  sobreviva a cualquier sistema de archivos y a los clientes de correo. */
function tramoArchivo(s: string | undefined | null, max = 40): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
}

export interface ArchivoPoder {
  /** Apellido del titular que firmó el pedido */
  apellido?: string;
  /** Denominación de la marca (la primera, si el pedido tiene varias) */
  marca?: string;
  fecha?: { dia: number; mes: number; anio: number } | null;
  /** Se agrega al final: "parcial-1de3" */
  sufijo?: string;
  /** Último recurso: si no hay ni apellido ni marca, el nombre vuelve al ref */
  ref?: string;
}

function hoyBuenosAires(): { dia: number; mes: number; anio: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(new Date());
  const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value || '0', 10);
  return { dia: get('day'), mes: get('month') - 1, anio: get('year') };
}

/** `Apellido_Marca_2026-08-31.pdf`. Si falta el apellido o la marca se arma con
 *  lo que haya; sin ninguno de los dos cae en el ref, que es lo que había antes
 *  y siempre existe. */
export function nombreArchivoPoder(d: ArchivoPoder): string {
  const partes = [tramoArchivo(d.apellido), tramoArchivo(d.marca)].filter(Boolean);
  if (!partes.length) partes.push(tramoArchivo(d.ref, 60) || 'carta-poder');

  // ISO al final: ordena por fecha solo en cualquier carpeta. Sin la fecha del
  // poder (pedidos viejos, que no la mandaban) se usa la de hoy: es un nombre
  // de archivo, no el documento — la fecha que vale es la que está impresa.
  const f = d.fecha && [d.fecha.dia, d.fecha.mes, d.fecha.anio].every(n => Number.isInteger(n))
    ? d.fecha
    : hoyBuenosAires();
  const p2 = (n: number) => String(n).padStart(2, '0');
  partes.push(`${f.anio}-${p2(f.mes + 1)}-${p2(f.dia)}`);
  if (d.sufijo) partes.push(tramoArchivo(d.sufijo));

  return `${partes.join('_')}.pdf`;
}
