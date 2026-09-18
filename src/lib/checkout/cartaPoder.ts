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

import { APODERADO, esApoderado, formatPorcentaje, type TipoMarca, type TipoPersona } from './constants';

/** Un otorgante del poder. `porcentaje` solo se nombra cuando hay más de uno:
 *  en un poder de un solo titular decir "100%" es ruido.
 *
 *  Un cotitular puede estar TODAVÍA SIN DATOS: el que arma el pedido sólo carga
 *  su email y su porcentaje, y el resto lo completa él mismo al firmar. Ver
 *  `esPendiente()`. */
export interface TitularPoder {
  /** Sin esto es 'Humana': es lo que eran todos los poderes antes de que el
   *  checkout aceptara sociedades, y los pedidos viejos no lo traen. */
  tipoPersona?: TipoPersona;
  /** Persona humana: nombre y apellido. Jurídica: la razón social. */
  nombreApellido: string;
  /** Tipo de documento: DNI | Pasaporte | Libreta Cívica | Libreta de Enrolamiento.
   *  Sólo persona humana — una sociedad no tiene documento. */
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

  // ── Sólo persona jurídica ──
  /** Inscripción registral. Los tres opcionales: lo que falte no deja hueco,
   *  se omite (ver `inscripcionFrase`). */
  inscripcionRegistro?: string;
  inscripcionNumero?: string;
  inscripcionFecha?: string;
  /** Quién firma por la sociedad. Obligatorios en una jurídica: sin firmante
   *  no hay quién otorgue el poder. */
  repNombre?: string;
  repDocumento?: string;
  repCaracter?: string;
  /** El poder previo del firmante. Se cita SÓLO si el carácter dice apoderado,
   *  aunque venga cargado: citárselo a un presidente afirmaría algo que el
   *  documento no sabe. */
  repPoder?: string;
}

/** Una sociedad. El default es 'Humana' porque es lo que eran todos los
 *  titulares antes de que esto existiera. */
