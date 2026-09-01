// Config del self-checkout — precios, apoderado y contacto.
// Un solo lugar para actualizar valores (inflación, cambios de domicilio).
//
// Subir un precio acá NO toca los pedidos ya creados: el importe de la
// preferencia de Mercado Pago queda fijado al crearla, y el desglose viaja
// congelado en `payload.pricing` (ver `pricingDesdeSnapshot()` más abajo). Lo
// que sí cambia al instante es lo que ve un lead con un link viejo de
// `/registrar`: la página es estática y se rebuildea con el precio nuevo.

import { ARANCEL_MARCA_NUEVA, ARANCEL_VIGENCIA } from '../../data/arancel-vigente';

export const PRICING = {
  /** Honorarios del registro, POR CLASE.
   *
   *  ⚠️ Es el RESTO de una cuenta, no un número elegido. Lo anclado es el
   *  TOTAL: los anuncios de Meta prometen $119.569 (ver `ads_descuento_119` y
   *  `ads_cupos_10` en `wa.ts`), así que
   *
   *      honorarios = 119.569 − arancel del INPI
   *
   *  A septiembre 2026: 119.569 − 40.569 = 79.000.
   *
   *  Como el arancel sube TODOS LOS MESES con la UMAPI, sostener el total
   *  significa absorber el aumento acá. Esto NO se recalcula solo: el workflow
   *  `aranceles-inpi` actualiza el arancel y el total se va por encima de lo
   *  que promete el anuncio hasta que alguien baje esta línea a mano. Cada vez
   *  que entre un commit de aranceles hay que rehacer la resta, o cambiar los
   *  anuncios para que no prometan un total exacto. */
  honorarios: 79_000,
  /** Upsell: Garantía de Devolución, POR CLASE (si el INPI deniega una clase,
   *  se devuelven los honorarios de esa clase) */
  garantia: 20_000,
  /** Arancel INPI: solicitud de registro, POR CLASE (100 UMAPIS).
   *
   *  NO se escribe a mano. El INPI ajusta la UMAPI todos los meses por IPC, y
   *  este valor lo baja del portal `scripts/actualizar-aranceles.mjs` todos los
   *  días desde GitHub Actions. Tocarlo acá lo pisa la próxima corrida. */
  arancelInpi: ARANCEL_MARCA_NUEVA,
  /** Mes de referencia del valor UMAPI mostrado (también automático) */
  arancelVigencia: ARANCEL_VIGENCIA,
  /** Precio tachado del "Precio especial" de la home. Es un ancla comercial,
   *  no un importe calculado: no sale de `honorarios + arancelInpi` ni se
   *  cobró nunca. Vive acá para que no vuelva a quedar escrito a mano en
   *  `index.astro` y desincronizado del precio real (pasó entre abril y
   *  agosto 2026: la home cotizaba $145.000 y el checkout cobraba $109.735). */
  precioLista: 210_000,
  /** Precio de lista de la vigilancia anual (se muestra tachado → gratis).
   *  TODO: igualar al precio real standalone de vigilante.unamarca.com.ar */
  vigilanciaLista: 30_000,
  /** Guía DIY (`/guia/<token>`). Precio único, no por clase ni por marca: es
   *  el mismo trámite explicado, sin importar cuántas marcas registre después.
   *  Se vende SOLO por WhatsApp, a leads que rebotaron por precio. */
  guia: 25_000,
} as const;

/** Máximo de clases POR MARCA; más que esto se deriva a WhatsApp */
export const MAX_CLASES = 5;

/** Máximo de marcas por pedido online; más que esto se deriva a WhatsApp */
export const MAX_MARCAS = 3;

/** Máximo de cotitulares de una marca. El INPI no pone tope, nosotros sí: con
 *  más que esto el paso 6 se vuelve interminable y la cadena de firmas, un
 *  seguimiento a mano. Más titulares se derivan a WhatsApp. */
export const MAX_TITULARES = 3;

/** Techo duro de líneas del pedido (una línea = una marca en una clase) */
export const MAX_LINEAS = MAX_MARCAS * MAX_CLASES;

/** Los tres tipos de marca que acepta el INPI en Marcas/Nuevas.
 *  · denominativa: solo el nombre, sin imagen. Es el caso por defecto.
 *  · mixta: nombre + logo. La denominación debe transcribir TODO el texto de
 *    la imagen, o la Dirección corrige la solicitud.
 *  · figurativa: solo el logo, SIN texto. No tiene denominación ante el INPI:
 *    el `nombre` que guardamos es una referencia interna nuestra. */
export type TipoMarca = 'denominativa' | 'mixta' | 'figurativa';

