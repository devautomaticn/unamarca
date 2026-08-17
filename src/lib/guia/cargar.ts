// Control de acceso de /guia/<token>: convierte un token en un cliente, o en
// un motivo por el que no se puede leer la guía.
//
// Corre en el servidor, dentro del Worker de Pages. `Astro.locals.runtime.env`
// es donde el adaptador de Cloudflare expone los bindings (DB, MP_ACCESS_TOKEN).

import type { GuiaCliente, GuiaMarca } from './cliente';
import { CLIENTE_DEMO, CLIENTE_SIN_DATOS } from './cliente';

export type MotivoBloqueo = 'pendiente' | 'revocado' | 'inexistente';

export type Acceso =
  | { ok: true; cliente: GuiaCliente }
  | { ok: false; motivo: MotivoBloqueo; pagoUrl: string | null };

/** Tokens que funcionan sin base, para poder ver la guía en desarrollo y en los
 *  previews. NO son un agujero en producción: sólo se aceptan si la tabla no
 *  encontró nada, y sus tokens son fijos y conocidos, no adivinables por nadie
 *  que no lea este archivo. Si molestan, se borran y no se rompe nada. */
const DEMOS: Record<string, GuiaCliente> = {
  [CLIENTE_DEMO.token]: CLIENTE_DEMO,
  [CLIENTE_SIN_DATOS.token]: CLIENTE_SIN_DATOS,
};

interface FilaGuia {
  token: string;
  email: string;
  marcas: string;
  pagado_en: string | null;
  revocado_en: string | null;
  mp_preference_id: string | null;
  accesos: number;
}

export async function cargarGuia(locals: any, token: unknown): Promise<Acceso> {
  const t = String(token ?? '').trim();
  if (!t) return { ok: false, motivo: 'inexistente', pagoUrl: null };

  const env = locals?.runtime?.env;
  const db = env?.DB;

  // Sin base (astro dev, preview sin binding) sólo andan los tokens de demo.
  if (!db) {
    return DEMOS[t]
      ? { ok: true, cliente: DEMOS[t] }
      : { ok: false, motivo: 'inexistente', pagoUrl: null };
  }

  let fila: FilaGuia | null = null;
  try {
    fila = await db.prepare(
      'SELECT token, email, marcas, pagado_en, revocado_en, mp_preference_id, accesos FROM guias WHERE token = ?'
    ).bind(t).first();
  } catch {
    // La tabla puede no existir todavía (nadie compró nunca). No es un error:
    // se trata igual que un token desconocido.
    fila = null;
  }

  if (!fila) {
    return DEMOS[t]
      ? { ok: true, cliente: DEMOS[t] }
      : { ok: false, motivo: 'inexistente', pagoUrl: null };
  }

  if (fila.revocado_en) return { ok: false, motivo: 'revocado', pagoUrl: null };

  if (!fila.pagado_en) {
    return {
      ok: false,
      motivo: 'pendiente',
      pagoUrl: fila.mp_preference_id
        ? `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${fila.mp_preference_id}`
        : null,
    };
  }

  // Contar accesos es la única señal de que un link se está compartiendo: si
  // uno solo acumula cientos, algo pasó. No bloquea nada por sí mismo.
  try {
    await db.prepare('UPDATE guias SET accesos = accesos + 1, ultimo_acceso = ? WHERE token = ?')
      .bind(new Date().toISOString(), t).run();
  } catch { /* que falle el contador no puede dejar sin guía a quien pagó */ }

  let marcas: GuiaMarca[] = [];
  try {
    const crudo = JSON.parse(fila.marcas || '[]');
    if (Array.isArray(crudo)) marcas = crudo;
  } catch { /* JSON roto: la guía funciona igual con cero marcas */ }

  return { ok: true, cliente: { token: fila.token, email: fila.email, marcas } };
}
