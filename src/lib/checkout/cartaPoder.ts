// Carta poder — única fuente del texto, templetizada.
// La usa el wizard para el preview HTML (paso 7), la página /firmar/<token> de
// los cotitulares y el generador del PDF: mismo template, imposible que
// diverjan.
// Basada en el modelo real usado en producción (spec docs/spec_self_checkout.md §5).
//
// Un poder, N otorgantes: cuando la marca tiene más de un titular todos otorgan
// el MISMO documento y cada uno firma al pie. No se emite un poder por cabeza —
// el INPI recibe un solo papel con todas las firmas.

import {
  APODERADO, formatPorcentaje, normalizeTipoMarca, tieneDenominacion, type TipoMarca,
} from './constants';

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

/** Los otorgantes en la intro. El bloque de cada uno ya lleva comas adentro
 *  (documento, CUIT, domicilio), así que separarlos con coma los pega en una
 *  sola parrafada donde no se ve dónde termina uno y empieza el otro: van con
 *  punto y coma, que es lo que corresponde en una enumeración compleja. */
function enumerarOtorgantes(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  const resto = xs.slice(0, -1);
  return `${resto.join('; ')}; y ${xs[xs.length - 1]}`;
}

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
  // Las figurativas entran aunque no tengan nombre: no llevan denominación.
  const marcas = d.marcas.filter(
    m => m.nombre.trim() || !tieneDenominacion(normalizeTipoMarca(m.tipo)),
  );
  const variasMarcas = marcas.length > 1;

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
    bullets: [
      ...marcas.map(m =>
        `Solicite el registro de ${objetoMarca(m)} ante el Instituto Nacional de la Propiedad Industrial (INPI) en ${joinClases(m.clases)} de la Clasificación Internacional de NIZA;`,
      ),
      variasMarcas ? 'Realice el seguimiento de los trámites;' : 'Realice el seguimiento del trámite;',
      'Conteste vistas, observaciones y oposiciones;',
      variasMarcas
        ? 'Presente escritos, recursos y cualquier otra gestión necesaria hasta la finalización de los trámites.'
        : 'Presente escritos, recursos y cualquier otra gestión necesaria hasta la finalización del trámite.',
    ],
    cierre: cierreTexto(titulares, variasMarcas),
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
function cierreTexto(titulares: TitularPoder[], variasMarcas: boolean): string {
  const cosa = variasMarcas ? 'las marcas sean registradas' : 'la marca sea registrada';
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