export const TIPOS_MARCA: { value: TipoMarca; label: string; ayuda: string }[] = [
  {
    value: 'denominativa',
    label: 'Denominativa',
    ayuda: 'Registramos el nombre de tu marca, sin logo. Es la protección más amplia.',
  },
  {
    value: 'mixta',
    label: 'Mixta',
    ayuda: 'Nombre y logo juntos. Después del pago te pedimos la imagen.',
  },
  {
    value: 'figurativa',
    label: 'Figurativa',
    ayuda: 'Solo el logo, sin texto. Después del pago te pedimos la imagen.',
  },
];

/** Normaliza cualquier forma histórica del tipo ('Denominativa', 'MIXTA', …).
 *  Todo lo que no se reconozca cae en denominativa, que es lo que se vendió
 *  hasta que existieron los otros dos tipos. */
export function normalizeTipoMarca(raw: unknown): TipoMarca {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === 'mixta' || v === 'figurativa' ? v : 'denominativa';
}

/** 'denominativa' → 'Denominativa' (para mostrar y para el payload legado v1) */
export function tipoMarcaLabel(t: TipoMarca): string {
  return TIPOS_MARCA.find(x => x.value === t)!.label;
}

/** Mixta y figurativa se presentan con imagen; denominativa no. */
export function requiereLogo(t: TipoMarca): boolean {
  return t !== 'denominativa';
}

/** La figurativa no lleva denominación ante el INPI: el nombre que guardamos
 *  es solo una referencia interna para identificar el pedido. */
export function tieneDenominacion(t: TipoMarca): boolean {
  return t !== 'figurativa';
}

/** Una marca del pedido. `descripcion` y `sitioWeb` se cargan post-pago (paso 5),
 *  igual que el logo y sus medidas cuando el tipo lo requiere. */
export interface MarcaPedido {
  nombre: string;
  tipo?: TipoMarca;
  clases: number[];
  descripcion?: string;
  sitioWeb?: string;
  /** Enunciación de colores del logo (obligatoria en mixta y figurativa) */
  colores?: string;
  /** Medidas declaradas del signo, en cm, con un decimal */
  alto?: number | null;
  ancho?: number | null;
  /** Key del JPG en R2 (bucket de logos). Null hasta que se sube. */
  logoKey?: string | null;
}

// ── Titulares ─────────────────────────────────────────────
// Una marca puede tener más de un dueño (socios de un emprendimiento, un
// matrimonio). El INPI pide el set completo de datos de CADA uno más su
// porcentaje de titularidad, y la suma tiene que dar exactamente 100.

export interface DomicilioTitular {
  pais: string;
  calle: string;
  numero: string;
  piso?: string;
  depto?: string;
  localidad: string;
  codigoPostal: string;
  provincia: string;
}

/** Un titular del pedido, tal como se guarda en `completion.titulares`. */
export interface TitularPedido {
  /** El checkout todavía no acepta personas jurídicas */
  tipoPersona: 'Humana';
  nombre: string;
  apellido: string;
  genero: string;
  estadoCivil: string;
  nombreConyuge?: string;
  documento: { tipo: string; numero: string };
  cuit: string;
  /** Adónde va el link para firmar la carta poder. Obligatorio en todos: es la
   *  única forma de completar el poder cuando el que llena el formulario no es
   *  el único dueño. */
  email: string;
  domicilio: DomicilioTitular;
  /** 0–100 con hasta dos decimales. La suma de todos da exactamente 100. */
  porcentaje: number;
  /** true en el titular que está completando el checkout: es el único que firma
   *  en el wizard. Al resto se le manda el link por email. */
  firmaAqui?: boolean;
}

/** Dos decimales: 3 titulares en partes iguales no cierran con enteros
 *  (33,34 + 33,33 + 33,33), y el INPI acepta el decimal. */
const PCT_FACTOR = 100;

export function redondearPorcentaje(n: number): number {
  return Math.round(n * PCT_FACTOR) / PCT_FACTOR;
}

/** Acepta coma o punto (el teclado en es-AR da coma). null si no es un
 *  porcentaje válido (fuera de 0–100 o no numérico). */
