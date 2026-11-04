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
import { type CheckoutEnv, ensureSchema } from '@/lib/server/checkout';

export const prerender = false;

interface PedidosEnv extends CheckoutEnv {
  PEDIDOS_API_KEY?: string;
}

interface FilaPedido {
  ref: string;
  created_at: string;
  completed_at: string | null;
  status: string;
  payload: string;
}

const LIMITE = 200;
// No más atrás que esto en una sola consulta: el histórico ya está cargado.
const MAX_DIAS = 400;
const DESDE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z)?$/;

function noEncontrado(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function igualSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

function autorizado(request: Request, env: PedidosEnv): boolean {
  const clave = env.PEDIDOS_API_KEY || '';
  // Una clave corta es una clave mal cargada: mejor no abrir el endpoint.
  if (clave.length < 32) return false;
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return token.length > 0 && igualSeguro(token, clave);
}

function vista(f: FilaPedido) {
  let p: {
    marcas?: { nombre?: string; tipo?: string; clases?: number[] }[];
    marca?: { nombre?: string; tipo?: string };
    clases?: number[];
    contacto?: { email?: string; whatsapp?: string };
    garantia?: boolean;
    metodo?: string;
    pricing?: { honorarios?: number; garantia?: number; arancelInpi?: number; total?: number };
    origen?: unknown;
  } = {};
  try { p = JSON.parse(f.payload); } catch { /* ilegible: sólo lo de la fila */ }
  // Pedidos v1 (una sola marca) guardaban `marca` + `clases` sueltos.
  const marcas = p.marcas?.length
    ? p.marcas
    : p.marca ? [{ nombre: p.marca.nombre, tipo: p.marca.tipo, clases: p.clases }] : [];
  return {
    ref: f.ref,
    creado: f.created_at,
    completado: f.completed_at,
    estado: f.status,
    metodo: p.metodo || 'mercadopago',
    marcas: marcas.map(m => ({ nombre: m.nombre || '', tipo: m.tipo || '', clases: m.clases || [] })),
    garantia: !!p.garantia,
    precio: {
      honorarios: p.pricing?.honorarios ?? null,
      garantia: p.pricing?.garantia ?? null,
      arancel_inpi: p.pricing?.arancelInpi ?? null,
      total: p.pricing?.total ?? null,
    },
    contacto: { email: p.contacto?.email || '', whatsapp: p.contacto?.whatsapp || '' },
    origen: p.origen ?? null,
  };
}

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
