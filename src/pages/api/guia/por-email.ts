// GET /api/guia/por-email?email=... — recupera las guías de un cliente.
//
// Esto es lo que reemplaza la página de "perdí mi link": el cliente le escribe
// al agente, el agente consulta acá y le vuelve a pegar la URL en el chat. Una
// página menos, un envío de mail menos, un modo de falla menos.
//
// Devuelve todas las guías de ese mail (lo normal es una), de la más nueva a la
// más vieja, con su estado. El agente pega la que esté `pagado`.
import type { APIRoute } from 'astro';
import { runtime } from '@/lib/server/runtime';

// Ruta de servidor: se ejecuta por request, no se prerenderiza.
export const prerender = false;

import {
  type GuiaEnv, json, rechazoDeAuth, asegurarTabla, vistaAgente, type FilaGuia,
  normalizarEmail, emailValido,
} from '@/lib/server/guia';

export const GET: APIRoute = async (context) => {
  const { request } = context;
  const { env } = runtime<GuiaEnv>(context.locals);

  const rechazo = rechazoDeAuth(request, env);
  if (rechazo) return rechazo;
  if (!env.DB) return json({ error: 'Base de datos no configurada (binding DB).' }, 500);

  const email = normalizarEmail(new URL(request.url).searchParams.get('email'));
  if (!emailValido(email)) return json({ error: 'Falta un email válido.' }, 400);

  await asegurarTabla(env.DB);

  const { results } = await env.DB.prepare(
    'SELECT * FROM guias WHERE email = ? ORDER BY creado_en DESC LIMIT 10'
  ).bind(email).all<FilaGuia>();

  const origin = new URL(request.url).origin;
  return json({ guias: (results || []).map(f => vistaAgente(f, origin)) });
};