export function parsePorcentaje(raw: string): number | null {
  const n = parseFloat(String(raw ?? '').trim().replace('%', '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return redondearPorcentaje(n);
}

/** "50" / "33,34" — sin decimales inútiles y con la coma de es-AR */
export function formatPorcentaje(n: number): string {
  return redondearPorcentaje(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

export function sumaPorcentajes(titulares: { porcentaje?: number }[]): number {
  return redondearPorcentaje(titulares.reduce((s, t) => s + (t.porcentaje ?? 0), 0));
}

/** Reparto en partes iguales que SIEMPRE suma 100: el resto del redondeo se lo
 *  come el primero. Es el valor por defecto al agregar o quitar un titular —
 *  el caso real es "mitad y mitad" y así nadie tiene que hacer la cuenta. */
export function repartirPorcentajes(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor((100 / n) * PCT_FACTOR) / PCT_FACTOR;
  const partes = Array<number>(n).fill(base);
  partes[0] = redondearPorcentaje(100 - base * (n - 1));
  return partes;
}

/** "Ana Pérez" — el nombre con el que se identifica a un titular en avisos,
 *  emails y encabezados de tarjeta. */
export function nombreTitular(t: { nombre?: string; apellido?: string }): string {
  return `${String(t.nombre ?? '').trim()} ${String(t.apellido ?? '').trim()}`.trim();
}

// ── Logo: formato y medidas ───────────────────────────────
// El INPI acepta JPG/JPEG y pide ALTO y ANCHO en cm, con punto decimal. No
// declara mínimo ni máximo, así que el techo lo ponemos nosotros.

/** Lo que aceptamos que suba el cliente. Todo se convierte a JPG en el navegador. */
export const LOGO_ACCEPT = 'image/jpeg,image/png,image/webp';

/** Tope de resolución del JPG que generamos: hace que el peso deje de importar
 *  sin rechazarle el archivo a nadie. */
export const LOGO_MAX_PX = 2000;
export const LOGO_JPEG_QUALITY = 0.92;

/** Medida por defecto del lado mayor del signo, en cm. El otro lado sale de la
 *  proporción de la imagen. */
export const LOGO_CM_LADO_MAYOR = 5;
/** Techo nuestro, no del INPI */
export const LOGO_CM_MAX = 8;
export const LOGO_CM_MIN = 0.5;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Medidas declaradas a partir de los píxeles de la imagen ya recortada.
 *  Son una declaración del tamaño de publicación, no una medición del archivo:
 *  lo único que tiene que ser cierto es la proporción. Por eso se fija el lado
 *  mayor en LOGO_CM_LADO_MAYOR y el menor se deriva. Nunca se usa el DPI del
 *  metadato: los PNG de Canva/Illustrator lo traen arbitrario. */
export function medidasDesdePx(anchoPx: number, altoPx: number): { alto: number; ancho: number } {
  if (!(anchoPx > 0) || !(altoPx > 0)) {
    return { alto: LOGO_CM_LADO_MAYOR, ancho: LOGO_CM_LADO_MAYOR };
  }
  const mayorPx = Math.max(anchoPx, altoPx);
  const menorPx = Math.min(anchoPx, altoPx);
  const menorCm = Math.max(LOGO_CM_MIN, round1(LOGO_CM_LADO_MAYOR * (menorPx / mayorPx)));
  return anchoPx >= altoPx
    ? { ancho: LOGO_CM_LADO_MAYOR, alto: menorCm }
    : { alto: LOGO_CM_LADO_MAYOR, ancho: menorCm };
}

/** "5" / "3.2" — el INPI usa punto decimal, no coma */
export function formatCm(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  return String(round1(n));
}

/** Acepta coma o punto (el teclado en es-AR da coma) y devuelve null si no es
 *  un número válido dentro del rango. */
export function parseCm(raw: string): number | null {
  const n = parseFloat(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  const v = round1(n);
  return v >= LOGO_CM_MIN && v <= LOGO_CM_MAX ? v : null;
}

/** Líneas facturables del pedido: la suma de las clases de todas las marcas.
 *  Marca A en 2 clases + Marca B en 2 clases = 4 líneas. */
export function contarLineas(marcas: { clases?: number[] }[]): number {
  return marcas.reduce((n, m) => n + (m.clases?.length ?? 0), 0);
}

/** Precios por clase que rigen un pedido. En uno ya creado son los de aquel
 *  día, no los de `PRICING`. */
export interface UnitPricing {
  honorarios: number;
  garantia: number;
  arancelInpi: number;
}

/** Totales del pedido para N líneas (marca × clase). Todos los conceptos
 *  escalan por línea, sin descuento por volumen. Con 0 líneas se muestra el
 *  precio de 1 (base del resumen antes de elegir clases). */
export function computeOrderPricing(lineas: number, garantia: boolean) {
  const n = Math.min(MAX_LINEAS, Math.max(1, Math.floor(lineas) || 1));
  const honorarios = PRICING.honorarios * n;
  const garantiaMonto = garantia ? PRICING.garantia * n : 0;
  const arancelInpi = PRICING.arancelInpi * n;
  // Tipado explícito: `PRICING` es `as const`, y sin esto los unitarios quedan
  // como los literales de hoy y ningún precio viejo entra en `OrderPricing`.
  const unit: UnitPricing = {
    honorarios: PRICING.honorarios,
    garantia: PRICING.garantia,
    arancelInpi: PRICING.arancelInpi,
  };
  return {
    lineas: n,
    /** Alias legado: pedidos v1 (una sola marca) guardaban acá el N° de clases */
    clases: n,
    honorarios,
    garantia: garantiaMonto,
    arancelInpi,
    total: honorarios + garantiaMonto + arancelInpi,
    /** Precios unitarios vigentes al calcular. Van al snapshot del pedido
     *  (`payload.pricing`) para que al retomarlo se vea lo que se cobró y no la
     *  lista de precios de hoy. Ver `pricingDesdeSnapshot()`. */
    unit,
  };
}

export type OrderPricing = ReturnType<typeof computeOrderPricing>;

/** Rehidrata el pricing congelado de un pedido ya creado. Es la única forma
 *  correcta de mostrarle un importe a alguien que vuelve a su pedido: los
 *  precios de `PRICING` son los de HOY, y el cliente pagó los de aquel día.
 *
 *  Los snapshots anteriores a `unit` (todo pedido creado antes de agosto 2026)
 *  no traen los unitarios: se deducen dividiendo por las líneas. El único que
 *  no se puede deducir es la garantía cuando no se contrató —el monto es 0—, y
 *  ahí queda el precio de hoy, que solo alimenta el texto del upsell.
 *
 *  Devuelve null si no hay snapshot utilizable (pedido sin `pricing`): el
 *  llamador cae en el cálculo normal. */
export function pricingDesdeSnapshot(raw: unknown): OrderPricing | null {
  const s = raw as Record<string, unknown> | null | undefined;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const total = num(s?.total);
  if (!s || total === null) return null;

  const lineas = Math.max(1, Math.floor(num(s.lineas) ?? num(s.clases) ?? 1));
  const honorarios = num(s.honorarios) ?? 0;
  const garantia = num(s.garantia) ?? 0;
  const arancelInpi = num(s.arancelInpi) ?? 0;
  const unit = (s.unit ?? {}) as Record<string, unknown>;

  return {
    lineas,
    clases: lineas,
    honorarios,
    garantia,
    arancelInpi,
    total,
    unit: {
      honorarios: num(unit.honorarios) ?? honorarios / lineas,
      garantia: num(unit.garantia) ?? (garantia > 0 ? garantia / lineas : PRICING.garantia),
      arancelInpi: num(unit.arancelInpi) ?? arancelInpi / lineas,
    },
  };
}

/** "Clase 25" / "Clases 9, 25 y 35" / "Clase –" (placeholder) */
export function clasesTexto(clases: number[], vacio = 'Clase –'): string {
  if (clases.length === 0) return vacio;
  if (clases.length === 1) return `Clase ${clases[0]}`;
  const nums = [...clases].sort((a, b) => a - b);
  const last = nums.pop();
  return `Clases ${nums.join(', ')} y ${last}`;
}

/** "1 clase" / "4 clases en 2 marcas" — la unidad de precio del resumen */
export function lineasTexto(lineas: number, marcas: number): string {
  const l = `${lineas} ${lineas === 1 ? 'clase' : 'clases'}`;
  return marcas > 1 ? `${l} en ${marcas} marcas` : l;
}

/** Cuenta para el pago por transferencia (alternativa a Mercado Pago).
 *  Se muestra en el paso 4, en el banner del paso 5, en la confirmación y en el
 *  email al cliente: el usuario transfiere después, desde su home banking. */
export const TRANSFERENCIA = {
  alias: 'ALFIL.MARCO.PAPEL',
  titular: 'Michael Alan Simmons',
  banco: 'Banco Galicia',
} as const;

/** Datos del apoderado que figura en la carta poder */
export const APODERADO = {
  tratamiento: 'Dr.',
  nombre: 'Michael Alan Simmons',
  dni: '38.536.168',
  cuit: '20-38536168-9',
  domicilio: 'Juan Francisco Seguí 4635, Ciudad Autónoma de Buenos Aires',
} as const;

// Los números y los mensajes de WhatsApp viven en src/lib/wa.ts, que es el
// contrato con el parser de atribución del CRM. No los redefinas acá.

export const PROVINCIAS = [
  'Buenos Aires', 'Catamarca', 'Chaco', 'Chubut',
  'Ciudad Autónoma de Buenos Aires', 'Córdoba', 'Corrientes',
  'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja',
  'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta',
  'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe',
  'Santiago del Estero', 'Tierra del Fuego', 'Tucumán',
] as const;

export function formatARS(n: number): string {
  return '$' + n.toLocaleString('es-AR');
}
