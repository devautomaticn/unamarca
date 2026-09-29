// ────────────────────────────────────────────────────────────────────────────
//  ORIGEN DEL PEDIDO — por dónde llegó quien compra
//
//  GA4 ya separa Google Ads de orgánico, pero en totales: no dice de qué canal
//  vino ESTE pedido. Esto lo guarda en una cookie y lo pega al pedido cuando se
//  crea, así queda en `orders.payload.origen` y en los emails al estudio.
//
//    página (cualquiera) ──► POST /api/origen ──► cookie `um_origen`
//                                                     │
//    POST /api/checkout/order ◄───────────────────────┘  payload.origen
//
//  · La cookie la escribe el SERVIDOR, no `document.cookie`. No es prolijidad:
//    Safari recorta a 24 horas las cookies escritas por JavaScript cuando la
//    visita llega desde un anuncio (URL con gclid), que es justo el caso que
//    queremos medir. Las que llegan en un `Set-Cookie` no tienen ese tope.
//  · Se guardan tres toques y no uno. Quien hace clic en un anuncio y vuelve a
//    la semana buscando "unamarca" en Google tiene como último ingreso una
//    búsqueda orgánica: sin `anuncio`, el clic pago se perdería.
//  · Nada de esto identifica a una persona: es el canal, no quién. De la URL se
//    guarda sólo el path (el query de un deep link a /registrar lleva la marca,
//    el email y el teléfono) y del referrer sólo el host.
//
//  Este módulo es puro y corre igual en el navegador y en el Worker. Lo que
//  llega del cliente —el cuerpo del POST y la propia cookie, que el usuario
//  puede editar— pasa SIEMPRE por `sanitizarToque()`, y el canal se recalcula
//  del lado del servidor: nunca se confía en el que venga escrito.
// ────────────────────────────────────────────────────────────────────────────

import { WA_CANAL_COOKIE, esWaCanal, type WaCanal } from './waCanal';

export const ORIGEN_COOKIE = 'um_origen';

/** 90 días: la ventana de conversión más larga que admite Google Ads. Pasado
 *  eso un gclid ya no sirve para atribuir nada. */
export const ORIGEN_MAX_AGE = 90 * 24 * 60 * 60;

/** Tope del valor de la cookie ya codificado. El límite real es ~4096 bytes
 *  contando nombre y atributos. */
const COOKIE_MAX = 3600;

export const CLICK_IDS = ['gclid', 'gbraid', 'wbraid', 'msclkid', 'fbclid'] as const;
export const UTMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

type ClickId = typeof CLICK_IDS[number];
type Utm = typeof UTMS[number];

export type Canal =
  | 'google_ads'
  | 'bing_ads'
  /** Otro medio pago, declarado por UTM (`utm_medium=cpc`, `paid_social`…). */
  | 'pago'
  /** UTM sin medio pago: un email, un QR, un link en una bio. */
  | 'campania'
  /** Link tocado en Facebook o Instagram. Con `fbclid` solo no se puede saber
   *  si era un anuncio o una publicación. */
  | 'meta'
  | 'ia'
  | 'organico'
  | 'social'
  | 'referido'
  | 'directo';

export type Toque = {
  /** Cuándo fue, en ISO. Lo pone el servidor: el reloj del cliente no cuenta. */
  ts: string;
  canal: Canal;
  /** Host de la página anterior. */
  referrer?: string;
  /** Path por el que entró al sitio, sin query. */
  landing?: string;
} & Partial<Record<ClickId | Utm, string>>;

export interface Origen {
  /** La primera vez que llegó con un origen reconocible. */
  primero: Toque;
  /** La última. Una visita directa no lo pisa (ver `esSignificativo`). */
  ultimo: Toque;
  /** El último clic en un anuncio, si hubo alguno en la ventana. */
  anuncio?: Toque;
}

const CANALES_PAGOS: Canal[] = ['google_ads', 'bing_ads', 'pago'];

const MEDIO_PAGO = /^(cpc|ppc|cpm|cpv|paid|paidsearch|paid[_-]?social|display|banner|ads?)$/i;

// ── Referrers ───────────────────────────────────────────────────────────────

/** Volver de pagar no es llegar de ningún lado: sin esto, todo pedido posterior
 *  en el mismo navegador figuraría como "referido por Mercado Pago". */
