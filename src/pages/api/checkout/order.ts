// POST /api/checkout/order — crea el pedido en D1.
// · metodo 'mercadopago' (default): crea también la preferencia de Checkout Pro
//   y devuelve { ref, init_point } para redirigir.
// · metodo 'transferencia': no toca Mercado Pago. El pedido queda en
//   'pending_transfer' y se devuelven los datos de la cuenta + el importe para
//   mostrarlos en el wizard. La acreditación se concilia a mano (no hay webhook).
import type { APIRoute } from 'astro';
import { runtime } from '@/lib/server/runtime';

// Ruta de servidor: se ejecuta por request, no se prerenderiza.
export const prerender = false;

import {
  type CheckoutEnv, ensureSchema, newOrderRef, computePricing, marcasDesdePayload, json,
} from '@/lib/server/checkout';
import {
  PRICING as PRICING_UNIT, TRANSFERENCIA, contarLineas, clasesTexto,
  normalizeTipoMarca, tipoMarcaLabel, type MarcaPedido, type TipoMarca,
} from '@/lib/checkout/constants';

type MetodoPago = 'mercadopago' | 'transferencia';

/** Cómo se nombra la marca en el detalle de Mercado Pago, que el cliente ve en
 *  el resumen de su tarjeta. En una figurativa el nombre es la referencia
 *  interna: mostrarla ayuda a que reconozca el cargo. */
function tituloMarca(m: MarcaPedido): string {
  const tipo: TipoMarca = m.tipo ?? 'denominativa';
  const nombre = `“${m.nombre.toUpperCase()}”`;
  return tipo === 'denominativa'
    ? `Registro de marca ${nombre}`
    : `Registro de marca ${tipo} ${nombre}`;
}

interface OrderBody {
  /** v2: una o más marcas, cada una con sus clases y su tipo */
  marcas?: { nombre?: string; clases?: number[]; tipo?: string }[];
  /** Legado v1: una sola marca (clientes con la página vieja cacheada) */
  marca?: { nombre?: string; tipo?: string };
  clases?: number[];
  /** Legado: pedidos con una sola clase */
  clase?: number | null;
  contacto?: { email?: string; whatsapp?: string };
  garantia?: boolean;
  /** Ausente en clientes con la página vieja cacheada → Mercado Pago */
  metodo?: MetodoPago;
}

export const POST: APIRoute = async (context) => {
  const { request } = context;
  const { env } = runtime<CheckoutEnv>(context.locals);

  if (!env.DB) return json({ error: 'Base de datos no configurada (binding DB)' }, 500);

  let body: OrderBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400);
  }

  const metodo: MetodoPago = body.metodo === 'transferencia' ? 'transferencia' : 'mercadopago';
  if (metodo === 'mercadopago' && !env.MP_ACCESS_TOKEN) {
    return json({ error: 'MP_ACCESS_TOKEN no configurado' }, 500);
  }

  const garantia = body.garantia === true;
  const marcas = marcasDesdePayload(body);
  const nLineas = Math.max(1, contarLineas(marcas));
  const pricing = computePricing(marcas, garantia);
  const ref = newOrderRef();
  const origin = new URL(request.url).origin;

  await ensureSchema(env.DB);

  const payload = {
    marcas,
    // Espejo v1 de la primera marca: lo siguen leyendo consumidores viejos
    // (y hace legibles los pedidos de una sola marca en D1). El tipo va con la
    // etiqueta capitalizada de siempre, que es lo que esos consumidores matchean.
    marca: {
      nombre: marcas[0]?.nombre || '',
      tipo: tipoMarcaLabel(normalizeTipoMarca(marcas[0]?.tipo)),
    },
    clases: marcas[0]?.clases ?? [],
    contacto: {
      email: (body.contacto?.email || '').trim(),
      whatsapp: (body.contacto?.whatsapp || '').trim(),
    },
    garantia,
    pricing,
    metodo,
  };

  // ── Transferencia: sin preferencia, sin redirect, sin webhook ──
  if (metodo === 'transferencia') {
    await env.DB.prepare(
      `INSERT INTO orders (ref, created_at, status, payload)
       VALUES (?, ?, 'pending_transfer', ?)`
    ).bind(ref, new Date().toISOString(), JSON.stringify(payload)).run();

    return json({
      ref,
      metodo,
      importe: pricing.total,
      transferencia: TRANSFERENCIA,
    });
  }

  const lineasLabel = nLineas === 1 ? '1 clase' : `${nLineas} clases`;
  type MpItem = { id: string; title: string; quantity: number; unit_price: number; currency_id: string };

  // Honorarios: un ítem por marca, para que el detalle de Mercado Pago diga
  // exactamente qué se está pagando. Arancel y garantía van agregados.
  // Solo las marcas con clases: son las que suman líneas al total, y el importe
  // de la preferencia tiene que dar exactamente pricing.total.
  const marcasCobrables = marcas.filter(m => m.clases.length > 0);
  const items: MpItem[] = marcasCobrables.length
    ? marcasCobrables.map((m, i) => ({
        id: `registro-${i + 1}`,
        title: `${tituloMarca(m)} — Honorarios (${clasesTexto(m.clases)})`,
        quantity: m.clases.length,
        unit_price: PRICING_UNIT.honorarios,
        currency_id: 'ARS',
      }))
    : [{
        id: 'registro',
        title: `Registro de marca — Honorarios (${lineasLabel})`,
        quantity: nLineas,
        unit_price: PRICING_UNIT.honorarios,
        currency_id: 'ARS',
      }];

  items.push({
    id: 'arancel',
    title: `Arancel INPI (${lineasLabel})`,
    quantity: nLineas,
    unit_price: PRICING_UNIT.arancelInpi,
    currency_id: 'ARS',
  });
  if (garantia) {
    items.push({
      id: 'garantia',
      title: `Garantía de Devolución (${lineasLabel})`,
      quantity: nLineas,
      unit_price: PRICING_UNIT.garantia,
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

  return json({ ref, metodo, init_point: pref.init_point });
};
