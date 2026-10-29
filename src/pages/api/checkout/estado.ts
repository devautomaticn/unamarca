// GET /api/checkout/estado?tel=...  |  ?ref=UM-...  — el estado de un pedido,
// para el agente de WhatsApp (Sofía).
//
// Sale de leer las intervenciones de Mike en las charlas de Sofía (vigilant
// #269): «ya pagué pero se me cerró», «no me tomó el pago», «¿les llegó?». Hoy
// lo contesta una persona mirando el panel. Con esto lo contesta Sofía.
//
// Cuatro decisiones que no son obvias:
//
// 1. **Por teléfono, y el teléfono lo pone el gateway, no el cliente.** El
//    número de una charla de WhatsApp lo autentica WhatsApp: nadie puede
//    preguntar por el pedido de otro escribiendo un número ajeno, porque el
//    agente busca siempre el número desde el que le escriben. Por eso no hay
//    búsqueda por email (la de la guía es el agujero que marcó la auditoría
//    de vigilant del 2026-10-20: cualquiera dice un mail ajeno).
//
// 2. **Con la misma clave que la guía** (`GUIA_API_KEY`). Es el mismo cliente
//    (el agente) y el mismo nivel de confianza; un segundo secreto sería otra
//    cosa que rotar sin ganar nada.
//
// 3. **Sin datos personales.** `GET /api/checkout/order/:ref` devuelve el
//    pedido entero (titulares, DNI, CUIT, domicilio) porque lo usa el wizard
//    para retomar. Al agente le alcanza con el estado: esta vista es la única
//    que le llega, y no lleva nada que no sepa ya de la charla.
//
// 4. **La transferencia no se puede confirmar desde acá.** Queda en
//    `pending_transfer` hasta que se concilia a mano contra el banco (la
//    transferencia llega con el nombre del que paga, no con el ref; ver
//    spec_self_checkout.md §12), y esa conciliación no vuelve a esta tabla.
//    `pago: 'transferencia_a_confirmar'` dice exactamente eso, para que el
//    agente no le diga a nadie que no pagó.
import type { APIRoute } from 'astro';
import { runtime } from '@/lib/server/runtime';

// Ruta de servidor: se ejecuta por request, no se prerenderiza.
export const prerender = false;

import { type CheckoutEnv, ensureSchema, json } from '@/lib/server/checkout';
import { rechazoDeAuth, type GuiaEnv } from '@/lib/server/guia';

// Los pedidos de un número que se miran. Un cliente que vuelve a los dos meses
// por una segunda marca no necesita que el agente vea el pedido de la primera.
const VENTANA_DIAS = 60;
const MAX_PEDIDOS = 5;
const REF_RE = /^UM-\d{8}-[A-Z0-9]{6}$/;

interface FilaPedido {
  ref: string;
  created_at: string;
  status: string;
  payload: string;
  completion: string | null;
}

/** Los últimos 10 dígitos: el número nacional argentino (área + abonado), sin
 *  el +54, el 9 del móvil ni el 0 de larga distancia. Así matchean el
 *  `+5491155555555` que prellena el link de Sofía y el `11 5555 5555` que
 *  tipea el cliente. No resuelve el `15` viejo (`011 15 5555 5555`): ese
 *  pedido no aparece y el agente cae a pedir el número de pedido. */
export function claveTelefono(tel: string | null | undefined): string {
  const d = String(tel || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}

/** Cómo está el pago, en el vocabulario que el agente puede decir en voz alta. */
function pago(status: string): string {
  switch (status) {
    case 'paid': return 'aprobado';
    case 'pending_payment': return 'sin_pagar';
    case 'payment_pending': return 'mercadopago_procesando';
    case 'rejected': return 'rechazado';
    case 'refunded': return 'devuelto';
    case 'pending_transfer': return 'transferencia_a_confirmar';
    default: return 'desconocido';
  }
}

function vistaAgente(f: FilaPedido, origin: string) {
  let p: { marcas?: { nombre?: string; clases?: number[]; tipo?: string }[];
           metodo?: string; pricing?: { total?: number } } = {};
  try { p = JSON.parse(f.payload); } catch { /* pedido ilegible: sólo el estado */ }
  return {
    ref: f.ref,
    creado: f.created_at,
    metodo: p.metodo || 'mercadopago',
    pago: pago(f.status),
    formulario_completo: f.completion !== null,
    marcas: (p.marcas || []).map(m => ({
      nombre: m.nombre || '', clases: m.clases || [], tipo: m.tipo || '',
    })),
    total: p.pricing?.total ?? null,
    // El mismo link con el que se retoma desde otro dispositivo: el pedido
    // pagado sigue en el formulario; el de transferencia vuelve a mostrar la
    // cuenta y el importe.
    url_retomar: `${origin}/registrar?order=${encodeURIComponent(f.ref)}`,
  };
}

export const GET: APIRoute = async (context) => {
  const { request } = context;
  const { env } = runtime<CheckoutEnv & GuiaEnv>(context.locals);

  const rechazo = rechazoDeAuth(request, env);
  if (rechazo) return rechazo;
  if (!env.DB) return json({ error: 'Base de datos no configurada (binding DB).' }, 500);
  await ensureSchema(env.DB);

  const params = new URL(request.url).searchParams;
  const origin = new URL(request.url).origin;
  const ref = (params.get('ref') || '').trim().toUpperCase();

  if (ref) {
    if (!REF_RE.test(ref)) return json({ error: 'Número de pedido inválido.' }, 400);
    const fila = await env.DB.prepare(
      'SELECT ref, created_at, status, payload, completion FROM orders WHERE ref = ?'
    ).bind(ref).first<FilaPedido>();
    return json({ pedidos: fila ? [vistaAgente(fila, origin)] : [] });
  }

  const clave = claveTelefono(params.get('tel'));
  if (!clave) return json({ error: 'Falta un teléfono válido o un número de pedido.' }, 400);

  // El teléfono vive adentro del JSON y la tabla es chica (cientos de filas):
  // se acota por fecha en SQL y se compara la clave acá, con la misma
  // normalización de los dos lados.
  const desde = new Date(Date.now() - VENTANA_DIAS * 86400_000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT ref, created_at, status, payload, completion FROM orders
      WHERE created_at >= ? ORDER BY created_at DESC LIMIT 1000`
  ).bind(desde).all<FilaPedido>();

  const pedidos = (results || [])
    .filter(f => {
      try { return claveTelefono(JSON.parse(f.payload)?.contacto?.whatsapp) === clave; }
      catch { return false; }
    })
    .slice(0, MAX_PEDIDOS)
    .map(f => vistaAgente(f, origin));

  return json({ pedidos });
};
