// ────────────────────────────────────────────────────────────────────────────
//  GET /api/checkout/promo?t=<token>
//
//  Lo que la página necesita para MOSTRAR una promo (vigilant #313): el nombre,
//  el total por clase, hasta cuándo, con qué medios y los honorarios por
//  clase. Sólo si el token del link es auténtico y vigente
//  (src/lib/server/promos.ts). Si no, `{ valida: false }` y nada más: no
//  distingue «no existe» de «vencido» de «firma mala», así que no sirve para
//  tantear.
//
//  Mostrar no es cobrar: el precio lo fija /api/checkout/order, que vuelve a
//  verificar el token con el medio de pago elegido.
// ────────────────────────────────────────────────────────────────────────────
import type { APIRoute } from 'astro';
import { runtime } from '@/lib/server/runtime';
import { PRICING } from '@/lib/checkout/constants';
import { honorariosPromo, verificarToken } from '@/lib/server/promos';

export const prerender = false;

interface PromoEnv {
  PEDIDOS_API_KEY?: string;
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async (context) => {
  try {
    const { env } = runtime<PromoEnv>(context.locals);
    const token = new URL(context.request.url).searchParams.get('t');
    const v = await verificarToken(token, env.PEDIDOS_API_KEY);
    if (!v) return json({ valida: false });
    const honorarios = honorariosPromo(v.promo, PRICING.arancelInpi, PRICING.honorarios);
    if (honorarios === null) return json({ valida: false });
    return json({
      valida: true,
      nombre: v.promo.nombre,
      porClase: v.promo.porClase,
      hastaTexto: v.promo.hastaTexto,
      medios: v.promo.medios,
      honorarios,
    });
  } catch {
    return json({ valida: false });
  }
};
