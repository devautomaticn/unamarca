// GET  /api/checkout/order/:ref  — estado + snapshot del pedido (para resumir el wizard)
// PATCH /api/checkout/order/:ref — adjunta titular + firma (paso 6), genera el
//        PDF de la carta poder y envía los emails (cliente + admin) vía Resend.
// El ref es aleatorio y no adivinable: funciona como llave de lectura.
import {
  type CheckoutEnv, base64FromArrayBuffer, ensureSchema, json, marcasDesdePayload, sanitizeCm,
} from '../../../_lib/checkout';
import { sendOrderEmails, type MarcaEmail } from '../../../_lib/notify';
import { requiereLogo } from '../../../../src/lib/checkout/constants';

interface OrderRow {
  ref: string;
  status: string;
  payment_status: string | null;
  payload: string;
  completion: string | null;
}

interface NotifyEnv extends CheckoutEnv {
  RESEND_API_KEY?: string;
}

export const onRequestGet: PagesFunction<CheckoutEnv> = async ({ env, params }) => {
  if (!env.DB) return json({ error: 'Base de datos no configurada' }, 500);
  await ensureSchema(env.DB);

  const ref = String(params.ref || '');
  const row = await env.DB.prepare(
    'SELECT ref, status, payment_status, payload, completion FROM orders WHERE ref = ?'
  ).bind(ref).first<OrderRow>();

  if (!row) return json({ error: 'Pedido no encontrado' }, 404);

  return json({
    ref: row.ref,
    status: row.status,
    paymentStatus: row.payment_status,
    payload: JSON.parse(row.payload),
    completed: row.completion !== null,
  });
};

export const onRequestPatch: PagesFunction<NotifyEnv> = async ({ env, params, request }) => {
  if (!env.DB) return json({ error: 'Base de datos no configurada' }, 500);
  await ensureSchema(env.DB);

  const ref = String(params.ref || '');
  const row = await env.DB.prepare('SELECT ref, status, payload FROM orders WHERE ref = ?')
    .bind(ref).first<{ ref: string; status: string; payload: string }>();
  if (!row) return json({ error: 'Pedido no encontrado' }, 404);

  let completion: any;
  try {
    completion = await request.json();
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400);
  }

  // Cap de tamaño (la firma viaja como data URL)
  const raw = JSON.stringify(completion);
  if (raw.length > 500_000) return json({ error: 'Payload demasiado grande' }, 413);

  await env.DB.prepare(
    'UPDATE orders SET completion = ?, completed_at = ?, updated_at = ? WHERE ref = ?'
  ).bind(raw, new Date().toISOString(), new Date().toISOString(), ref).run();

  // ── Emails con la carta poder adjunta ───────────────────
  // El PDF llega generado desde el navegador (completion.cartaPdfBase64) —
  // generarlo acá excede el límite de CPU del plan free (error 1102).
  // El pedido queda guardado aunque esto falle: los emails se pueden reenviar.
  let emailSent = false;
  try {
    if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY no configurada en este entorno');

    // marcas/clases/pricing salen del snapshot del servidor (no del cliente):
    // es lo que el cliente pagó. Descripción y sitio web se cargan en el paso 5
    // (post-pago) y solo existen en completion: se pegan por nombre de marca.
    const stored = JSON.parse(row.payload);
    const t = completion?.titular ?? {};
    const dom = t?.domicilio ?? {};

    // Las dos listas salen del mismo array ordenado del wizard: el índice es la
    // clave fiable. El nombre queda de respaldo por si el cliente reordenó.
    // (Legado v1: la descripción venía suelta en completion.marca.)
    const completionMarcas: any[] = Array.isArray(completion?.marcas)
      ? completion.marcas
      : (completion?.marca ? [completion.marca] : []);
    const porNombre: Record<string, any> = {};
    for (const m of completionMarcas) {
      const key = String(m?.nombre ?? '').trim().toLowerCase();
      if (key) porNombre[key] = m;
    }

    // El tipo y la key del logo salen del snapshot del servidor; la
    // enunciación de colores y las medidas las carga el cliente en el paso 5.
    const marcas: MarcaEmail[] = marcasDesdePayload(stored).map((m, i) => {
      const porIndice = completionMarcas[i];
      const extra = (
        String(porIndice?.nombre ?? '').trim().toLowerCase() === m.nombre.toLowerCase()
          ? porIndice
          : porNombre[m.nombre.toLowerCase()] ?? porIndice
      ) ?? {};
      const tipo = m.tipo ?? 'denominativa';
      return {
        nombre: m.nombre,
        clases: m.clases,
        tipo,
        descripcion: (extra.descripcion || '').trim(),
        sitioWeb: (extra.sitioWeb || '').trim(),
        ...(requiereLogo(tipo) ? {
          colores: String(extra.colores || '').trim(),
          alto: sanitizeCm(extra.alto),
          ancho: sanitizeCm(extra.ancho),
          logoAdjunto: null as string | null,
        } : {}),
      };
    });

    // Los logos se adjuntan al email del admin: es lo que sube al portal del
    // INPI. R2 queda como la copia durable. Si el binding no está (o el objeto
    // no aparece) el email lo dice y el pedido se envía igual.
    const logos: { filename: string; content: string }[] = [];
    const storedMarcas = marcasDesdePayload(stored);
    for (let i = 0; i < marcas.length; i++) {
      const key = storedMarcas[i]?.logoKey;
      if (!key || !env.LOGOS) continue;
      try {
        const obj = await env.LOGOS.get(key);
        if (!obj) continue;
        const filename = `logo-${ref}-marca-${i + 1}.jpg`;
        logos.push({ filename, content: base64FromArrayBuffer(await obj.arrayBuffer()) });
        marcas[i].logoAdjunto = filename;
      } catch (e) {
        console.error(`No se pudo leer el logo ${key}:`, e);
      }
    }

    await sendOrderEmails(env.RESEND_API_KEY, {
      ref,
      status: row.status,
      marcas,
      clientEmail: stored.contacto?.email || completion?.contacto?.email || '',
      garantia: !!stored.garantia,
      total: stored.pricing?.total ?? 0,
      titularResumen: [
        ['Nombre', `${t.nombre || ''} ${t.apellido || ''}`.trim()],
        ['Documento', `${t.documento?.tipo || ''} ${t.documento?.numero || ''}`.trim()],
        ['CUIT/CUIL', t.cuit || ''],
        ['Género', t.genero || ''],
        ['Estado civil', t.estadoCivil || ''],
        ...(t.nombreConyuge ? [['Cónyuge', t.nombreConyuge] as [string, string]] : []),
        ['Domicilio', [dom.calle, dom.numero, dom.piso && `piso ${dom.piso}`, dom.depto && `depto ${dom.depto}`].filter(Boolean).join(' ')],
        ['Localidad', `${dom.localidad || ''} (CP ${dom.codigoPostal || '—'}), ${dom.provincia || ''}, ${dom.pais || 'Argentina'}`],
        ['Email', stored.contacto?.email || ''],
        ['WhatsApp', stored.contacto?.whatsapp || ''],
      ],
    }, completion?.cartaPdfBase64 || null, logos);
    emailSent = true;
  } catch (e) {
    console.error('Error generando PDF / enviando emails:', e);
  }

  return json({ ok: true, ref, emailSent });
};
