// POST /api/origen — guarda en una cookie por dónde llegó el visitante.
//
// No escribe en ninguna base: lo único que hace es devolver un `Set-Cookie`.
// El origen recién se persiste cuando hay pedido (POST /api/checkout/order lo
// lee de la cookie). Ver src/lib/origen.ts para el porqué de cada decisión.
//
// Es abierto y no necesita más: lo peor que puede hacer quien lo llame a mano
// es cambiar la cookie de su propio navegador.
import type { APIRoute } from 'astro';
import {
  combinar, esSignificativo, leerCookie, sanitizarToque, serializarCookie,
} from '@/lib/origen';

// Ruta de servidor: se ejecuta por request, no se prerenderiza.
export const prerender = false;

const vacio = (headers: Record<string, string> = {}) =>
  new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', ...headers } });

export const POST: APIRoute = async ({ request }) => {
  const cuerpo = await request.text();
  if (cuerpo.length > 4000) return new Response(null, { status: 413 });

  let crudo: unknown;
  try {
    crudo = JSON.parse(cuerpo);
  } catch {
    return new Response(null, { status: 400 });
  }

  const url = new URL(request.url);
  const toque = sanitizarToque(crudo, {
    ts: new Date().toISOString(),
    hostPropio: url.hostname,
  });
  // Una visita directa no pisa lo que ya se sabía (ver esSignificativo).
  if (!toque || !esSignificativo(toque)) return vacio();

  // La fecha la pone el servidor: un `ts` en el cuerpo no cuenta.
  toque.ts = new Date().toISOString();

  const previo = leerCookie(request.headers.get('cookie'), url.hostname);
  const cookie = serializarCookie(combinar(previo, toque), url);
  return cookie ? vacio({ 'Set-Cookie': cookie }) : vacio();
};
