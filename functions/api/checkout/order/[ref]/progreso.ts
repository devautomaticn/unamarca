// POST /api/checkout/order/:ref/progreso
// Guarda lo que el cliente lleva cargado de la fase B (post-pago) mientras la
// completa: descripciones, colores, y los datos del titular.
//
// Por qué existe: hasta que se firma, todo eso vivía SOLO en el localStorage del
// navegador. Un cliente que pagaba y cerraba la pestaña —o que volvía desde otro
// dispositivo— dejaba el pedido cobrado y sin datos, y había que perseguirlo por
// WhatsApp. Con esto, entrar de nuevo a /registrar?order=<ref> devuelve lo que
// había cargado, desde cualquier lado.
//
// NO es `completion`: eso es la versión final, firmada, y la escribe el PATCH.
// Este endpoint nunca la toca. El ref es la llave de acceso, igual que en el
// resto de las rutas del pedido.
import { type CheckoutEnv, ensureProgresoColumn, ensureSchema, json } from '../../../../_lib/checkout';

/** Tope del cuerpo. El progreso son campos de texto: sin firma (que es una data
 *  URL grande) y sin PDF, no hay forma de que se acerque a esto por las buenas. */
const MAX_BYTES = 100_000;

export const onRequestPost: PagesFunction<CheckoutEnv> = async ({ env, params, request }) => {
  if (!env.DB) return json({ error: 'Base de datos no configurada' }, 500);
  await ensureSchema(env.DB);
  await ensureProgresoColumn(env.DB);

  const ref = String(params.ref || '');
  const row = await env.DB.prepare('SELECT ref, completion FROM orders WHERE ref = ?')
    .bind(ref).first<{ ref: string; completion: string | null }>();
  if (!row) return json({ error: 'Pedido no encontrado' }, 404);
  // Ya firmado: lo que valga es `completion`. Un guardado tardío (una pestaña
  // vieja que quedó abierta) no puede pisar lo que ya se envió.
  if (row.completion !== null) return json({ ok: true, ignorado: 'pedido ya enviado' });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400);
  }

  // Solo se guarda la forma que conocemos: nada de aceptar un blob arbitrario
  // que después haya que interpretar del otro lado.
  const progreso = {
    values: body?.values && typeof body.values === 'object' ? body.values : {},
    marcas: Array.isArray(body?.marcas) ? body.marcas : [],
    at: new Date().toISOString(),
  };

  const raw = JSON.stringify(progreso);
  if (raw.length > MAX_BYTES) return json({ error: 'Progreso demasiado grande' }, 413);

  await env.DB.prepare('UPDATE orders SET progreso = ?, updated_at = ? WHERE ref = ?')
    .bind(raw, progreso.at, ref).run();

  return json({ ok: true, at: progreso.at });
};