export function esJuridica(t: TitularPoder): boolean {
  return t.tipoPersona === 'Juridica';
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

/** La inscripción registral de una sociedad, con lo que haya.
 *
 *  LO QUE FALTA SE OMITE, NO DEJA HUECO: si no hay ninguno de los tres datos la
 *  frase entera desaparece y el párrafo pasa del CUIT directo al domicilio, que
 *  es lo correcto para una sociedad extranjera, una en formación, o una que
 *  simplemente no lo cargó. Un "inscripta ante ___ bajo el número ___" a medio
 *  llenar se lee como un campo que alguien se olvidó de completar, y en un
 *  documento legal eso es peor que no decirlo.
 *
 *  El número no siempre es un número, y eso cambia la preposición: la IGJ
 *  identifica con una resolución y los registros provinciales con número y
 *  libro. "bajo el número 9659, libro 97" se lee; "bajo el número Resolución
 *  Nº 134" no. */
function inscripcionFrase(t: TitularPoder): string {
  const registro = (t.inscripcionRegistro ?? '').trim();
  const numero = (t.inscripcionNumero ?? '').trim();
  const fecha = (t.inscripcionFecha ?? '').trim();
  if (!registro && !numero && !fecha) return '';

  const partes: string[] = [];
  if (registro) partes.push(`ante ${registro}`);
  if (numero) partes.push(/^\d/.test(numero) ? `bajo el número ${numero}` : `bajo ${numero}`);
  if (fecha) partes.push(`con fecha ${fecha}`);
  // Con coma y no con espacio porque `numero` es texto libre y suele traer
  // comas adentro ("9659, libro 97"): sin separar, el "con fecha" que sigue
  // se lee como parte del número.
  return `inscripta ${partes.join(', ')}`;
}

/** Cómo se presenta el firmante de una sociedad.
 *
 *  La cláusula de juramento es FIJA y siempre va: es lo que reemplaza acreditar
 *  el cargo con estatuto y acta de designación, que casi ningún poder presentado
 *  ante el INPI acompaña. Sin ella el documento afirma un carácter y nadie se
 *  hace responsable de esa afirmación. */
function representanteFrase(t: TitularPoder): string {
  const nombre = (t.repNombre ?? '').trim();
  const doc = (t.repDocumento ?? '').trim();
  const caracter = (t.repCaracter ?? '').trim();
  const poder = (t.repPoder ?? '').trim();

  let frase = `representada en este acto por ${nombre}, DNI ${doc}, ` +
    `en su carácter de ${caracter}`;
  // Sólo si el carácter lo pide. Un presidente o un socio gerente son el órgano
  // de la sociedad y su facultad sale del estatuto; un apoderado la saca de otro
  // poder, y sin nombrarlo el documento no dice de dónde viene lo que afirma.
  if (poder && esApoderado(caracter)) frase += `, conforme poder ${poder}`;
  return `${frase}, quien declara bajo juramento que su cargo se encuentra ` +
    `vigente y que cuenta con facultades suficientes para este acto`;
}

/** El bloque que identifica a un otorgante dentro de la intro.
 *
 *  Un cotitular sin datos NO se inventa ni se omite: queda a la vista que ese
 *  renglón está incompleto y quién lo va a completar. El primero firma sabiendo
 *  exactamente eso, y el documento definitivo —el que se presenta— sale recién
 *  cuando firmaron todos y ya no queda ningún renglón así.
 *
 *  Sirve para los dos tipos de persona. El texto del pendiente no los
 *  distingue a propósito: al armar el pedido sólo se carga el email y el
 *  porcentaje del cotitular, así que si es una persona o una sociedad recién se
 *  sabe cuando entra a firmar. */
function otorganteLinea(t: TitularPoder): string {
  if (esPendiente(t)) {
    const quien = t.email ? ` (aviso enviado a ${t.email})` : '';
    return `el cotitular que suscribe al pie${quien}, cuyos datos personales ` +
      `completa al momento de su firma`;
  }

  // Una sociedad no lleva documento: el DNI que aparece es el de su firmante,
  // dentro de `representanteFrase`. Escribir acá el `docDe()` dejaría el poder
  // diciendo que la S.R.L. tiene DNI.
  if (esJuridica(t)) {
    const inscripcion = inscripcionFrase(t);
    return `${t.nombreApellido}, CUIT/CUIL ${t.cuit}` +
      (inscripcion ? `, ${inscripcion}` : '') +
      `, con domicilio en ${domicilioLinea(t)}, ${representanteFrase(t)}`;
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
  /** "En representación de ACME S.R.L." — vacío en una persona humana. Quien
   *  firma por una sociedad estampa SU nombre y SU DNI: el renglón de abajo es
   *  lo único que dice a nombre de quién lo hace. */
  representacion: string;
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
  // no dice "yo autorizo … a mi nombre", y una sociedad sola no dice ninguna de
  // las dos cosas — quien habla es la sociedad, no quien firma por ella.
  //
  // Mientras TODOS los otorgantes sean personas humanas el texto queda idéntico
  // al de siempre: la variante aparece recién cuando hay una sociedad en el
  // pedido, así que los poderes que ya se estaban firmando no cambian.
  const hayJuridica = titulares.some(esJuridica);
  const sujeto = variosTitulares
    ? (hayJuridica ? 'los que suscriben' : 'nosotros')
    : (hayJuridica ? '' : 'yo');
  const verbo = variosTitulares
    ? (hayJuridica ? 'autorizan' : 'autorizamos')
    : (hayJuridica ? 'autoriza' : 'autorizo');
  const enNombreDe = variosTitulares
    ? (hayJuridica ? 'en nombre y representación de los otorgantes' : 'en nuestro nombre y representación')
    : (hayJuridica
      ? `en nombre y representación de ${titulares[0].nombreApellido.trim() || 'la sociedad'}`
      : 'en mi nombre y representación');

  return {
    encabezado: [
      'Sres.',
      'Instituto Nacional de la Propiedad Industrial - INPI - Argentina',
    ],
    intro:
      `A los ${d.fecha.dia} días del mes de ${MESES[d.fecha.mes]} de ${d.fecha.anio}, ` +
      // Una sociedad sola no lleva pronombre: el sujeto de la frase es su
      // razón social, que ya abre el bloque del otorgante.
      (sujeto ? `${sujeto}, ` : '') +
      `${enumerarOtorgantes(titulares.map(otorganteLinea))}, ` +
      `por la presente ${verbo} expresamente al ` +
      `${APODERADO.tratamiento} ${APODERADO.nombre}, DNI ${APODERADO.dni}, CUIT ${APODERADO.cuit}, ` +
      `con domicilio en ${APODERADO.domicilio}, para que ${enNombreDe}:`,
    // Plural y sin nombres propios: el mismo documento sirve para una marca o
    // para cinco, y para las clases que terminen presentándose.
    //
    // ⚠️ LAS FACULTADES SON FIJAS: no se configuran desde el checkout ni desde
    // ningún llamador. Un poder a la carta es un poder que nadie revisó.
    //
    // Son amplias a propósito. El poder se firma una vez y acompaña cada
    // presentación durante años —los estudios adjuntan poderes de hace cinco a
    // trámites que no existían cuando se firmaron—, así que lo que no esté
    // escrito hoy no se puede agregar después sin volver a molestar al cliente
    // y perseguir de nuevo la firma de todos los cotitulares.
    //
    // Lo que deliberadamente NO está es SUSTITUIR EL PODER. Sustituir habilita
    // a pasarle el mandato a un tercero que el poderdante no eligió ni conoce:
    // es una decisión del estudio con su cliente, no un default.
    bullets: [
      'Solicite ante el Instituto Nacional de la Propiedad Industrial (INPI) el ' +
      'registro de marcas, en las clases de la Clasificación Internacional de ' +
      'Niza que en cada caso correspondan, y peticione sus renovaciones;',
      'Realice el seguimiento de los trámites, se notifique y retire títulos;',
      'Conteste vistas, observaciones y oposiciones, deduzca oposiciones y ' +
      'desista de ellas total o parcialmente;',
      'Limite o desista, total o parcialmente, los productos y servicios solicitados;',
      'Acepte e inscriba transferencias, cesiones y cambios de titularidad;',
      'Abone tasas y aranceles, y perciba documentos y valores vinculados a los trámites;',
      'Presente escritos, recursos y cualquier otra gestión necesaria hasta la finalización de los trámites.',
    ],
    cierre: cierreTexto(titulares),
    firmas: titulares.map(t => ({
      // Sin datos cargados, el pie se identifica por el email: es lo único que
      // se sabe de esa persona hasta que entra a firmar.
      //
      // En una sociedad quien firma es una persona: van SU nombre y SU DNI, y
      // el renglón de representación abajo dice por quién lo hace. Poner ahí la
      // razón social dejaría una firma sin nadie que responda por ella.
      aclaracion: esPendiente(t)
        ? (t.email || 'Cotitular')
        : (esJuridica(t) ? (t.repNombre ?? '').trim() : t.nombreApellido),
      doc: esPendiente(t)
        ? 'Datos a completar por el cotitular'
        : (esJuridica(t) ? `DNI ${(t.repDocumento ?? '').trim()}` : docDe(t)),
      representacion: !esPendiente(t) && esJuridica(t)
        ? `En representación de ${t.nombreApellido}`
        : '',
      porcentaje: variosTitulares && typeof t.porcentaje === 'number'
        ? `${formatPorcentaje(t.porcentaje)}% de titularidad`
        : '',
    })),
  };
}

/** Cierra la oración sin duplicar el punto. Casi toda razón social termina en
 *  uno ("ACME S.R.L.", "Pérez S.A.") y "registradas a nombre de ACME S.R.L.."
 *  se lee como un error de tipeo en un documento legal. */
function puntoFinal(s: string): string {
  return s.endsWith('.') ? s : `${s}.`;
}

/** Con un titular el poder dice "a mi nombre". Con varios hay que decir en qué
 *  proporción queda cada uno: es lo que el INPI carga en TITULARIDAD y lo único
 *  que después distingue quién es dueño de cuánto. */
function cierreTexto(titulares: TitularPoder[]): string {
  // "las marcas", en plural y sin nombrarlas: el poder no dice cuáles son.
  const cosa = 'las marcas sean registradas';
  if (titulares.length <= 1) {
    // Una sociedad no dice "a mi nombre": la marca queda a nombre de la razón
    // social, no de quien firmó por ella.
    const uno = titulares[0];
    const aNombre = uno && esJuridica(uno)
      ? `a nombre de ${uno.nombreApellido.trim() || 'la sociedad'}`
      : 'a mi nombre';
    return puntoFinal(`La presente autorización se otorga a los efectos de que ${cosa} ${aNombre}`);
  }
  const partes = titulares.map(t => {
    const quien = esPendiente(t) ? (t.email || 'el cotitular') : t.nombreApellido;
    return typeof t.porcentaje === 'number'
      ? `${quien}, ${formatPorcentaje(t.porcentaje)}%`
      : quien;
  });
  return puntoFinal(
    `La presente autorización se otorga a los efectos de que ${cosa} a nombre de ` +
    `los otorgantes, en las siguientes proporciones de titularidad: ${partes.join('; ')}`);
}

function vacio(): TitularPoder {
  return {
    tipoPersona: 'Humana',
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
        f.representacion ? `<br>${esc(f.representacion)}` : ''
      }${
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