const PASARELAS = /(^|\.)(mercadopago|mercadolibre|mercadopago-cdn)\.[a-z.]+$/;

const IA = /(^|\.)(chatgpt\.com|chat\.openai\.com|perplexity\.ai|gemini\.google\.com|copilot\.microsoft\.com|claude\.ai)$/;

const SOCIAL = /(^|\.)(facebook\.com|instagram\.com|t\.co|x\.com|twitter\.com|linkedin\.com|lnkd\.in|youtube\.com|tiktok\.com|pinterest\.[a-z.]+|reddit\.com)$/;

function esBuscador(host: string): boolean {
  // `google.com.ar` y `www.google.com` sí; `mail.google.com` no.
  if (/^(www\.)?google\.[a-z.]+$/.test(host)) return true;
  if (/^(www\.|[a-z]{2}\.)?bing\.com$/.test(host)) return true;
  if (/(^|\.)search\.yahoo\.com$/.test(host)) return true;
  if (/^(www\.)?(duckduckgo\.com|ecosia\.org|startpage\.com)$/.test(host)) return true;
  if (/^(www\.)?yandex\.[a-z.]+$/.test(host)) return true;
  if (host === 'search.brave.com') return true;
  // La app de Google en Android no manda una URL sino su id de paquete.
  return host === 'android-app://com.google.android.googlequicksearchbox';
}

function esPropio(host: string, hostPropio: string): boolean {
  if (host === hostPropio) return true;
  return /(^|\.)unamarca\.(com\.ar|pages\.dev)$/.test(host);
}

/** Host de un referrer, en minúsculas. De `android-app://paquete/` conserva el
 *  esquema, que es lo único que lo distingue de un dominio. */
export function hostDeReferrer(referrer: string): string {
  if (!referrer) return '';
  try {
    const u = new URL(referrer);
    if (u.protocol === 'android-app:') return `android-app://${u.hostname.toLowerCase()}`;
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.hostname.toLowerCase();
  } catch {
    return '';
  }
}

// ── Lectura y saneado ───────────────────────────────────────────────────────

/** Lo que el navegador manda al servidor: los parámetros tal cual vinieron. */
export function toqueCrudo(href: string, referrer: string): Record<string, string> {
  const crudo: Record<string, string> = {};
  try {
    const u = new URL(href);
    for (const k of [...CLICK_IDS, ...UTMS]) {
      const v = u.searchParams.get(k);
      if (v) crudo[k] = v;
    }
    crudo.landing = u.pathname;
  } catch { /* una URL que no se puede leer no aporta nada */ }
  const host = hostDeReferrer(referrer);
  if (host) crudo.referrer = host;
  return crudo;
}

