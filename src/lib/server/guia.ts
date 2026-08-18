// Guías DIY: modelo de datos y helpers compartidos por los endpoints.
//
// La guía se vende SOLO por WhatsApp. El agente (que vive en otro proyecto)
// crea el pedido, manda el link de pago y el link de la guía en el mismo
// mensaje, y no vuelve a intervenir salvo que el cliente pague por
// transferencia. Ver docs/spec_guia_agente.md para el contrato completo.
//
// ⚠️ EL TOKEN ES LA CREDENCIAL. No hay login. Un token por compra, revocable.
// Se entrega antes del pago a propósito: la página existe desde el minuto cero
// y muestra "pendiente" hasta que `pagado_en` tenga valor. Así el cliente ya
// tiene su URL guardada y no depende del redirect de Mercado Pago ni del mail.

import type { D1Database } from '@/lib/server/checkout';

/** Estados posibles de un pedido de guía. No hay 'cancelado': un pedido sin
 *  pagar simplemente se queda pendiente para siempre, no molesta a nadie. */
export type EstadoGuia = 'pendiente' | 'pagado' | 'revocado';

/** Cómo se acreditó el pago. `transferencia` la confirma el agente mirando el
 *  comprobante; `mercadopago` la confirma el webhook. */
export type OrigenPago = 'mercadopago' | 'transferencia';

export interface MarcaGuia {
  nombre: string;
  tipo: string;
  alcance?: string;
}

export interface FilaGuia {
  ref: string;
  token: string;
  email: string;
  marcas: string;          // JSON de MarcaGuia[]
  creado_en: string;
  pagado_en: string | null;
  origen_pago: string | null;
  pago_nota: string | null;
  mp_preference_id: string | null;
  revocado_en: string | null;
  accesos: number;
  ultimo_acceso: string | null;
}

export interface GuiaEnv {
  DB: D1Database;
  /** Secreto del agente. Sin esto los endpoints no atienden a nadie. */
  GUIA_API_KEY?: string;
  MP_ACCESS_TOKEN?: string;
  RESEND_API_KEY?: string;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Verifica el Bearer del agente. Devuelve una Response si hay que rechazar, o
 * null si puede seguir.
 *
 * Si `GUIA_API_KEY` no está configurada se rechaza TODO: es preferible que el
 * agente reciba un 503 explícito a que un entorno sin secreto quede abierto.
 */
export function rechazoDeAuth(request: Request, env: GuiaEnv): Response | null {
  if (!env.GUIA_API_KEY) {
    return json({ error: 'GUIA_API_KEY no configurada en este entorno.' }, 503);
  }
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  // Comparación de tiempo constante: el secreto no se filtra por timing.
  if (!token || !igualSeguro(token, env.GUIA_API_KEY)) {
    return json({ error: 'Credencial inválida.' }, 401);
  }
  return null;
}

function igualSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

/** Ref legible para hablar del pedido en el chat: GU-YYYYMMDD-XXXXXX. */
export function nuevaRef(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `GU-${ymd}-${aleatorio(6).toUpperCase()}`;
}

/** Token de acceso. 26 caracteres de alfabeto sin ambigüedades (no hay 0/O ni
 *  1/l): el cliente puede llegar a tipearlo desde una captura. */
export function nuevoToken(): string {
  return aleatorio(26);
}

const ALFABETO = 'abcdefghijkmnopqrstuvwxyz23456789';

function aleatorio(largo: number): string {
  const bytes = new Uint8Array(largo);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => ALFABETO[b % ALFABETO.length]).join('');
}

/** Crea la tabla si no existe. Se llama en cada endpoint, como `ensureSchema`
 *  del checkout: D1 no tiene migraciones y esto es idempotente y barato. */
