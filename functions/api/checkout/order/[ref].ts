// GET  /api/checkout/order/:ref  — estado + snapshot del pedido (para resumir el wizard)
// PATCH /api/checkout/order/:ref — adjunta titular + firma (paso 6)
// El ref es aleatorio y no adivinable: funciona como llave de lectura.
import { type CheckoutEnv, ensureSchema, json } from '../../../_lib/checkout';

interface OrderRow {
  ref: string;
  status: string;
  payment_status: string | null;
  payload: string;
  completion: string | null;
}

export const onRequestGet: PagesFunction<CheckoutEnv> = async ({ env, params }) => {
  if (!env.DB) return json({ error: 'Base de datos no configurada' }, 500);
  await ensureSchema(env.DB);

  const ref = String(params.ref || '');
  const row = await env.DB.prepare(
    'SELECT ref, status, payment_status, payload, completion FROM orders WHERE ref = ?'
  ).bind(ref).first<OrderRow>();

  if (!row) return json({ error: 'Pedido no encontrado' }, 404);

  return json({
    ref: row.ref,
    status: row.status,
    paymentStatus: row.payment_status,
    payload: JSON.parse(row.payload),
    completed: row.completion !== null,
  });
};

export const onRequestPatch: PagesFunction<CheckoutEnv> = async ({ env, params, request }) => {
  if (!env.DB) return json({ error: 'Base de datos no configurada' }, 500);
  await ensureSchema(env.DB);

  const ref = String(params.ref || '');
  const row = await env.DB.prepare('SELECT ref FROM orders WHERE ref = ?').bind(ref).first();
  if (!row) return json({ error: 'Pedido no encontrado' }, 404);

  let completion: unknown;
  try {
    completion = await request.json();
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400);
  }

  // Cap de tamaño (la firma viaja como data URL)
  const raw = JSON.stringify(completion);
  if (raw.length > 500_000) return json({ error: 'Payload demasiado grande' }, 413);

  await env.DB.prepare(
    'UPDATE orders SET completion = ?, completed_at = ?, updated_at = ? WHERE ref = ?'
  ).bind(raw, new Date().toISOString(), new Date().toISOString(), ref).run();

  // TODO(fase emails): acá se dispara la generación del PDF de la carta poder
  // y los emails vía Resend (spec §7).
  return json({ ok: true, ref });
};