function texto(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  // Sin caracteres de control: esto termina en un email y en una cookie.
  return v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function clasificar(t: Omit<Toque, 'canal' | 'ts'>): Canal {
  if (t.gclid || t.gbraid || t.wbraid) return 'google_ads';
  if (t.msclkid) return 'bing_ads';
  if (t.utm_medium && MEDIO_PAGO.test(t.utm_medium)) return 'pago';
  if (t.utm_medium && /^organic$/i.test(t.utm_medium)) return 'organico';
  if (t.utm_source || t.utm_medium || t.utm_campaign) return 'campania';
  if (t.fbclid) return 'meta';
  const r = t.referrer;
  if (!r) return 'directo';
  if (IA.test(r)) return 'ia';
  if (esBuscador(r)) return 'organico';
  if (SOCIAL.test(r)) return 'social';
  return 'referido';
}

/**
 * Deja de un toque sólo lo que conocemos, recortado, y le calcula el canal.
 * `ts` se usa si el crudo no trae uno válido (el cuerpo del POST nunca lo trae;
 * la cookie sí).
 */
export function sanitizarToque(
  raw: unknown,
  opts: { ts: string; hostPropio: string },
): Toque | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const t: Omit<Toque, 'canal' | 'ts'> = {};

  for (const k of CLICK_IDS) {
    const v = texto(r[k], 200);
    // Los ids de clic son base64url. Cualquier otra cosa es basura o un intento.
    if (v && /^[A-Za-z0-9_.\-]+$/.test(v)) t[k] = v;
  }
  for (const k of UTMS) {
    const v = texto(r[k], 80);
    if (v) t[k] = v;
  }

  const referrer = texto(r.referrer, 100).toLowerCase();
  if (
    referrer
    && /^(android-app:\/\/)?[a-z0-9.\-]+$/.test(referrer)
    && !esPropio(referrer, opts.hostPropio)
    && !PASARELAS.test(referrer)
  ) {
    t.referrer = referrer;
  }

  const landing = texto(r.landing, 120);
  if (landing.startsWith('/')) t.landing = landing.split(/[?#]/)[0];

  const tsCrudo = texto(r.ts, 40);
  const ts = tsCrudo && !Number.isNaN(Date.parse(tsCrudo)) ? tsCrudo : opts.ts;

  return { ts, canal: clasificar(t), ...t };
}

/** Una visita directa no dice nada y no pisa lo que ya se sabía: si no, quien
 *  llegó por un anuncio y después tipeó la URL quedaría como "directo". */
export function esSignificativo(t: Toque): boolean {
  return t.canal !== 'directo';
}

export function esPago(t: Toque): boolean {
  return CANALES_PAGOS.includes(t.canal);
}

/** Dos toques son el mismo si coinciden en todo menos la fecha: recargar la
 *  página del anuncio no es un ingreso nuevo. */
function mismoToque(a: Toque, b: Toque): boolean {
  const claves = ['canal', 'referrer', 'landing', ...CLICK_IDS, ...UTMS] as const;
  return claves.every(k => (a[k] ?? '') === (b[k] ?? ''));
}

/** Segundos que le quedan a un clic pago antes de vencer; 0 si ya venció. */
function vigencia(anuncio: Toque, ahora: string): number {
  const edad = (Date.parse(ahora) - Date.parse(anuncio.ts)) / 1000;
  if (Number.isNaN(edad)) return 0;
  return Math.max(0, Math.floor(ORIGEN_MAX_AGE - edad));
}

/**
 * Suelta el clic pago si ya pasó la ventana. Hace falta porque la cookie se
 * renueva con cada ingreso: a quien vuelve todos los meses no se le vence
 * nunca, y un anuncio de hace medio año seguiría figurando en el pedido.
 */
export function vigente(origen: Origen, ahora: string): Origen {
  if (!origen.anuncio || vigencia(origen.anuncio, ahora) > 0) return origen;
  const { anuncio: _vencido, ...resto } = origen;
  return resto;
}

export function combinar(previo: Origen | null, nuevo: Toque): Origen {
  if (!previo) {
    return { primero: nuevo, ultimo: nuevo, ...(esPago(nuevo) ? { anuncio: nuevo } : {}) };
  }
  const base = vigente(previo, nuevo.ts);
  if (mismoToque(base.ultimo, nuevo)) return base;
  const anuncio = esPago(nuevo) ? nuevo : base.anuncio;
  return { primero: base.primero, ultimo: nuevo, ...(anuncio ? { anuncio } : {}) };
}

// ── Cookie ──────────────────────────────────────────────────────────────────

function valorCookie(header: string | null, nombre: string): string {
  if (!header) return '';
  for (const parte of header.split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nombre) return parte.slice(i + 1).trim();
  }
  return '';
}

/** Lee el origen del header `Cookie`. Devuelve `null` si no hay, si está rota o
 *  si alguien la editó hasta dejarla irreconocible. */
export function leerCookie(header: string | null, hostPropio: string): Origen | null {
  const valor = valorCookie(header, ORIGEN_COOKIE);
  if (!valor) return null;
  try {
    const o = JSON.parse(decodeURIComponent(valor));
    const opts = { ts: new Date().toISOString(), hostPropio };
    const primero = sanitizarToque(o?.primero, opts);
    const ultimo = sanitizarToque(o?.ultimo, opts);
    if (!primero || !ultimo) return null;
    const anuncio = sanitizarToque(o?.anuncio, opts);
    return vigente(
      { primero, ultimo, ...(anuncio && esPago(anuncio) ? { anuncio } : {}) },
      opts.ts,
    );
  } catch {
    return null;
  }
}

function sin(t: Toque, claves: readonly string[]): Toque {
  const copia = { ...t } as Record<string, unknown>;
  for (const k of claves) delete copia[k];
  return copia as Toque;
}

/** Valor de la cookie. Si no entra se va soltando lo menos útil, de a poco: lo
 *  último que se pierde es el id del clic, que es lo que no se puede rearmar. */
function codificar(origen: Origen): string {
  const recortes: (readonly string[])[] = [
    [],
    ['utm_content', 'utm_term'],
    ['utm_content', 'utm_term', 'fbclid'],
    ['utm_content', 'utm_term', 'fbclid', 'referrer', 'landing'],
    // Un UTM con acentos pesa seis veces lo que mide: 80 letras son 480 bytes.
    [...UTMS, 'fbclid', 'referrer', 'landing'],
  ];
  let valor = '';
  for (const claves of recortes) {
    valor = encodeURIComponent(JSON.stringify({
      primero: sin(origen.primero, claves),
      ultimo: sin(origen.ultimo, claves),
      ...(origen.anuncio ? { anuncio: sin(origen.anuncio, claves) } : {}),
    }));
    if (valor.length <= COOKIE_MAX) return valor;
  }
  return valor.length <= COOKIE_MAX ? valor : '';
}

/**
 * Arma el `Set-Cookie`. En producción va con `Domain=unamarca.com.ar` para que
 * también la reciban los subdominios (las herramientas de Vigilante); en
 * localhost y en los previews de Pages no lleva dominio.
 */
export function serializarCookie(origen: Origen, url: URL): string {
  const valor = codificar(origen);
  if (!valor) return '';
  return [`${ORIGEN_COOKIE}=${valor}`, `Max-Age=${ORIGEN_MAX_AGE}`, 'HttpOnly', ...atributos(url)].join('; ');
}

function atributos(url: URL): string[] {
  const partes = ['Path=/', 'SameSite=Lax'];
  if (url.protocol === 'https:') partes.push('Secure');
  if (/(^|\.)unamarca\.com\.ar$/.test(url.hostname)) partes.push('Domain=unamarca.com.ar');
  return partes;
}

/** El canal que viaja en los mensajes de WhatsApp (ver src/lib/waCanal.ts):
 *  el del último clic pago vigente, si es uno de los que tienen saludo propio. */
export function canalWa(origen: Origen | null, ahora: string): WaCanal | null {
  const anuncio = origen && vigente(origen, ahora).anuncio;
  return anuncio && esWaCanal(anuncio.canal) ? anuncio.canal : null;
}

/**
 * `Set-Cookie` de la cookie de canal, o '' si no corresponde ninguna.
 *
 * Es aparte de `um_origen` porque esa es `HttpOnly` y ésta la tiene que leer el
 * navegador para elegir el mensaje. Lleva sólo el nombre del canal, ningún id.
 * Vence junto con el clic que la originó, no 90 días después de la última
 * visita.
 */
export function serializarCookieCanal(origen: Origen, url: URL, ahora: string): string {
  const canal = canalWa(origen, ahora);
  if (!canal || !origen.anuncio) return '';
  return [`${WA_CANAL_COOKIE}=${canal}`, `Max-Age=${vigencia(origen.anuncio, ahora)}`, ...atributos(url)].join('; ');
}

// ── Para mostrar ────────────────────────────────────────────────────────────

const CANAL_LABEL: Record<Canal, string> = {
  google_ads: 'Google Ads',
  bing_ads: 'Microsoft Ads (Bing)',
  pago: 'Anuncio',
  campania: 'Campaña',
  meta: 'Facebook / Instagram',
  ia: 'Asistente de IA',
  organico: 'Búsqueda orgánica',
  social: 'Red social',
  referido: 'Otro sitio',
  directo: 'Directo',
};

/** "Google Ads · campaña registro-marca", "Búsqueda orgánica (google.com)". */
export function canalLabel(t: Toque): string {
  let label = CANAL_LABEL[t.canal];
  if (t.canal === 'pago' || t.canal === 'campania') {
    const fuente = [t.utm_source, t.utm_medium].filter(Boolean).join(' / ');
    if (fuente) label += ` (${fuente})`;
  } else if (t.referrer && !esPago(t)) {
    label += ` (${t.referrer.replace(/^android-app:\/\//, 'app ')})`;
  }
  if (t.utm_campaign) label += ` · campaña ${t.utm_campaign}`;
  return label;
}

/** El id del clic de un toque pago, con su nombre: es lo que pide Google Ads
 *  para importar una venta como conversión offline. */
export function clickId(t: Toque): { nombre: string; valor: string } | null {
  for (const k of CLICK_IDS) {
    if (t[k]) return { nombre: k, valor: t[k]! };
  }
  return null;
}
