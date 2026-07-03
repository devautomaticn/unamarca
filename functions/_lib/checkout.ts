// Helpers compartidos del checkout (carpeta _lib: no se publica como ruta).
import { PRICING } from '../../src/lib/checkout/constants';

// Tipos mínimos de D1 (evitamos la dependencia @cloudflare/workers-types,
// consistente con el resto de functions/ que no la usa)
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}
export interface D1Database {
  prepare(query: string): D1Statement;
}

export interface CheckoutEnv {
  DB: D1Database;
  MP_ACCESS_TOKEN: string;
  MP_WEBHOOK_SECRET: string;
}

export async function ensureSchema(db: D1Database): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS orders (
      ref TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending_payment',
      payment_id TEXT,
      payment_status TEXT,
      mp_preference_id TEXT,
      payload TEXT NOT NULL,
      completion TEXT,
      completed_at TEXT
    )
  `).run();
}

/** Ref no adivinable: UM-YYYYMMDD-XXXXXXXX (base36). Es también la "llave" de
 *  lectura del pedido, por eso no usa un sufijo corto numérico. */
export function newOrderRef(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const rand = Array.from(bytes, b => (b % 36).toString(36)).join('').toUpperCase();
  return `UM-${ymd}-${rand}`;
}

/** Precios calculados SIEMPRE en el servidor — nunca se confía en el cliente */
export function computePricing(garantia: boolean) {
  return {
    honorarios: PRICING.honorarios,
    garantia: garantia ? PRICING.garantia : 0,
    arancelInpi: PRICING.arancelInpi,
    total: PRICING.honorarios + (garantia ? PRICING.garantia : 0) + PRICING.arancelInpi,
  };
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function hexEncode(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

/** HMAC-SHA256 en hex, con Web Crypto (disponible en Workers sin flags) */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return hexEncode(sig);
}
