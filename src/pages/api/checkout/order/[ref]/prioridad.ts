// POST /api/checkout/order/:ref/prioridad?i=<indice>&p=<id>&doc=certificado|traduccion
// Sube el certificado de una solicitud de origen (o su traducción) al bucket
// R2. Una marca puede tener varias —hay oficinas que piden una solicitud por
// clase—, y `p` es el id estable de cada una (ver `PrioridadMarca.id`).
// El body es el PDF crudo (Content-Type: application/pdf).
//
// La key es determinística (`prioridadKeyFor`) y no se anota en el pedido: el
// alta la lee de ahí, igual que el poder. Que el objeto exista ES el dato de
// que el cliente lo subió.
//
// El ref es la llave de acceso, igual que en el logo. Se puede re-subir
// mientras el pedido no esté completado (el cliente se equivocó de archivo).
//
// Si el cliente todavía no tiene el certificado, paga igual y no sube nada: el
// estudio lo recibe después y lo carga a mano en el portal Vigilante.
import type { APIRoute } from 'astro';
import { runtime } from '@/lib/server/runtime';

// Ruta de servidor: se ejecuta por request, no se prerenderiza.
export const prerender = false;

import {
  type CheckoutEnv, type DocPrioridad, ensureSchema, json, marcasDesdePayload,
  prioridadKeyFor,
} from '@/lib/server/checkout';
import { PRIORIDAD_MAX_BYTES, idPrioridadValido } from '@/lib/checkout/constants';

export const POST: APIRoute = async ({ params, request, locals }) => {
  const { env } = runtime<CheckoutEnv>(locals);
  if (!env.DB) return json({ error: 'Base de datos no configurada' }, 500);
  if (!env.LOGOS) return json({ error: 'Almacenamiento no configurado' }, 503);
  await ensureSchema(env.DB);

  const ref = String(params.ref || '');
  const url = new URL(request.url);
  const indice = parseInt(url.searchParams.get('i') || '', 10);
  if (!Number.isInteger(indice) || indice < 0) {
    return json({ error: 'Índice de marca inválido' }, 400);
  }
  const id = url.searchParams.get('p');
  if (!idPrioridadValido(id)) return json({ error: 'Solicitud de origen inválida' }, 400);
  const doc = url.searchParams.get('doc');
  if (doc !== 'certificado' && doc !== 'traduccion') {
    return json({ error: 'Documento inválido' }, 400);
  }

  const row = await env.DB.prepare(
    'SELECT ref, payload, completion FROM orders WHERE ref = ?'
  ).bind(ref).first<{ ref: string; payload: string; completion: string | null }>();
  if (!row) return json({ error: 'Pedido no encontrado' }, 404);
  if (row.completion !== null) {
    return json({ error: 'El pedido ya fue enviado' }, 409);
  }
  if (!marcasDesdePayload(JSON.parse(row.payload))[indice]) {
    return json({ error: 'La marca no existe en este pedido' }, 404);
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) return json({ error: 'Archivo vacío' }, 400);
  if (bytes.byteLength > PRIORIDAD_MAX_BYTES) {
    return json({ error: 'El archivo pesa más de 4 MB' }, 413);
  }
  // `%PDF-`: el portal lo valida por contenido, así que lo que no sea PDF
  // terminaría descartado del otro lado sin que nadie se entere.
  const c = new Uint8Array(bytes.slice(0, 5));
  if (!(c[0] === 0x25 && c[1] === 0x50 && c[2] === 0x44 && c[3] === 0x46 && c[4] === 0x2d)) {
    return json({ error: 'El archivo tiene que ser un PDF' }, 415);
  }

  const key = prioridadKeyFor(ref, indice, id, doc as DocPrioridad);
  await env.LOGOS.put(key, bytes, { httpMetadata: { contentType: 'application/pdf' } });
  return json({ ok: true, key, bytes: bytes.byteLength });
};
