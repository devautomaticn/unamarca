// POST /api/origen — guarda en una cookie por dónde llegó el visitante.
//
// No escribe en ninguna base: lo único que hace es devolver `Set-Cookie`
// (`um_origen`, y `um_canal` si el visitante llegó por un anuncio).
// El origen recién se persiste cuando hay pedido (POST /api/checkout/order lo
// lee de la cookie). Ver src/lib/origen.ts para el porqué de cada decisión.
//
// Es abierto y no necesita más: lo peor que puede hacer quien lo llame a mano
// es cambiar la cookie de su propio navegador.
import type { APIRoute } from 'astro';
import {
  combinar, esSignificativo, leerCookie, sanitizarToque, serializarCookie, serializarCookieCanal,
} from '@/lib/origen';

// Ruta de servidor: se ejecuta por request, no se prerenderiza.
export const prerender = false;

function vacio(cookies: string[] = []): Response {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  // `append` y no un objeto: dos Set-Cookie no se pueden juntar en un header.
  for (const c of cookies) if (c) headers.append('Set-Cookie', c);
  return new Response(null, { status: 204, headers });
}

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
  const ahora = new Date().toISOString();
  toque.ts = ahora;

  const previo = leerCookie(request.headers.get('cookie'), url.hostname);
  const origen = combinar(previo, toque);
  return vacio([
    serializarCookie(origen, url),
    // El canal para los mensajes de WhatsApp. Se escribe aunque la emisión
    // esté apagada: así, el día que se prenda, quien hizo clic en un anuncio
    // la semana anterior ya la tiene.
    serializarCookieCanal(origen, url, ahora),
  ]);
};
