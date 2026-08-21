// Cadena de firmas de la carta poder.
//
// Una marca con varios cotitulares necesita la firma de TODOS: el poder es uno
// solo y cada otorgante firma al pie. Pero el checkout lo completa una sola
// persona, en su celular. El resto no está ahí.
//
// Por eso el pedido no se frena esperando: quien completa firma en el paso 7 y
// a cada cotitular pendiente le sale un email con un link propio
// (`/firmar/<token>`) donde ve el MISMO documento —con las firmas que ya
// están— y agrega la suya.
//
// ⚠️ EL TOKEN ES LA CREDENCIAL. No hay login: quien tiene el link firma. Es la
// misma postura que `/guia/<token>` y que el ref del pedido, y es lo único que
// hace posible que firme alguien que nunca entró al checkout. Un token abre UN
// renglón de firma de UN pedido, y deja de aceptar firmas apenas se usa.

import type { D1Database } from './checkout';

export interface FilaFirma {
  token: string;
  ref: string;
  /** Posición del titular en `completion.titulares` — la clave estable */
  idx: number;
  nombre: string;
  email: string;
  /** data URL PNG. null mientras no firmó. */
  firma: string | null;
  firmado_en: string | null;
  creado_en: string;
}

const ALFABETO = 'abcdefghijkmnopqrstuvwxyz23456789';

/** 26 caracteres de alfabeto sin ambigüedades (no hay 0/O ni 1/l): el link
 *  viaja por email pero alguien puede llegar a tipearlo desde una captura. */
export function nuevoTokenFirma(): string {
  const bytes = new Uint8Array(26);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => ALFABETO[b % ALFABETO.length]).join('');
}

/** Idempotente y barato, como `ensureSchema` del checkout: D1 no tiene
 *  migraciones y esto se llama en cada endpoint que toca la tabla. */
export async function asegurarTablaFirmas(db: D1Database): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS firmas (
      token TEXT PRIMARY KEY,
      ref TEXT NOT NULL,
      idx INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      email TEXT NOT NULL,
      firma TEXT,
      firmado_en TEXT,
      creado_en TEXT NOT NULL
    )
  `).run();
  // Por ref se arma el estado del poder (quién firmó, quién falta) cada vez que
  // alguien abre su link.
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_firmas_ref ON firmas(ref)').run();
  // Un titular, un renglón: si el PATCH se reintenta no se duplican los links
  // ni salen dos emails al mismo cotitular.
  await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_firmas_ref_idx ON firmas(ref, idx)').run();
}

export function urlFirma(origin: string, token: string): string {
  return `${origin}/firmar/${token}`;
}

/** Abre un renglón de firma. `firma` no nula = ya firmado (es el caso del
 *  titular que completó el checkout: firmó ahí mismo, no necesita link).
 *
 *  Devuelve la fila existente si el renglón ya estaba abierto — un PATCH
 *  repetido no puede regenerar el token de alguien que ya recibió su email, ni
 *  mucho menos borrarle la firma. */
export async function abrirFirma(
  db: D1Database,
  datos: { ref: string; idx: number; nombre: string; email: string; firma?: string | null },
): Promise<{ fila: FilaFirma; nueva: boolean }> {
  const previa = await firmaDePedido(db, datos.ref, datos.idx);
  if (previa) return { fila: previa, nueva: false };

  const ahora = new Date().toISOString();
  const fila: FilaFirma = {
    token: nuevoTokenFirma(),
    ref: datos.ref,
    idx: datos.idx,
    nombre: datos.nombre,
    email: datos.email,
    firma: datos.firma ?? null,
    firmado_en: datos.firma ? ahora : null,
    creado_en: ahora,
  };
  try {
    await db.prepare(
      `INSERT INTO firmas (token, ref, idx, nombre, email, firma, firmado_en, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      fila.token, fila.ref, fila.idx, fila.nombre, fila.email,
      fila.firma, fila.firmado_en, fila.creado_en,
    ).run();
  } catch (e) {
    // El índice UNIQUE(ref, idx) lo rechazó: dos PATCH del mismo pedido
    // corriendo a la vez. Gana el que insertó primero y este se queda con esa
    // fila, que es exactamente lo que hace falta para no mandar dos links.
    const carrera = await firmaDePedido(db, datos.ref, datos.idx);
    if (!carrera) throw e;
    return { fila: carrera, nueva: false };
  }
  return { fila, nueva: true };
}

export async function firmaPorToken(db: D1Database, token: string): Promise<FilaFirma | null> {
  return db.prepare('SELECT * FROM firmas WHERE token = ?').bind(token).first<FilaFirma>();
}

async function firmaDePedido(db: D1Database, ref: string, idx: number): Promise<FilaFirma | null> {
  return db.prepare('SELECT * FROM firmas WHERE ref = ? AND idx = ?')
    .bind(ref, idx).first<FilaFirma>();
}

/** Todos los renglones del pedido, en el orden de los titulares. */
export async function firmasDePedido(db: D1Database, ref: string): Promise<FilaFirma[]> {
  const res = await db.prepare('SELECT * FROM firmas WHERE ref = ? ORDER BY idx')
    .bind(ref).all<FilaFirma>();
  return res.results ?? [];
}

/** Guarda la firma de un renglón. Devuelve false si ese token ya había firmado:
 *  una firma no se pisa nunca —ni con la del mismo titular— porque el PDF que
 *  ya salió por email quedaría desmentido por la base. */
export async function guardarFirma(
  db: D1Database,
  token: string,
  firma: string,
): Promise<boolean> {
  const fila = await firmaPorToken(db, token);
  if (!fila || fila.firma) return false;
  await db.prepare('UPDATE firmas SET firma = ?, firmado_en = ? WHERE token = ? AND firma IS NULL')
    .bind(firma, new Date().toISOString(), token).run();
  return true;
}

/** Cuántas firmas hay y cuántas faltan. Es lo que decide si el PDF que llega al
 *  estudio es el definitivo o uno más de la cadena. */
export function estadoFirmas(filas: FilaFirma[]): {
  total: number; firmadas: number; completo: boolean; pendientes: FilaFirma[];
} {
  const pendientes = filas.filter(f => !f.firma);
  return {
    total: filas.length,
    firmadas: filas.length - pendientes.length,
    completo: filas.length > 0 && pendientes.length === 0,
    pendientes,
  };
}
