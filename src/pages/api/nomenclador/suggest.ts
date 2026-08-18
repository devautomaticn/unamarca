// Sugerencia de clases y términos a partir de una descripción libre.
// POST { descripcion } → { classes: [{ num, nombre, terminos: [{ id, termino }] }] }
//
// El campo se llama `descripcion`: cualquier otro nombre devuelve 400.
import type { APIRoute } from 'astro';
import { runtime } from '@/lib/server/runtime';

// Ruta de servidor: se ejecuta por request, no se prerenderiza.
export const prerender = false;

import { proxyVigilante } from '@/lib/server/vigilanteProxy';

export const POST: APIRoute = async (context) => {
  let body: string;
  try {
    body = await context.request.text();
  } catch {
    return new Response(JSON.stringify({ error: 'Cuerpo de solicitud inválido.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return proxyVigilante('/api/nomenclador/suggest', { method: 'POST', body });
};
