// GET /api/guia/diagnostico — TEMPORAL, para destrabar el webhook de prueba.
//
// ⚠️ BORRAR ESTE ARCHIVO cuando el webhook quede verificado. No aporta nada al
// producto: existe sólo para responder "¿la clave que tiene este entorno es la
// misma que figura en el panel de Mercado Pago?" sin que la clave viaje por un
// chat ni aparezca en un log.
//
// No devuelve ningún secreto: sólo si está presente, cuánto mide, y los
// primeros 12 caracteres de su SHA-256. Del otro lado se calcula lo mismo con:
//
//   echo -n "LA_CLAVE_DEL_PANEL" | shasum -a 256 | cut -c1-12
//
// Si coinciden, el entorno tiene la clave correcta y el problema es que Mercado
// Pago no está entregando la notificación. Si no coinciden, es la clave.
import type { APIRoute } from 'astro';
import { runtime } from '@/lib/server/runtime';
import { rechazoDeAuth, json, type GuiaEnv } from '@/lib/server/guia';

export const prerender = false;

interface DiagEnv extends GuiaEnv {
  MP_WEBHOOK_SECRET?: string;
  MP_ACCESS_TOKEN?: string;
}

/** Primeros 12 hex del SHA-256. Suficiente para comparar, inútil para revertir. */
async function huella(valor: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(valor));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

export const GET: APIRoute = async (context) => {
  const { env } = runtime<DiagEnv>(context.locals);

  const rechazo = rechazoDeAuth(context.request, env);
  if (rechazo) return rechazo;

  const secreto = env.MP_WEBHOOK_SECRET || '';
  const token = env.MP_ACCESS_TOKEN || '';

  return json({
    commit: import.meta.env.CF_PAGES_COMMIT_SHA ?? null,
    mpWebhookSecret: {
      presente: !!secreto,
      largo: secreto.length,
      huella: secreto ? await huella(secreto) : null,
    },
    mpAccessToken: {
      presente: !!token,
      // TEST-… vs APP_USR-…: dice de una si el entorno es de prueba o productivo.
      prefijo: token ? token.slice(0, 5) : null,
    },
    db: !!env.DB,
    resend: !!env.RESEND_API_KEY,
  });
};
