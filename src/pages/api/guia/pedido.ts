// POST /api/guia/pedido — el agente crea el pedido de una guía.
//
// Devuelve los DOS links que el agente manda en el mismo mensaje:
//  · pagoUrl  — Checkout Pro de Mercado Pago, sin efectivo
//  · guiaUrl  — la guía, que ya existe y muestra "pendiente" hasta que se pague
//
// Se entrega la guiaUrl antes de cobrar a propósito: así el cliente tiene su
// URL guardada desde el minuto cero y no depende del redirect de Mercado Pago
// (que no vuelve si paga desde la app) ni de que le llegue el mail.
import type { APIRoute } from 'astro';
import { runtime } from '@/lib/server/runtime';

// Ruta de servidor: se ejecuta por request, no se prerenderiza.
export const prerender = false;

import {
  type GuiaEnv, json, rechazoDeAuth, asegurarTabla, nuevaRef, nuevoToken,
  sanitizarMarcas, normalizarEmail, emailValido, urlGuia, vistaAgente,
  type FilaGuia,
} from '@/lib/server/guia';
import { PRICING } from '@/lib/checkout/constants';

interface Body {
  email?: string;
  marcas?: unknown;
}

export const POST: APIRoute = async (context) => {
  const { request } = context;
  const { env } = runtime<GuiaEnv>(context.locals);

  const rechazo = rechazoDeAuth(request, env);
  if (rechazo) return rechazo;

  if (!env.DB) return json({ error: 'Base de datos no configurada (binding DB).' }, 500);

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Cuerpo de solicitud inválido.' }, 400);
  }

  const email = normalizarEmail(body.email);
  if (!emailValido(email)) {
    return json({ error: 'Falta un email válido del cliente.' }, 400);
  }
  const marcas = sanitizarMarcas(body.marcas);

  // Después de validar el cuerpo: al agente le sirve más un 400 concreto sobre
  // lo que mandó que un 500 de configuración nuestra.
  if (!env.MP_ACCESS_TOKEN) return json({ error: 'MP_ACCESS_TOKEN no configurado.' }, 500);

  await asegurarTabla(env.DB);
  const origin = new URL(request.url).origin;

  // Si ya hay un pedido sin pagar para este mail, se devuelve ese mismo. El
  // agente puede reintentar sin generar links duplicados que confundan al
  // cliente ("¿cuál de los dos era?"). Se aprovecha para actualizar las marcas
  // por si en el chat aparecieron después de crear el pedido.
  const abierto = await env.DB.prepare(
    'SELECT * FROM guias WHERE email = ? AND pagado_en IS NULL AND revocado_en IS NULL ORDER BY creado_en DESC LIMIT 1'
  ).bind(email).first<FilaGuia>();

  if (abierto) {
    if (marcas.length) {
      await env.DB.prepare('UPDATE guias SET marcas = ? WHERE ref = ?')
        .bind(JSON.stringify(marcas), abierto.ref).run();
    }
    const pagoUrl = await crearPreferencia(env, abierto.ref, origin, urlGuia(origin, abierto.token));
    if (!pagoUrl.ok) return json({ error: pagoUrl.error }, 502);
    return json({
      ...vistaAgente({ ...abierto, marcas: JSON.stringify(marcas.length ? marcas : JSON.parse(abierto.marcas)) }, origin),
      pagoUrl: pagoUrl.url,
      precio: PRICING.guia,
      reutilizado: true,
    });
  }

  const ref = nuevaRef();
  const token = nuevoToken();
  const guiaUrl = urlGuia(origin, token);

  const pref = await crearPreferencia(env, ref, origin, guiaUrl);
  if (!pref.ok) return json({ error: pref.error }, 502);

  await env.DB.prepare(
    `INSERT INTO guias (ref, token, email, marcas, creado_en, mp_preference_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(ref, token, email, JSON.stringify(marcas), new Date().toISOString(), pref.preferenceId).run();

  const fila = await env.DB.prepare('SELECT * FROM guias WHERE ref = ?').bind(ref).first<FilaGuia>();

  return json({
    ...vistaAgente(fila!, origin),
    pagoUrl: pref.url,
    precio: PRICING.guia,
    reutilizado: false,
  }, 201);
};

type Preferencia =
  | { ok: true; url: string; preferenceId: string }
  | { ok: false; error: string };

/**
 * Preferencia de Checkout Pro para una guía.
 *
 * · `external_reference` = ref del pedido. Es lo que el webhook usa después
 *   para saber a qué guía acreditar el pago.
 * · `back_urls.success` = la guía. Con `auto_return` el cliente entra solo
 *   apenas se aprueba, sin buscar el link en el chat.
 * · Se excluyen `ticket` y `atm`: nada de Rapipago ni Pago Fácil. Esos pagos
 *   quedan pendientes días, y una guía que no se activa al pagar genera
 *   soporte. Quien no quiera tarjeta transfiere, y ahí acredita el agente.
 */
async function crearPreferencia(
  env: GuiaEnv,
  ref: string,
  origin: string,
  guiaUrl: string,
): Promise<Preferencia> {
  const pref = {
    items: [{
      title: 'Guía para registrar tu marca — UnaMarca',
      quantity: 1,
      currency_id: 'ARS',
      unit_price: PRICING.guia,
    }],
    external_reference: ref,
    back_urls: { success: guiaUrl, pending: guiaUrl, failure: guiaUrl },
    auto_return: 'approved',
    payment_methods: {
      excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }],
    },
    notification_url: `${origin}/api/checkout/webhook`,
  };

  let res: Response;
  try {
    res = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(pref),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, error: 'No pudimos contactar a Mercado Pago. Reintentá en unos minutos.' };
  }

  const data: any = await res.json().catch(() => null);
  if (!res.ok || !data?.init_point) {
    return { ok: false, error: `Mercado Pago rechazó la preferencia (${res.status}).` };
  }
  return { ok: true, url: data.init_point, preferenceId: String(data.id) };
}
