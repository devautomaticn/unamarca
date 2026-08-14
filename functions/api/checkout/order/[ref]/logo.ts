// POST /api/checkout/order/:ref/logo?i=<indice>
// Sube el logo de una marca mixta o figurativa al bucket R2 y anota la key en
// el payload del pedido. El body es el JPG crudo (Content-Type: image/jpeg):
// el navegador ya convirtió y redimensionó la imagen antes de mandarla.
//
// El ref es la llave de acceso, igual que en el GET/PATCH del pedido. Se puede
// re-subir mientras el pedido no esté completado (el cliente cambia de logo).
//
// Sin binding LOGOS devuelve 503 y el wizard sigue: el logo se le pide al
// cliente por WhatsApp. Es el estado hasta que R2 esté habilitado en la cuenta.
import {
  type CheckoutEnv, ensureSchema, json, logoKeyFor, marcasDesdePayload,
} from '../../../../_lib/checkout';
import { requiereLogo } from '../../../../../src/lib/checkout/constants';

/** Tope de subida. No es un límite de producto: el JPG que genera el wizard
 *  ronda los 300 KB. Es el techo que evita que un ref filtrado se convierta en
 *  almacenamiento gratis para cualquiera. */
const MAX_BYTES = 10 * 1024 * 1024;

export const onRequestPost: PagesFunction<CheckoutEnv> = async ({ env, params, request }) => {
  if (!env.DB) return json({ error: 'Base de datos no configurada' }, 500);
  if (!env.LOGOS) return json({ error: 'Almacenamiento de logos no configurado' }, 503);
  await ensureSchema(env.DB);

  const ref = String(params.ref || '');
  const indice = parseInt(new URL(request.url).searchParams.get('i') || '', 10);
  if (!Number.isInteger(indice) || indice < 0) {
    return json({ error: 'Índice de marca inválido' }, 400);
  }

  const row = await env.DB.prepare(
    'SELECT ref, payload, completion FROM orders WHERE ref = ?'
  ).bind(ref).first<{ ref: string; payload: string; completion: string | null }>();
  if (!row) return json({ error: 'Pedido no encontrado' }, 404);
  if (row.completion !== null) {
    return json({ error: 'El pedido ya fue enviado' }, 409);
  }

  const stored = JSON.parse(row.payload);
  const marcas = marcasDesdePayload(stored);
  const marca = marcas[indice];
  if (!marca) return json({ error: 'La marca no existe en este pedido' }, 404);
  if (!requiereLogo(marca.tipo ?? 'denominativa')) {
    return json({ error: 'Esta marca no lleva logo' }, 400);
  }

  const tipoContenido = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!tipoContenido.startsWith('image/jpeg')) {
    return json({ error: 'El logo tiene que ser un JPG' }, 415);
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) return json({ error: 'Archivo vacío' }, 400);
  if (bytes.byteLength > MAX_BYTES) return json({ error: 'Archivo demasiado grande' }, 413);
  // Firma de JPEG (FF D8 FF): que el Content-Type diga image/jpeg no alcanza.
  const cabecera = new Uint8Array(bytes.slice(0, 3));
  if (cabecera[0] !== 0xff || cabecera[1] !== 0xd8 || cabecera[2] !== 0xff) {
    return json({ error: 'El archivo no es un JPG válido' }, 415);
  }

  const key = logoKeyFor(ref, indice);
  await env.LOGOS.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } });

  // La key queda en el payload del servidor, no en el completion del cliente:
  // es un dato que escribimos nosotros y tiene que sobrevivir a cualquier
  // reenvío del paso 5.
  const marcasPayload = Array.isArray(stored.marcas) ? stored.marcas : [];
  if (marcasPayload[indice]) {
    marcasPayload[indice].logoKey = key;
    stored.marcas = marcasPayload;
    await env.DB.prepare('UPDATE orders SET payload = ?, updated_at = ? WHERE ref = ?')
      .bind(JSON.stringify(stored), new Date().toISOString(), ref).run();
  }

  return json({ ok: true, logoKey: key, bytes: bytes.byteLength });
};