export async function asegurarTabla(db: D1Database): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS guias (
      ref TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      marcas TEXT NOT NULL DEFAULT '[]',
      creado_en TEXT NOT NULL,
      pagado_en TEXT,
      origen_pago TEXT,
      pago_nota TEXT,
      mp_preference_id TEXT,
      revocado_en TEXT,
      accesos INTEGER NOT NULL DEFAULT 0,
      ultimo_acceso TEXT
    )
  `).run();
  // Buscar por token es lo que hace cada visita a la guía; por email, la
  // recuperación del agente.
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_guias_token ON guias(token)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_guias_email ON guias(email)').run();
}

export function estadoDe(fila: FilaGuia): EstadoGuia {
  if (fila.revocado_en) return 'revocado';
  return fila.pagado_en ? 'pagado' : 'pendiente';
}

export function urlGuia(origin: string, token: string): string {
  return `${origin}/guia/${token}`;
}

/** Normaliza las marcas que manda el agente. Todo es opcional salvo el nombre:
 *  la guía funciona con cero marcas y no debe inventar datos del cliente. */
export function sanitizarMarcas(raw: unknown, tope = 3): MarcaGuia[] {
  if (!Array.isArray(raw)) return [];
  const tipos = ['denominativa', 'mixta', 'figurativa'];
  return raw
    .filter(m => m && typeof m === 'object')
    .map((m: any) => {
      const tipo = String(m.tipo ?? '').trim().toLowerCase();
      return {
        nombre: String(m.nombre ?? '').trim().slice(0, 120),
        tipo: tipos.includes(tipo) ? tipo : 'denominativa',
        alcance: m.alcance ? String(m.alcance).trim().slice(0, 400) : undefined,
      };
    })
    .filter(m => m.nombre.length > 0)
    .slice(0, tope);
}

/** Email en minúsculas y sin espacios, que es como se guarda y se busca. */
export function normalizarEmail(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase().slice(0, 160);
}

/** Chequeo mínimo: hay algo, un arroba en el medio y un punto después. No
 *  validamos más porque un email raro pero válido es peor rechazarlo. */
export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Lo que devuelven los endpoints al agente. Nunca se expone la fila cruda. */
export function vistaAgente(fila: FilaGuia, origin: string) {
  return {
    ref: fila.ref,
    email: fila.email,
    estado: estadoDe(fila),
    guiaUrl: urlGuia(origin, fila.token),
    creadoEn: fila.creado_en,
    pagadoEn: fila.pagado_en,
    origenPago: fila.origen_pago,
    accesos: fila.accesos,
  };
}

export async function buscarPorRef(db: D1Database, ref: string): Promise<FilaGuia | null> {
  return db.prepare('SELECT * FROM guias WHERE ref = ?').bind(ref).first<FilaGuia>();
}

export async function buscarPorToken(db: D1Database, token: string): Promise<FilaGuia | null> {
  return db.prepare('SELECT * FROM guias WHERE token = ?').bind(token).first<FilaGuia>();
}

/** Marca el pedido como pagado. Es idempotente a propósito: el webhook de
 *  Mercado Pago reintenta, y el agente puede llamar dos veces sin querer.
 *  Devuelve la fila ya actualizada, o null si el ref no existe.
 *
 *  Un pedido revocado NO se reactiva por un pago: si lo diste de baja fue por
 *  algo, y que un reintento del webhook lo reviva sería una sorpresa fea. */
export async function marcarPagado(
  db: D1Database,
  ref: string,
  origen: OrigenPago,
  nota: string | null,
): Promise<{ fila: FilaGuia | null; yaEstaba: boolean }> {
  const fila = await buscarPorRef(db, ref);
  if (!fila) return { fila: null, yaEstaba: false };
  if (fila.revocado_en) return { fila, yaEstaba: true };
  if (fila.pagado_en) return { fila, yaEstaba: true };

  await db.prepare(
    'UPDATE guias SET pagado_en = ?, origen_pago = ?, pago_nota = ? WHERE ref = ?'
  ).bind(new Date().toISOString(), origen, nota, ref).run();

  return { fila: (await buscarPorRef(db, ref))!, yaEstaba: false };
}
