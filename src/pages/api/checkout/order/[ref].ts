// GET  /api/checkout/order/:ref  — estado + snapshot del pedido (para resumir el wizard)
// PATCH /api/checkout/order/:ref — adjunta titular + firma (paso 6), genera el
//        PDF de la carta poder y envía los emails (cliente + admin) vía Resend.
// El ref es aleatorio y no adivinable: funciona como llave de lectura.
import type { APIRoute } from 'astro';
import { runtime } from '@/lib/server/runtime';

// Ruta de servidor: se ejecuta por request, no se prerenderiza.
export const prerender = false;

import {
  type CheckoutEnv, base64FromArrayBuffer, consolidarMarcas, ensureSchema,
  ensureProgresoColumn, ensureVigilanteColumn, json, titularesDesdeCompletion,
} from '@/lib/server/checkout';
import {
  sendFirmaInvite, sendOrderEmails,
  type FirmaPendienteEmail, type TitularEmail,
} from '@/lib/server/notify';
import { abrirFirma, asegurarTablaFirmas, urlFirma } from '@/lib/server/firmas';
import { darDeAltaEnVigilante } from '@/lib/server/altaPedido';
import type { VigilanteEnv } from '@/lib/server/vigilante';
import { formatPorcentaje, nombreTitular, type TitularPedido } from '@/lib/checkout/constants';

interface OrderRow {
  ref: string;
  status: string;
  payment_status: string | null;
  payload: string;
  completion: string | null;
  vigilante: string | null;
  progreso: string | null;
}

interface NotifyEnv extends CheckoutEnv, VigilanteEnv {
  RESEND_API_KEY?: string;
}

