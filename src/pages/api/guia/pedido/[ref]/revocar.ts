// POST /api/guia/pedido/:ref/revocar — da de baja el acceso.
//
// Para cuando el comprobante de una transferencia no aparece en el banco, o
// cuando un link se publicó en algún lado. La guía deja de renderizarse y
// pasa a mostrar la pantalla de acceso dado de baja.
//
// No borra la fila: queda el registro de que existió, con sus accesos. Se
// puede deshacer mandando `{ "deshacer": true }`.
import type { APIRoute } from 'astro';
import { runtime } from '@/lib/server/runtime';

// Ruta de servidor: se ejecuta por request, no se prerenderiza.
export const prerender = false;

import {
  type GuiaEnv, json, rechazoDeAuth, asegurarTabla, buscarPorRef, vistaAgente,
} from '@/lib/server/guia';

export const POST: APIRoute = async (context) => {
  const { request, params } = context;
  const { env } = runtime<GuiaEnv>(context.locals);

  const rechazo = rechazoDeAuth(request, env);
  if (rechazo) return rechazo;
  if (!env.DB) return json({ error: 'Base de datos no configurada (binding DB).' }, 500);

  let deshacer = false;
  try {
    const body: any = await request.json();
    deshacer = body?.deshacer === true;
  } catch { /* el cuerpo es opcional */ }

  const ref = String(params.ref);
  await asegurarTabla(env.DB);

  const fila = await buscarPorRef(env.DB, ref);
  if (!fila) return json({ error: 'No existe un pedido con esa referencia.' }, 404);

  await env.DB.prepare('UPDATE guias SET revocado_en = ? WHERE ref = ?')
    .bind(deshacer ? null : new Date().toISOString(), ref).run();

  const actualizada = await buscarPorRef(env.DB, ref);
  return json(vistaAgente(actualizada!, new URL(request.url).origin));
};
