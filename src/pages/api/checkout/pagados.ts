// ────────────────────────────────────────────────────────────────────────────
//  GET /api/checkout/pagados?desde=YYYY-MM-DD[THH:MM:SS.sssZ]
//
//  Los pedidos que son una venta, para el CRM de Vigilant (backlog #274 de ese
//  repo, docs/Spec_Ventas_Clientes.md §5). El VPS los lee cada hora y arma con
//  ellos el deal y, si Mercado Pago ya aprobó, el cobro.
//
//  Qué es una venta acá:
//  · `paid` y `refunded`: Mercado Pago aprobó (el devuelto también fue venta).
//  · `pending_transfer` CON el formulario completo: el cliente eligió
//    transferencia y terminó de cargar sus datos. La conciliación contra el
//    banco es manual y no vuelve a esta tabla, así que el estado no cambia
//    nunca: del otro lado entra como «transferencia por confirmar».
//  Un pedido de transferencia sin formulario es casi siempre un reintento o un
//  abandono (un mismo cliente llegó a generar 11 en una hora): no se manda.
//
//  Seguridad (Mike: «que sólo lo podamos consultar nosotros»):
//  · Clave propia, `PEDIDOS_API_KEY`, secret de Cloudflare Pages. No es la de
//    Sofía (`GUIA_API_KEY`): si una se filtra o se rota, la otra sigue igual.
//  · Sin clave configurada, con clave equivocada o sin Authorization, la
//    respuesta es un 404 idéntico al de una ruta que no existe: quien no tiene
//    la clave no puede saber que el endpoint está.
//  · Comparación de tiempo constante.
//  · Sólo lo que hace falta para armar la venta y reconocer al cliente: marca,
//    clases, precio desglosado, email y WhatsApp de contacto, y el canal
//    (`origen`, que no identifica a nadie). Nunca titulares, DNI, CUIT,
//    domicilio, firmas ni la carta poder (`completion` no sale).
//  · `Cache-Control: no-store` y sin CORS: ningún navegador ajeno puede leerlo
//    aunque tuviera la clave.
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
  // Para paginar se pasa como `desde` el `siguiente` de la respuesta anterior:
  // estricto (>), así el último de la página no se repite.
  const desdeIso = desde.length === 10 ? `${desde}T00:00:00.000Z` : desde;
  const op = desde.length === 10 ? '>=' : '>';
  const { results } = await env.DB.prepare(
    `SELECT ref, created_at, completed_at, status, payload FROM orders
      WHERE created_at ${op} ?
        AND (status IN ('paid', 'refunded')
             OR (status = 'pending_transfer' AND completed_at IS NOT NULL))
      ORDER BY created_at LIMIT ?`
  ).bind(desdeIso, LIMITE).all<FilaPedido>();
  const filas = results || [];
  return json({
    pedidos: filas.map(vista),
    siguiente: filas.length === LIMITE ? filas[filas.length - 1].created_at : null,
  });
};
