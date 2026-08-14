// GET  /api/checkout/order/:ref  — estado + snapshot del pedido (para resumir el wizard)
// PATCH /api/checkout/order/:ref — adjunta titular + firma (paso 6), genera el
//        PDF de la carta poder y envía los emails (cliente + admin) vía Resend.
// El ref es aleatorio y no adivinable: funciona como llave de lectura.
import {
  type CheckoutEnv, base64FromArrayBuffer, ensureSchema, ensureVigilanteColumn,
  json, marcasDesdePayload, sanitizeCm,
} from '../../../_lib/checkout';
import { sendOrderEmails, sendVigilanteAlert, type MarcaEmail } from '../../../_lib/notify';
import { crearAltaVigilante, type VigilanteEnv } from '../../../_lib/vigilante';
import { requiereLogo, tipoMarcaLabel } from '../../../../src/lib/checkout/constants';

interface OrderRow {
  ref: string;
  status: string;
  payment_status: string | null;
  payload: string;
  completion: string | null;
}

interface NotifyEnv extends CheckoutEnv, VigilanteEnv {
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

export const onRequestPatch: PagesFunction<NotifyEnv> = async ({ env, params, request, waitUntil }) => {
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

  // ── Datos consolidados del pedido ───────────────────────
  // marcas/clases/pricing salen del snapshot del servidor (no del cliente): es
  // lo que el cliente pagó. Descripción, sitio web, colores y medidas se cargan
  // post-pago y solo existen en completion. Los usan tanto los emails como el
  // alta en el portal, así que se arman una sola vez.
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

  const storedMarcas = marcasDesdePayload(stored);

  // El tipo y la key del logo salen del snapshot del servidor; la
  // enunciación de colores y las medidas las carga el cliente en el paso 5.
  const marcas: MarcaEmail[] = storedMarcas.map((m, i) => {
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

  // Los logos se leen UNA vez de R2 y los usan los dos consumidores: el email
  // del admin (en base64) y el alta en el portal (como parte multipart). Si el
  // binding no está o el objeto no aparece, todo sigue sin el logo.
  const logos: { filename: string; content: string }[] = [];
  const logosBytes: (ArrayBuffer | null)[] = storedMarcas.map(() => null);
  for (let i = 0; i < marcas.length; i++) {
    const key = storedMarcas[i]?.logoKey;
    if (!key || !env.LOGOS) continue;
    try {
      const obj = await env.LOGOS.get(key);
      if (!obj) continue;
      const bytes = await obj.arrayBuffer();
      const filename = `logo-${ref}-marca-${i + 1}.jpg`;
      logosBytes[i] = bytes;
      logos.push({ filename, content: base64FromArrayBuffer(bytes) });
      marcas[i].logoAdjunto = filename;
    } catch (e) {
      console.error(`No se pudo leer el logo ${key}:`, e);
    }
  }

  // ── Emails con la carta poder adjunta ───────────────────
  // El PDF llega generado desde el navegador (completion.cartaPdfBase64) —
  // generarlo acá excede el límite de CPU del plan free (error 1102).
  // El pedido queda guardado aunque esto falle: los emails se pueden reenviar.
  let emailSent = false;
  try {
    if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY no configurada en este entorno');

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

  // ── Alta en el portal Vigilante ─────────────────────────
  // Crea el contacto, la marca y un trámite POR CLASE. Va en waitUntil: el
  // pedido ya está guardado y los emails ya salieron, así que el cliente no
  // tiene por qué esperar a que responda el portal. Ni un portal caído ni una
  // credencial vencida pueden voltear la confirmación. El resultado queda en la
  // columna `vigilante` para saber desde dónde retomar si algo falló.
  const altaEnVigilante = async () => {
  const alta = await crearAltaVigilante(env, {
    ref,
    contacto: {
      nombre: String(t.nombre || '').trim(),
      apellido: String(t.apellido || '').trim(),
      tipo: 'Humana', // el checkout todavía no acepta personas jurídicas
      cuit: String(t.cuit || '').trim(),
      email: stored.contacto?.email || completion?.contacto?.email || '',
      telefono: stored.contacto?.whatsapp || completion?.contacto?.whatsapp || '',
      tipo_doc: String(t.documento?.tipo || '').trim(),
      documento: String(t.documento?.numero || '').trim(),
      genero: String(t.genero || '').trim(),
      estado_civil: String(t.estadoCivil || '').trim(),
      conyuge: String(t.nombreConyuge || '').trim(),
      pais: String(dom.pais || 'Argentina').trim(),
      provincia: String(dom.provincia || '').trim(),
      calle: String(dom.calle || '').trim(),
      numero: String(dom.numero || '').trim(),
      piso: String(dom.piso || '').trim(),
      depto: String(dom.depto || '').trim(),
      localidad: String(dom.localidad || '').trim(),
      cp: String(dom.codigoPostal || '').trim(),
      notas: `Alta automática desde el checkout web. Pedido ${ref}.`,
    },
    marcas: marcas.map((m, i) => ({
      // En una figurativa el nombre es nuestra referencia interna, no una
      // denominación ante el INPI: el `tipo` que va al lado ya lo aclara.
      denominacion: m.nombre,
      tipo: tipoMarcaLabel(m.tipo ?? 'denominativa'),
      clases: m.clases,
      descripcion: m.descripcion,
      colores: m.colores,
      alto: m.alto ?? null,
      ancho: m.ancho ?? null,
      logo: logosBytes[i]
        ? { filename: `logo-${ref}-marca-${i + 1}.jpg`, bytes: logosBytes[i]! }
        : null,
    })),
  });

  if (alta.omitido) {
    console.warn(`[vigilante] alta omitida para ${ref}: ${alta.error}`);
  } else if (!alta.ok) {
    console.error(`[vigilante] alta fallida para ${ref}:`, alta.status, alta.error, alta.detalles);
  } else {
    // Un 201 no significa que los datos estén bien: las advertencias son el
    // único aviso de que el mapeo se rompió, porque no falla ningún pedido.
    if (alta.advertencias?.length) {
      console.warn(`[vigilante] advertencias en ${ref}:`, JSON.stringify(alta.advertencias));
    }
    console.log(`[vigilante] alta ok para ${ref}: trámites ${alta.tramites?.join(', ')}`);
  }

  try {
    await ensureVigilanteColumn(env.DB);
    await env.DB.prepare('UPDATE orders SET vigilante = ? WHERE ref = ?')
      .bind(JSON.stringify({ ...alta, at: new Date().toISOString() }), ref).run();
  } catch (e) {
    console.error('No se pudo guardar el resultado del alta en Vigilante:', e);
  }

  // El portal avisa por email al estudio cuando devuelve 400, 403 o 500. Lo que
  // NO ve nadie del otro lado son las advertencias de un 201 (el mapeo se
  // rompió pero el pedido entró igual) y un timeout de red (la request nunca
  // llegó). Eso lo avisamos nosotros.
  // El caso "sin credencial" solo se avisa en producción: en los previews y en
  // local es lo normal, y avisarlo sería un email por cada pedido de prueba.
  const esProduccion = new URL(request.url).hostname === 'unamarca.com.ar';
  const necesitaAtencion = (alta.omitido && esProduccion)
    || (!alta.ok && !alta.omitido && !alta.status)
    || !!alta.advertencias?.length;
  if (necesitaAtencion && env.RESEND_API_KEY) {
    try {
      await sendVigilanteAlert(env.RESEND_API_KEY, { ref, alta });
    } catch (e) {
      console.error('No se pudo avisar del alta en Vigilante:', e);
    }
  }
  };

  // waitUntil mantiene vivo el contexto después de responder. Si el entorno no
  // lo expone (dev local), se espera nomás.
  if (typeof waitUntil === 'function') waitUntil(altaEnVigilante());
  else await altaEnVigilante();

  return json({ ok: true, ref, emailSent });
};
