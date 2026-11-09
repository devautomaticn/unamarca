// POST /api/checkout/visita — el wizard avisa hasta qué paso llegó quien abrió
// el link del agente de WhatsApp. Ver src/lib/visitas.ts.
//
// Abierto, como /api/origen: no lee nada ni devuelve nada (204 siempre que el
// cuerpo sea válido). Lo peor que puede hacer quien lo llame a mano es sumar
// filas falsas a una tabla de medición; nada del pedido ni del pago la lee.
import type { APIRoute } from 'astro';
import { runtime } from '@/lib/server/runtime';
import { type CheckoutEnv } from '@/lib/server/checkout';
import { ensureVisitas, registrarVisita } from '@/lib/server/visitas';
import { sanitizarVisita } from '@/lib/visitas';

// Ruta de servidor: se ejecuta por request, no se prerenderiza.
export const prerender = false;

const vacio = (status = 204) =>
  new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });

export const POST: APIRoute = async ({ request, locals }) => {
  const cuerpo = await request.text();
  if (cuerpo.length > 1000) return vacio(413);
  let crudo: unknown;
  try {
    crudo = JSON.parse(cuerpo);
  } catch {
    return vacio(400);
  }
  const visita = sanitizarVisita(crudo);
  if (!visita) return vacio(400);

  const { env } = runtime<CheckoutEnv>(locals);
  if (!env.DB) return vacio();
  try {
    await ensureVisitas(env.DB);
    // La hora la pone el servidor: un `ts` en el cuerpo no cuenta.
    await registrarVisita(env.DB, visita, new Date().toISOString());
  } catch (e) {
    // Medición: nunca le devuelve un error al wizard por esto.
    console.error('[visita] no se pudo registrar:', e);
  }
  return vacio();
};
