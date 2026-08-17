// Config del self-checkout — precios, apoderado y contacto.
// Un solo lugar para actualizar valores (inflación, UMAPI, cambios de domicilio).

export const PRICING = {
  /** Honorarios del registro, POR CLASE */
  honorarios: 40_000,
  /** Upsell: Garantía de Devolución, POR CLASE (si el INPI deniega una clase,
   *  se devuelven los honorarios de esa clase) */
  garantia: 7_000,
  /** Arancel INPI: solicitud de registro, POR CLASE (100 UMAPIS, agosto 2026) */
  arancelInpi: 39_735,
  /** Mes de referencia del valor UMAPI mostrado */
  arancelVigencia: 'agosto 2026',
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

/** Totales del pedido para N líneas (marca × clase). Todos los conceptos
 *  escalan por línea, sin descuento por volumen. Con 0 líneas se muestra el
 *  precio de 1 (base del resumen antes de elegir clases). */
export function computeOrderPricing(lineas: number, garantia: boolean) {
  const n = Math.min(MAX_LINEAS, Math.max(1, Math.floor(lineas) || 1));
  const honorarios = PRICING.honorarios * n;
  const garantiaMonto = garantia ? PRICING.garantia * n : 0;
  const arancelInpi = PRICING.arancelInpi * n;
  return {
    lineas: n,
    /** Alias legado: pedidos v1 (una sola marca) guardaban acá el N° de clases */
    clases: n,
    honorarios,
    garantia: garantiaMonto,
    arancelInpi,
    total: honorarios + garantiaMonto + arancelInpi,
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
