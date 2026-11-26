// Promociones del checkout (vigilant #313). SÓLO SERVIDOR: la página nunca
// importa este módulo, así que ni los códigos ni los precios de una promo
// viajan en el JavaScript público.
//
// Una promo no tiene un «código» fijo que se pueda filtrar, adivinar o
// scrapear. Lo que llega en el link (`?promo=`) es un TOKEN firmado, distinto
// en cada link, que arma Sofía del lado de Vigilant (clearance_agent/
// promociones.py, `token_checkout`):
//
//     <id>.<exp>.<nonce>.<firma>
//     firma = base64url(HMAC-SHA256(clave, "<id>.<exp>.<nonce>"))
//     clave = HMAC-SHA256(PEDIDOS_API_KEY, "unamarca-promo-v1")
//
// La clave se deriva del secreto que las dos puntas ya comparten (el de
// /api/checkout/pagados) con una etiqueta propia: una firma de promo no sirve
// como clave de la API ni al revés, y no hay un secreto nuevo que cargar.
//
// FALLA CERRADO. Cualquier cosa rara —sin secreto, token mal formado, firma
// que no coincide, vencido, promo desconocida, medio de pago que no aplica,
// un monto incoherente, una excepción— devuelve null, y null es el precio de
// siempre. El flujo sigue igual: un token inválido nunca frena una compra, y
// nunca aplica un descuento.
//
// Este archivo no importa nada del proyecto (se prueba con
// `node --experimental-strip-types scripts/test-promos.mjs`).

export type MedioPromo = 'mercadopago' | 'transferencia';

export interface Promo {
  id: string;
  nombre: string;
  /** Total por clase, arancel del INPI incluido. */
  porClase: number;
  /** Último instante en que vale, ISO en UTC. */
  hasta: string;
  hastaTexto: string;
  medios: MedioPromo[];
}

export const PROMOS: Promo[] = [
  {
    id: 'bf2026',
    nombre: 'Black Friday',
    porClase: 99_000,
    hasta: '2026-12-01T02:59:59Z', // lunes 30/11 23:59 (ART)
    hastaTexto: 'el lunes 30/11 a las 23:59',
    medios: ['transferencia'],
  },
];

const ETIQUETA = 'unamarca-promo-v1';
const TOKEN_MAX = 200;
const RE_ID = /^[a-z0-9]{1,20}$/;
const RE_EXP = /^\d{10}$/;
const RE_NONCE = /^[A-Za-z0-9_-]{12,32}$/;
const RE_FIRMA = /^[A-Za-z0-9_-]{43}$/;

const enc = new TextEncoder();

async function hmac(clave: Uint8Array, mensaje: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', clave as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(mensaje)));
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function igualSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

/** La clave de firma, derivada del secreto compartido. null si el secreto no
 *  está o es corto (una clave mal cargada no abre ninguna promo). */
async function clave(secreto: string | undefined): Promise<Uint8Array | null> {
  if (typeof secreto !== 'string' || secreto.length < 32) return null;
  return hmac(enc.encode(secreto), ETIQUETA);
}

/** La promo del token si es auténtico y todavía vale; si no, null. */
export async function verificarToken(
  token: unknown, secreto: string | undefined, ahora: Date = new Date(),
): Promise<{ promo: Promo; nonce: string } | null> {
  try {
    if (typeof token !== 'string' || token.length > TOKEN_MAX) return null;
    const partes = token.trim().split('.');
    if (partes.length !== 4) return null;
    const [id, exp, nonce, firma] = partes;
    if (!RE_ID.test(id) || !RE_EXP.test(exp) || !RE_NONCE.test(nonce) || !RE_FIRMA.test(firma)) return null;
    const promo = PROMOS.find(p => p.id === id);
    if (!promo) return null;
    const expMs = Number(exp) * 1000;
    const hastaMs = Date.parse(promo.hasta);
    // Un token no puede durar más que su promo, aunque esté bien firmado.
    if (!Number.isFinite(expMs) || !Number.isFinite(hastaMs) || expMs > hastaMs) return null;
    if (ahora.getTime() > expMs) return null;
    const k = await clave(secreto);
    if (!k) return null;
    const esperada = b64url(await hmac(k, `${id}.${exp}.${nonce}`));
    if (!igualSeguro(esperada, firma)) return null;
    return { promo, nonce };
  } catch {
    return null;
  }
}

export function aplicaConMedio(p: Promo | null | undefined, medio: unknown): boolean {
  return !!p && typeof medio === 'string' && (p.medios as string[]).includes(medio);
}

/** Honorarios por clase con la promo, o null si el número no es coherente:
 *  tiene que ser positivo y MENOR que los de siempre (una promo que no
 *  descuenta o que deja honorarios negativos es un error de carga). */
export function honorariosPromo(p: Promo, arancelInpi: number, honorariosLista: number): number | null {
  const h = Math.round(p.porClase - arancelInpi);
  if (!Number.isFinite(h) || h <= 0 || h >= honorariosLista) return null;
  return h;
}

/** Todo junto, para el pedido: los honorarios de la promo si el token es
 *  auténtico, vigente, aplica con este medio de pago y da un número coherente.
 *  Cualquier otra cosa: null = precio de siempre. */
export async function promoDelPedido(
  token: unknown, medio: unknown, secreto: string | undefined,
  arancelInpi: number, honorariosLista: number, ahora: Date = new Date(),
): Promise<{ promo: Promo; nonce: string; honorarios: number } | null> {
  try {
    const v = await verificarToken(token, secreto, ahora);
    if (!v || !aplicaConMedio(v.promo, medio)) return null;
    const honorarios = honorariosPromo(v.promo, arancelInpi, honorariosLista);
    return honorarios === null ? null : { ...v, honorarios };
  } catch {
    return null;
  }
}
