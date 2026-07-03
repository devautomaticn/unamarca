// POST /api/checkout/webhook — notificaciones de Mercado Pago.
// Fuente de verdad del estado de pago. Valida x-signature (HMAC-SHA256),
// consulta el pago a la API de MP y actualiza el pedido de forma idempotente.
// Siempre responde 200 a notificaciones válidas (un no-200 dispara reintentos).
import { type CheckoutEnv, ensureSchema, json, hmacSha256Hex } from '../../_lib/checkout';

interface MpPayment {
  id: number;
  status: string; // approved | pending | in_process | rejected | cancelled | refunded | charged_back
  external_reference?: string;
}

function mapStatus(mpStatus: string): string {
  switch (mpStatus) {
    case 'approved': return 'paid';
    case 'pending':
    case 'in_process': return 'payment_pending';
    case 'rejected':
    case 'cancelled': return 'rejected';
    case 'refunded':
    case 'charged_back': return 'refunded';
    default: return 'payment_pending';
  }
}

export const onRequestPost: PagesFunction<CheckoutEnv> = async ({ env, request }) => {
  if (!env.DB || !env.MP_ACCESS_TOKEN || !env.MP_WEBHOOK_SECRET) {
    return json({ error: 'Checkout no configurado' }, 500);
  }

  const url = new URL(request.url);
  let dataId = url.searchParams.get('data.id') || '';
  const type = url.searchParams.get('type') || url.searchParams.get('topic') || '';

  // Fallback: algunos envíos traen el id solo en el body
  if (!dataId) {
    try {
      const body = await request.clone().json<{ data?: { id?: string | number }; type?: string }>();
      dataId = String(body?.data?.id ?? '');
    } catch { /* body no-JSON: se ignora */ }
  }

  // ── Validación de firma ─────────────────────────────────
  const xSignature = request.headers.get('x-signature') || '';
  const xRequestId = request.headers.get('x-request-id') || '';
  const parts = Object.fromEntries(
    xSignature.split(',').map(p => p.trim().split('=', 2) as [string, string]),
  );
  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) return json({ error: 'Firma ausente' }, 401);

  // Manifest según docs MP: solo incluye las partes presentes; id en minúsculas
  let manifest = '';
  if (dataId) manifest += `id:${dataId.toLowerCase()};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;

  const expected = await hmacSha256Hex(env.MP_WEBHOOK_SECRET, manifest);
  if (expected !== v1.toLowerCase()) {
    console.error('Webhook: firma inválida', { manifest });
    return json({ error: 'Firma inválida' }, 401);
  }

  // Solo procesamos eventos de pago; el resto se confirma y descarta
  if (type !== 'payment' || !dataId) return json({ ok: true, ignored: true });

  // ── Consultar el pago (fuente de verdad) ────────────────
  const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
    headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
  });
  if (payRes.status === 404) return json({ ok: true, ignored: true });
  if (!payRes.ok) {
    console.error('Webhook: error consultando pago', payRes.status);
    // 500 → MP reintenta más tarde
    return json({ error: 'Error consultando el pago' }, 500);
  }

  const payment = await payRes.json<MpPayment>();
  const ref = payment.external_reference;
  if (!ref) return json({ ok: true, ignored: true });

  await ensureSchema(env.DB);
  const row = await env.DB.prepare('SELECT ref, status FROM orders WHERE ref = ?')
    .bind(ref).first<{ ref: string; status: string }>();
  if (!row) return json({ ok: true, ignored: true });

  const newStatus = mapStatus(payment.status);

  // Idempotencia: nunca degradar un pedido ya pagado (salvo devolución real)
  if (row.status === 'paid' && newStatus !== 'refunded') return json({ ok: true });

  await env.DB.prepare(
    `UPDATE orders SET status = ?, payment_id = ?, payment_status = ?, updated_at = ?
     WHERE ref = ?`
  ).bind(newStatus, String(payment.id), payment.status, new Date().toISOString(), ref).run();

  return json({ ok: true });
};
