// Tabla `visitas_link` (D1): una fila por pestaña que abrió el link del agente
// de WhatsApp. Ver src/lib/visitas.ts para el porqué.
import type { D1Database } from '@/lib/server/checkout';
import { ordenPaso, type Visita } from '@/lib/visitas';

export async function ensureVisitas(db: D1Database): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS visitas_link (
      sid TEXT PRIMARY KEY,
      tel TEXT NOT NULL,
      llegada_at TEXT NOT NULL,
      ultimo_at TEXT NOT NULL,
      paso_max INTEGER NOT NULL,
      cambios INTEGER NOT NULL DEFAULT 1,
      ref TEXT
    )
  `).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_visitas_link_tel ON visitas_link(tel)').run();
}

/** Con `tel` (el primer aviso, al abrir el link) crea la fila o la actualiza;
 *  sin `tel` sólo actualiza una que ya existe. Así, un paso suelto sin el
 *  aviso de llegada no inventa visitas. `paso_max` nunca baja: volver atrás
 *  no borra hasta dónde llegó. */
export async function registrarVisita(db: D1Database, v: Visita, ahora: string): Promise<void> {
  const orden = ordenPaso(v.paso);
  if (v.tel) {
    await db.prepare(`
      INSERT INTO visitas_link (sid, tel, llegada_at, ultimo_at, paso_max, cambios, ref)
      VALUES (?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(sid) DO UPDATE SET
        ultimo_at = excluded.ultimo_at,
        paso_max = MAX(paso_max, excluded.paso_max),
        cambios = cambios + 1,
        ref = COALESCE(excluded.ref, ref)
    `).bind(v.sid, v.tel, ahora, ahora, orden, v.ref).run();
    return;
  }
  await db.prepare(`
    UPDATE visitas_link SET
      ultimo_at = ?,
      paso_max = MAX(paso_max, ?),
      cambios = cambios + 1,
      ref = COALESCE(?, ref)
    WHERE sid = ?
  `).bind(ahora, orden, v.ref, v.sid).run();
}
