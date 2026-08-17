// GET /api/guia/pedido/:ref — estado de un pedido.
//
// El agente NO necesita consultar esto de rutina: el webhook acredita solo y
// el cliente ya tiene su link. Es para el caso en que dice "ya pagué" y cerró
// la pestaña, y el agente quiere confirmar antes de responderle.
import { type GuiaEnv, json, rechazoDeAuth, asegurarTabla, buscarPorRef, vistaAgente } from '../../../_lib/guia';

export const onRequestGet: PagesFunction<GuiaEnv> = async (context) => {
  const { env, request, params } = context;

  const rechazo = rechazoDeAuth(request, env);
  if (rechazo) return rechazo;
  if (!env.DB) return json({ error: 'Base de datos no configurada (binding DB).' }, 500);

  await asegurarTabla(env.DB);

  const fila = await buscarPorRef(env.DB, String(params.ref));
  if (!fila) return json({ error: 'No existe un pedido con esa referencia.' }, 404);

  return json(vistaAgente(fila, new URL(request.url).origin));
};
