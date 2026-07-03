// POST /api/checkout/order — crea el pedido en D1 y la preferencia de pago en
// Mercado Pago (Checkout Pro). Devuelve { ref, init_point } para redirigir.
import {
  type CheckoutEnv, ensureSchema, newOrderRef, computePricing, json,
} from '../../_lib/checkout';

interface OrderBody {
  marca?: { nombre?: string; tipo?: string };
  clase?: number | null;
  contacto?: { email?: string; whatsapp?: string };
  garantia?: boolean;
}

export const onRequestPost: PagesFunction<CheckoutEnv> = async (context) => {
  const { env, request } = context;

  if (!env.MP_ACCESS_TOKEN) return json({ error: 'MP_ACCESS_TOKEN no configurado' }, 500);
  if (!env.DB) return json({ error: 'Base de datos no configurada (binding DB)' }, 500);

  let body: OrderBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400);
  }

  const garantia = body.garantia === true;
  const pricing = computePricing(garantia);
  const ref = newOrderRef();
  const origin = new URL(request.url).origin;
  const marcaNombre = (body.marca?.nombre || '').trim();

  await ensureSchema(env.DB);

  const payload = {
    marca: { nombre: marcaNombre, tipo: 'Denominativa' },
    clase: typeof body.clase === 'number' ? body.clase : null,
    contacto: {
      email: (body.contacto?.email || '').trim(),
      whatsapp: (body.contacto?.whatsapp || '').trim(),
    },
    garantia,
    pricing,
  };

  const items = [
    {
      id: 'registro',
      title: marcaNombre
        ? `Registro de marca "${marcaNombre.toUpperCase()}" — Honorarios`
        : 'Registro de marca — Honorarios',
      quantity: 1,
      unit_price: pricing.honorarios,
      currency_id: 'ARS',
    },
    {
      id: 'arancel',
      title: 'Arancel INPI (1 clase)',
      quantity: 1,
      unit_price: pricing.arancelInpi,
      currency_id: 'ARS',
    },
  ];
  if (garantia) {
    items.push({
      id: 'garantia',
      title: 'Garantía de Devolución',
      quantity: 1,
      unit_price: pricing.garantia,
      currency_id: 'ARS',
    });
  }

  const backUrl = `${origin}/registrar?order=${ref}`;
  const preference = {
    items,
    external_reference: ref,
    metadata: { order_ref: ref },
    back_urls: { success: backUrl, pending: backUrl, failure: backUrl },
    auto_return: 'approved',
    notification_url: `${origin}/api/checkout/webhook`,
    statement_descriptor: 'UNAMARCA',
    payer: payload.contacto.email ? { email: payload.contacto.email } : undefined,
  };

  const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      'X-Idempotency-Key': ref,
    },
    body: JSON.stringify(preference),
  });

  if (!mpRes.ok) {
    const errText = await mpRes.text();
    console.error('MP preference error:', mpRes.status, errText);
    return json({ error: 'No se pudo crear la preferencia de pago' }, 502);
  }

  const pref = await mpRes.json<{ id: string; init_point: string }>();

  await env.DB.prepare(
    `INSERT INTO orders (ref, created_at, status, mp_preference_id, payload)
     VALUES (?, ?, 'pending_payment', ?, ?)`
  ).bind(ref, new Date().toISOString(), pref.id, JSON.stringify(payload)).run();

  return json({ ref, init_point: pref.init_point });
};