export const GET: APIRoute = async ({ params, locals }) => {
  const { env } = runtime<NotifyEnv>(locals);
  if (!env.DB) return json({ error: 'Base de datos no configurada' }, 500);
  await ensureSchema(env.DB);
  // Las columnas pueden no existir en pedidos viejos ni en una base recién creada
  await ensureVigilanteColumn(env.DB);
  await ensureProgresoColumn(env.DB);

  const ref = String(params.ref || '');
  const row = await env.DB.prepare(
    'SELECT ref, status, payment_status, payload, completion, vigilante, progreso FROM orders WHERE ref = ?'
  ).bind(ref).first<OrderRow>();

  if (!row) return json({ error: 'Pedido no encontrado' }, 404);

  // El alta en el portal corre en waitUntil, así que no se puede ver en la
  // respuesta del PATCH. Se expone acá: es la única forma de verificar que un
  // pedido quedó cargado sin entrar al panel de Cloudflare. El ref ya es la
  // llave de lectura del pedido entero, así que no agrega superficie.
  let vigilante: unknown = null;
  try { vigilante = row.vigilante ? JSON.parse(row.vigilante) : null; } catch { /* ignorar */ }

  // Lo que el cliente llevaba cargado del post-pago. Es lo que permite retomar
  // desde otro dispositivo o con el storage borrado.
  let progreso: unknown = null;
  try { progreso = row.progreso ? JSON.parse(row.progreso) : null; } catch { /* ignorar */ }

  return json({
    ref: row.ref,
    status: row.status,
    paymentStatus: row.payment_status,
    payload: JSON.parse(row.payload),
    completed: row.completion !== null,
    vigilante,
    progreso,
  });
};

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const { env, waitUntil } = runtime<NotifyEnv>(locals);
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

  // Una marca puede tener hasta MAX_TITULARES dueños, cada uno con su set
  // completo de datos y su porcentaje. `titular` (singular) es el legado de
  // cuando había uno solo: los pedidos viejos se releen para reenviar emails.
  const titulares = titularesDesdeCompletion(completion);
  // El que completó el checkout: es de quien salen el WhatsApp y el email de
  // contacto del pedido, y quien firmó el poder en el paso 7.
  const principal: TitularPedido | undefined = titulares.find(x => x.firmaAqui) ?? titulares[0];

  // Marcas del snapshot del pago + lo que el cliente cargó post-pago, y las
  // correcciones de tipo que hizo en el paso 5 (ver corregirTipoPostPago). Van
  // al email: el pedido dejó de coincidir con el snapshot del pago y el estudio
  // tiene que poder verlo.
  const { storedMarcas, marcas, correcciones } = consolidarMarcas(stored, completion);

  // El pedido guardado tiene que quedar igual a lo que se presenta: si no, el
  // cliente que vuelve con ?order=REF ve otra vez la marca sin corregir, y un
  // reenvío de emails la reconstruiría mal.
  if (correcciones.length) {
    console.warn(`[${ref}] corrección de tipo post-pago: ${correcciones.join(' · ')}`);
    if (Array.isArray(stored.marcas)) {
      marcas.forEach((mc, i) => {
        if (stored.marcas[i]) {
          stored.marcas[i].nombre = mc.nombre;
          stored.marcas[i].tipo = mc.tipo;
        }
      });
    } else if (stored.marca) {
      stored.marca.nombre = marcas[0].nombre;
      stored.marca.tipo = marcas[0].tipo;
    }
    try {
      await env.DB.prepare('UPDATE orders SET payload = ?, updated_at = ? WHERE ref = ?')
        .bind(JSON.stringify(stored), new Date().toISOString(), ref).run();
    } catch (e) {
      // No frena el checkout: los emails y el alta ya llevan el tipo corregido
      console.error(`[${ref}] no se pudo persistir la corrección de tipo:`, e);
    }
  }

  // Los logos van adjuntos al email del admin: es quien los sube al portal del
  // INPI. Si el binding no está o el objeto no aparece, el email sale igual y
  // avisa que hay que pedírselo al cliente.
  const logos: { filename: string; content: string }[] = [];
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

  // ── Cadena de firmas de la carta poder ──────────────────
  // El poder es UNO solo con un pie de firma por titular. El que completó el
  // checkout ya firmó (viene en `completion.firma`); al resto se le abre un
  // renglón con su propio token y le sale el link por email.
  //
  // Esto va ANTES de los emails del pedido a propósito: el email al cliente y
  // el del estudio tienen que decir qué firmas faltan, y eso recién se sabe
  // cuando los renglones existen.
  const origin = new URL(request.url).origin;
  const contactoEmail = stored.contacto?.email || completion?.contacto?.email || '';
  const firmaFirmante: string = typeof completion?.firma === 'string' ? completion.firma : '';
  const pendientes: (FirmaPendienteEmail & { porcentaje: string })[] = [];

  if (titulares.length > 1) {
    try {
      await asegurarTablaFirmas(env.DB);
      for (let i = 0; i < titulares.length; i++) {
        const titular = titulares[i];
        const nombre = nombreTitular(titular) || `Titular ${i + 1}`;
        // El firmante entra con su firma puesta: ya firmó en el paso 7 y no
        // tiene que recibir ningún link.
        const email = titular.email || (titular.firmaAqui ? contactoEmail : '');
        const { fila, nueva } = await abrirFirma(env.DB, {
          ref, idx: i, nombre, email,
          firma: titular.firmaAqui ? (firmaFirmante || null) : null,
        });
        if (fila.firma) continue;
        pendientes.push({
          nombre, email: fila.email, url: urlFirma(origin, fila.token),
          porcentaje: formatPorcentaje(titular.porcentaje),
        });
        // Un PATCH repetido no vuelve a mandar el mismo pedido de firma: el
        // renglón ya estaba abierto y el email ya salió.
        if (!nueva) continue;
        if (!fila.email) {
          console.error(`[${ref}] el cotitular ${i + 1} (${nombre}) no tiene email: hay que pedirle la firma a mano`);
          continue;
        }
        if (!env.RESEND_API_KEY) continue;
        try {
          await sendFirmaInvite(env.RESEND_API_KEY, {
            ref, nombre, email: fila.email,
            url: urlFirma(origin, fila.token),
            marcas,
            completadoPor: nombreTitular(principal ?? {}) || 'El titular del pedido',
            porcentaje: formatPorcentaje(titular.porcentaje),
            responderA: contactoEmail || undefined,
          });
        } catch (e) {
          // No frena nada: el pedido está pago y guardado, y el email al estudio
          // lleva el link para reenviarlo a mano.
          console.error(`[${ref}] no se pudo invitar a firmar a ${fila.email}:`, e);
        }
      }
    } catch (e) {
      console.error(`[${ref}] no se pudo abrir la cadena de firmas:`, e);
    }
  }

  // ── Emails con la carta poder adjunta ───────────────────
  // El PDF llega generado desde el navegador (completion.cartaPdfBase64) —
  // generarlo acá excede el límite de CPU del plan free (error 1102).
  // El pedido queda guardado aunque esto falle: los emails se pueden reenviar.
  const titularesEmail: TitularEmail[] = titulares.map((x, i) => {
    const d = x.domicilio;
    const pct = formatPorcentaje(x.porcentaje);
    const email = x.email || (x.firmaAqui ? contactoEmail : '');

    // De un cotitular sólo tenemos email y porcentaje hasta que entra a firmar:
    // el resto lo carga él. Mandar la tabla entera en blanco haría pensar que
    // el cliente se olvidó de completarla.
    if (!nombreTitular(x)) {
      return {
        titulo: `Titular ${i + 1} de ${titulares.length} · ${pct}% · datos pendientes`,
        filas: [
          ['Email', email],
          ['Titularidad', `${pct}%`],
          ['Estado', 'Carga sus datos y firma desde su link. Llegan en el email "Firma N de M".'],
        ],
      };
    }

    return {
      titulo: `Titular ${i + 1} de ${titulares.length} · ${pct}%`
        + (x.firmaAqui ? ' · completó el pedido' : ''),
      filas: [
        ['Nombre', nombreTitular(x)],
        ['Documento', `${x.documento?.tipo || ''} ${x.documento?.numero || ''}`.trim()],
        ['CUIT/CUIL', x.cuit || ''],
        ['Titularidad', `${pct}%`],
        ['Género', x.genero || ''],
        ['Estado civil', x.estadoCivil || ''],
        ...(x.nombreConyuge ? [['Cónyuge', x.nombreConyuge] as [string, string]] : []),
        ['Domicilio', [d.calle, d.numero, d.piso && `piso ${d.piso}`, d.depto && `depto ${d.depto}`].filter(Boolean).join(' ')],
        ['Localidad', `${d.localidad || ''} (CP ${d.codigoPostal || '—'}), ${d.provincia || ''}, ${d.pais || 'Argentina'}`],
        ['Email', email],
        ...(x.firmaAqui ? [['WhatsApp', stored.contacto?.whatsapp || ''] as [string, string]] : []),
      ],
    };
  });

  let emailSent = false;
  try {
    if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY no configurada en este entorno');

    await sendOrderEmails(env.RESEND_API_KEY, {
      ref,
      status: row.status,
      marcas,
      correcciones,
      clientEmail: contactoEmail,
      garantia: !!stored.garantia,
      total: stored.pricing?.total ?? 0,
      titulares: titularesEmail,
      firmasPendientes: pendientes.map(({ nombre, email, url }) => ({ nombre, email, url })),
    }, completion?.cartaPdfBase64 || null, logos);
    emailSent = true;
  } catch (e) {
    console.error('Error generando PDF / enviando emails:', e);
  }

  // ── Alta en el portal Vigilante ─────────────────────────
  // Crea el contacto, la marca y un trámite POR CLASE. Va en waitUntil: el
  // pedido ya está guardado y los emails ya salieron, así que el cliente no
  // tiene por qué esperar a que responda el portal. Ni un portal caído ni una
  // credencial vencida pueden voltear la confirmación.
  //
  // ⚠️ CON COTITULARES NO CORRE ACÁ. De un cotitular todavía no hay nada más
  // que su email: sus datos los carga él mismo al firmar. Dar de alta un
  // contacto sin nombre, sin CUIT y sin domicilio deja basura en el portal que
  // después hay que limpiar a mano. El alta la dispara la última firma de la
  // cadena (ver src/pages/api/firma/[token].ts), que es también el momento en
  // que el pedido pasa a ser presentable.
  const esProduccion = new URL(request.url).hostname === 'unamarca.com.ar';
  if (pendientes.length) {
    console.log(`[vigilante] alta de ${ref} diferida: faltan ${pendientes.length} firmas`);
  } else {
    const alta = () => darDeAltaEnVigilante(env, { ref, esProduccion });
    // waitUntil mantiene vivo el contexto después de responder. Si el entorno no
    // lo expone (dev local), se espera nomás.
    if (typeof waitUntil === 'function') waitUntil(alta());
    else await alta();
  }

  // `firmasPendientes` vuelve al wizard: la pantalla de confirmación tiene que
  // decirle al cliente a quién le pedimos la firma y adónde le llegó el link.
  return json({
    ok: true,
    ref,
    emailSent,
    firmasPendientes: pendientes.map(({ nombre, email }) => ({ nombre, email })),
  });
};
