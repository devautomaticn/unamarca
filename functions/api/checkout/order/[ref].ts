// GET  /api/checkout/order/:ref  — estado + snapshot del pedido (para resumir el wizard)
// PATCH /api/checkout/order/:ref — adjunta titular + firma (paso 6), genera el
//        PDF de la carta poder y envía los emails (cliente + admin) vía Resend.
// El ref es aleatorio y no adivinable: funciona como llave de lectura.
import { type CheckoutEnv, ensureSchema, json } from '../../../_lib/checkout';
import { buildCartaPoderPdf, hoyEnBuenosAires } from '../../../_lib/pdf';
import { sendOrderEmails } from '../../../_lib/notify';

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

  // ── Carta poder PDF + emails ────────────────────────────
  // El pedido queda guardado aunque esto falle: los emails se pueden reenviar.
  let emailSent = false;
  try {
    if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY no configurada en este entorno');

    // marca/clase/pricing salen del snapshot del servidor (no del cliente)
    const stored = JSON.parse(row.payload);
    const t = completion?.titular ?? {};
    const dom = t?.domicilio ?? {};

    const pdf = await buildCartaPoderPdf({
      nombreApellido: `${t.nombre || ''} ${t.apellido || ''}`.trim(),
      docTipo: t.documento?.tipo || 'DNI',
      docNumero: t.documento?.numero || '',
      cuit: t.cuit || '',
      calle: dom.calle || '',
      numero: dom.numero || '',
      piso: dom.piso || undefined,
      depto: dom.depto || undefined,
      codigoPostal: dom.codigoPostal || '',
      localidad: dom.localidad || '',
      provincia: dom.provincia || '',
      marca: stored.marca?.nombre || '',
      clases: stored.clase ? [stored.clase] : [],
      fecha: hoyEnBuenosAires(),
    }, completion?.firma);

    await sendOrderEmails(env.RESEND_API_KEY, {
      ref,
      status: row.status,
      marca: stored.marca?.nombre || '',
      clase: stored.clase ?? null,
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
    }, pdf);
    emailSent = true;
  } catch (e) {
    console.error('Error generando PDF / enviando emails:', e);
  }

  return json({ ok: true, ref, emailSent });
};
