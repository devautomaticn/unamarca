// POST /api/guia/pedido/:ref/pago-manual — el agente acredita una transferencia.
//
// ⚠️ ESTE ENDPOINT REGALA EL PRODUCTO SI SE USA MAL. Es el único camino por el
// que una guía se activa sin que Mercado Pago haya confirmado nada: el agente
// mira una captura de pantalla y decide. Una captura se falsifica en dos
// minutos y el agente no puede detectarlo.
//
// El control no está acá, está después: cada llamada dispara un mail a Mike con
// lo que el agente dijo haber visto, para poder cruzarlo contra el banco. Si no
// cierra, se revoca. Por eso `observado` se guarda: sin eso no hay con qué
// conciliar.
//
// Las tres condiciones que el agente tiene que verificar ANTES de llamar (van
// en docs/spec_guia_agente.md, y son responsabilidad suya, no de este código):
//   1. el monto es el precio de la guía o más
//   2. el destino es el alias/titular de la cuenta
//   3. la transferencia figura como realizada, no programada ni pendiente
import {
  type GuiaEnv, json, rechazoDeAuth, asegurarTabla, buscarPorRef, marcarPagado,
  vistaAgente, urlGuia,
} from '../../../../_lib/guia';
import { sendGuiaEntrega, sendGuiaAvisoTransferencia } from '../../../../_lib/guiaMails';

interface Body {
  metodo?: string;
  monto?: number;
  observado?: string;
}

export const onRequestPost: PagesFunction<GuiaEnv> = async (context) => {
  const { env, request, params, waitUntil } = context;

  const rechazo = rechazoDeAuth(request, env);
  if (rechazo) return rechazo;
  if (!env.DB) return json({ error: 'Base de datos no configurada (binding DB).' }, 500);

  let body: Body = {};
  try { body = await request.json(); } catch { /* el cuerpo es opcional */ }

  const ref = String(params.ref);
  const monto = Number.isFinite(body.monto) ? Number(body.monto) : null;
  const observado = body.observado ? String(body.observado).trim().slice(0, 500) : null;

  await asegurarTabla(env.DB);

  const previa = await buscarPorRef(env.DB, ref);
  if (!previa) return json({ error: 'No existe un pedido con esa referencia.' }, 404);
  if (previa.revocado_en) {
    return json({ error: 'Este pedido está revocado. No se puede acreditar.' }, 409);
  }

  const nota = [monto ? `Monto declarado: $${monto}` : null, observado]
    .filter(Boolean).join(' · ') || null;

  const { fila, yaEstaba } = await marcarPagado(env.DB, ref, 'transferencia', nota);
  if (!fila) return json({ error: 'No existe un pedido con esa referencia.' }, 404);

  const origin = new URL(request.url).origin;

  // Ya estaba pagado: el agente llamó dos veces. Se contesta ok igual (es
  // idempotente) pero sin volver a mandar mails.
  if (!yaEstaba && env.RESEND_API_KEY) {
    const apiKey = env.RESEND_API_KEY;
    const guiaUrl = urlGuia(origin, fila.token);
    waitUntil((async () => {
      try {
        await sendGuiaEntrega(apiKey, { email: fila.email, ref: fila.ref, guiaUrl });
      } catch (e) {
        console.error('guia: falló el mail de entrega', e);
      }
      try {
        await sendGuiaAvisoTransferencia(apiKey, {
          ref: fila.ref, email: fila.email, monto, observado, guiaUrl,
        });
      } catch (e) {
        console.error('guia: falló el aviso de transferencia', e);
      }
    })());
  }

  return json({ ...vistaAgente(fila, origin), yaEstaba });
};
