// ────────────────────────────────────────────────────────────────────────────
//  GET /api/checkout/no-pagados?desde=YYYY-MM-DD[THH:MM:SS.sssZ]
//
//  El complemento exacto de `/pagados`: los pedidos que NO son una venta, para
//  la lista de contactos de UnaMarca del lado de Vigilant
//  (`run_contactos_unamarca.py`). Son los que llegaron a elegir el medio de
//  pago y no lo terminaron.
//
//  Qué entra acá:
//  · `pending_payment`: fue a Mercado Pago y no pagó (o todavía no volvió).
//  · `rejected` / `cancelled`: Mercado Pago rechazó o se canceló.
//  · `pending_transfer` SIN el formulario completo: eligió transferencia y no
//    terminó de cargar sus datos.
//  Un mismo cliente puede tener varios (reintentos): se mandan todos, el que
//  lee los junta por email.
//
//  Seguridad: la misma clave (`PEDIDOS_API_KEY`), el mismo 404 sin clave y la
//  misma vista que `/pagados` (src/lib/server/pedidosApi.ts): marca, clases,
//  precio, email y WhatsApp de contacto, canal. Nunca `completion`.
// ────────────────────────────────────────────────────────────────────────────
import type { APIRoute } from 'astro';
import { runtime } from '@/lib/server/runtime';
import { ensureSchema } from '@/lib/server/checkout';
import {
  type FilaPedido, type PedidosEnv, DESDE_RE, LIMITE, MAX_DIAS, autorizado, json, noEncontrado, vista,
} from '@/lib/server/pedidosApi';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const { request } = context;
  const { env } = runtime<PedidosEnv>(context.locals);
  if (!autorizado(request, env)) return noEncontrado();
  if (!env.DB) return json({ error: 'Base de datos no configurada (binding DB).' }, 500);
  await ensureSchema(env.DB);

  const desde = (new URL(request.url).searchParams.get('desde') || '').trim();
  if (!DESDE_RE.test(desde) || Number.isNaN(Date.parse(desde))) {
    return json({ error: 'desde: YYYY-MM-DD o ISO en UTC.' }, 400);
  }
  if (Date.now() - Date.parse(desde) > MAX_DIAS * 86_400_000) {
    return json({ error: `desde: no más de ${MAX_DIAS} días para atrás.` }, 400);
  }
  // Paginación igual que /pagados: `siguiente` vuelve como `desde`, estricto.
  const desdeIso = desde.length === 10 ? `${desde}T00:00:00.000Z` : desde;
  const op = desde.length === 10 ? '>=' : '>';
  const { results } = await env.DB.prepare(
    `SELECT ref, created_at, completed_at, status, payload FROM orders
      WHERE created_at ${op} ?
        AND (status IN ('pending_payment', 'rejected', 'cancelled')
             OR (status = 'pending_transfer' AND completed_at IS NULL))
      ORDER BY created_at LIMIT ?`
  ).bind(desdeIso, LIMITE).all<FilaPedido>();
  const filas = results || [];
  return json({
    pedidos: filas.map(vista),
    siguiente: filas.length === LIMITE ? filas[filas.length - 1].created_at : null,
  });
};
