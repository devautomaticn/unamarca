// Listado oficial completo de términos de una clase.
// GET /api/nomenclador/clase/:num → { clase, nombre, terminos: [{ id, termino }] }
//
// Son listas largas (la clase 4 tiene 672 términos), así que el filtrado se
// hace en el navegador: se pide una vez por clase y se busca sobre lo cargado.
import type { APIRoute } from 'astro';
import { runtime } from '@/lib/server/runtime';

// Ruta de servidor: se ejecuta por request, no se prerenderiza.
export const prerender = false;

import { proxyVigilante } from '@/lib/server/vigilanteProxy';

export const GET: APIRoute = async (context) => {
  const num = Number(context.params.num);
  // Sólo 1..45 existen en el Nomenclador de Niza. Se valida acá para no
  // reenviar basura al upstream ni gastar un round trip.
  if (!Number.isInteger(num) || num < 1 || num > 45) {
    return new Response(JSON.stringify({ error: 'La clase tiene que ser un número del 1 al 45.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return proxyVigilante(`/api/nomenclador/clase/${num}`, { method: 'GET' });
};
