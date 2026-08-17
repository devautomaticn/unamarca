// Sugerencia de clases y términos a partir de una descripción libre.
// POST { descripcion } → { classes: [{ num, nombre, terminos: [{ id, termino }] }] }
//
// El campo se llama `descripcion`: cualquier otro nombre devuelve 400.
import { proxyVigilante } from '../../_lib/vigilanteProxy';

export const onRequestPost: PagesFunction = async (context) => {
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
