// GET  /api/firma/:token — el poder que tiene que firmar un cotitular, con las
//       firmas que ya están puestas.
// POST /api/firma/:token — guarda su firma y avisa al estudio (con el PDF que
//       generó su navegador). Cuando entra la última, sale el poder definitivo.
//
// ⚠️ EL TOKEN ES LA CREDENCIAL: no hay login, quien tiene el link firma. Es la
// misma postura que `/guia/<token>` y que el ref del pedido — y acá es la
// única posible, porque el que firma puede no haber entrado nunca al sitio.
// Un token abre UN renglón de UN pedido y deja de aceptar firmas al usarse.
import type { APIRoute } from 'astro';
import { runtime } from '@/lib/server/runtime';

// Ruta de servidor: se ejecuta por request, no se prerenderiza.
export const prerender = false;

import {
  type CheckoutEnv, consolidarMarcas, ensureSchema, json, titularesDesdeCompletion,
} from '@/lib/server/checkout';
import { darDeAltaEnVigilante } from '@/lib/server/altaPedido';
import type { VigilanteEnv } from '@/lib/server/vigilante';
import {
  asegurarTablaFirmas, estadoFirmas, firmaPorToken, firmasDePedido, guardarFirma,
  urlFirma,
} from '@/lib/server/firmas';
import { sendFirmaRecibida, sendPoderCompletoClientes } from '@/lib/server/notify';
import { hoyEnBuenosAires } from '@/lib/checkout/cartaPoderPdf';

interface FirmaEnv extends CheckoutEnv, VigilanteEnv {
  RESEND_API_KEY?: string;
}

/** Cap del cuerpo del POST: la firma es un PNG chico y el PDF de un poder de
 *  tres titulares ronda los 100 KB en base64. 3 MB deja margen de sobra. */
const MAX_BODY = 3_000_000;

/** Arma todo lo que la página necesita para dibujar el documento: el pedido,
 *  sus titulares y el estado de la cadena. Devuelve null si el token no existe. */
async function contexto(env: FirmaEnv, token: string) {
  await ensureSchema(env.DB);
  await asegurarTablaFirmas(env.DB);

  const fila = await firmaPorToken(env.DB, token);
  if (!fila) return null;

  const row = await env.DB.prepare(
    'SELECT ref, status, payload, completion, completed_at FROM orders WHERE ref = ?'
  ).bind(fila.ref).first<{
    ref: string; status: string; payload: string;
    completion: string | null; completed_at: string | null;
  }>();
  if (!row) return null;

  const stored = JSON.parse(row.payload);
  const completion = row.completion ? JSON.parse(row.completion) : {};
  const titulares = titularesDesdeCompletion(completion);
  const filas = await firmasDePedido(env.DB, fila.ref);

  // Las marcas salen del snapshot del pago (es lo que se presenta), con lo que
  // el cliente cargó post-pago encima. Es el mismo consolidado que ven el PATCH
  // del pedido y el alta en el portal: no pueden divergir.
  const { marcas } = consolidarMarcas(stored, completion);

  // La fecha del poder es la del día en que se otorgó, no la de hoy: el
  // documento es uno solo y no puede cambiar de fecha entre firma y firma.
  const fecha = fechaDelPoder(completion, row.completed_at);

  return { fila, row, stored, completion, titulares, marcas, filas, fecha };
}

function fechaDelPoder(
  completion: any,
  completedAt: string | null,
): { dia: number; mes: number; anio: number } {
  const f = completion?.fechaPoder;
  if (f && [f.dia, f.mes, f.anio].every((n: unknown) => Number.isInteger(n))) {
    return { dia: f.dia, mes: f.mes, anio: f.anio };
  }
  // Pedidos anteriores a que el wizard mandara la fecha: se reconstruye del
  // momento en que se completó, que es cuando se firmó la primera vez.
  if (completedAt) {
    const d = new Date(completedAt);
    if (!Number.isNaN(d.getTime())) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric', month: 'numeric', day: 'numeric',
      }).formatToParts(d);
      const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
      return { dia: get('day'), mes: get('month') - 1, anio: get('year') };
    }
  }
  return hoyEnBuenosAires();
}

export const GET: APIRoute = async ({ params, locals }) => {
  const { env } = runtime<FirmaEnv>(locals);
  if (!env.DB) return json({ error: 'Base de datos no configurada' }, 500);

  const ctx = await contexto(env, String(params.token || ''));
  // Mismo mensaje para token inexistente y pedido borrado: nada que sacar de
  // probar tokens al azar.
  if (!ctx) return json({ error: 'Este link no es válido o ya venció.' }, 404);

  const { fila, titulares, marcas, filas, fecha } = ctx;
  const estado = estadoFirmas(filas);

  return json({
    ref: fila.ref,
    idx: fila.idx,
    nombre: fila.nombre,
    yaFirmado: !!fila.firma,
    firmadoEn: fila.firmado_en,
    completo: estado.completo,
    firmadas: estado.firmadas,
    total: estado.total,
    fecha,
    // El documento entero, para poder dibujarlo idéntico al que firmó el
    // primero. Quien tiene el link es parte del poder: son sus propios datos y
    // los de sus cotitulares. Van con el set COMPLETO de campos (no sólo los
    // que salen impresos) porque el titular puede corregir los suyos antes de
    // firmar: quien completó el checkout los cargó de memoria.
    titulares,
    marcas: marcas.map(m => ({ nombre: m.nombre, tipo: m.tipo, clases: m.clases })),
    // Apareadas por posición con `titulares`. Es lo que permite que el navegador
    // de quien firma último arme el PDF completo, con las firmas de todos.
    firmas: titulares.map((_, i) => filas.find(f => f.idx === i)?.firma ?? null),
  });
};

/** Los campos que un cotitular puede corregir de sí mismo. NO están el
 *  porcentaje ni las marcas: eso es lo que acordaron entre todos y ya lo firmó
 *  el primero. Tocarlo desde acá reescribiría lo que otro firmó. */
const ETIQUETAS: Record<string, string> = {
  nombre: 'Nombre',
  apellido: 'Apellido',
  'documento.tipo': 'Tipo de documento',
  'documento.numero': 'Número de documento',
  cuit: 'CUIT/CUIL',
  email: 'Email',
  genero: 'Género',
  estadoCivil: 'Estado civil',
  nombreConyuge: 'Cónyuge',
  'domicilio.pais': 'País',
  'domicilio.calle': 'Calle',
  'domicilio.numero': 'Número',
  'domicilio.piso': 'Piso',
  'domicilio.depto': 'Depto',
  'domicilio.localidad': 'Localidad',
  'domicilio.codigoPostal': 'Código postal',
  'domicilio.provincia': 'Provincia',
};

/** Guarda las correcciones en `orders.completion` y devuelve qué cambió, en
 *  texto, para el email al estudio.
 *
 *  Esto importa más de lo que parece: el poder que firmó el primer titular
 *  decía otra cosa, y el alta en el portal Vigilante ya se hizo con los datos
 *  viejos. Por eso el cambio no puede ser silencioso — el email lo lista campo
 *  por campo. */
async function aplicarCorreccion(
  env: FirmaEnv,
  ctx: NonNullable<Awaited<ReturnType<typeof contexto>>>,
  crudo: unknown,
): Promise<string[]> {
  if (!crudo || typeof crudo !== 'object') return [];

  // Se reusa el saneador del checkout: un titular suelto entra como `titular`.
  const [saneado] = titularesDesdeCompletion({ titular: crudo });
  if (!saneado) return [];

  const previo = ctx.titulares[ctx.fila.idx];
  if (!previo) return [];

  const leer = (obj: any, ruta: string) =>
    String(ruta.split('.').reduce((o, k) => o?.[k], obj) ?? '').trim();

  const cambios: string[] = [];
  for (const [ruta, etiqueta] of Object.entries(ETIQUETAS)) {
    const antes = leer(previo, ruta);
    const ahora = leer(saneado, ruta);
    if (antes !== ahora) {
      cambios.push(`${etiqueta}: «${antes || '—'}» → «${ahora || '—'}»`);
    }
  }
  if (!cambios.length) return [];

  // El porcentaje, el tipo de persona y quién firma en el wizard son del
  // pedido, no del titular: se conservan tal cual estaban.
  const actualizado = {
    ...saneado,
    porcentaje: previo.porcentaje,
    tipoPersona: previo.tipoPersona,
    firmaAqui: previo.firmaAqui,
  };

  const completion = { ...ctx.completion };
  const lista = [...ctx.titulares];
  lista[ctx.fila.idx] = actualizado;
  completion.titulares = lista;
  // El `titular` suelto (legado) es siempre el del firmante del wizard: sólo se
  // toca si el que está corrigiendo es ese.
  if (previo.firmaAqui) completion.titular = actualizado;

  try {
    await env.DB.prepare('UPDATE orders SET completion = ?, updated_at = ? WHERE ref = ?')
      .bind(JSON.stringify(completion), new Date().toISOString(), ctx.fila.ref).run();
    // El contexto en memoria también, para que el email y el estado que vuelve
    // al navegador salgan con lo corregido.
    ctx.titulares[ctx.fila.idx] = actualizado;
    ctx.fila.nombre = `${actualizado.nombre} ${actualizado.apellido}`.trim() || ctx.fila.nombre;
  } catch (e) {
    // No frena la firma: perder un poder que la persona ya firmó es peor que
    // guardarlo con un dato viejo. El email avisa igual qué había corregido.
    console.error(`[${ctx.fila.ref}] no se pudo guardar la corrección del titular:`, e);
    cambios.push('⚠ NO SE PUDO GUARDAR EN LA BASE — cargar a mano');
  }
  return cambios;
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  const { env, waitUntil } = runtime<FirmaEnv>(locals);
  if (!env.DB) return json({ error: 'Base de datos no configurada' }, 500);

  const token = String(params.token || '');
  let body: any;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: 'Payload demasiado grande' }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400);
  }

  const firma = String(body?.firma ?? '');
  if (!firma.startsWith('data:image/png;base64,')) {
    return json({ error: 'Falta la firma' }, 400);
  }

  const ctx = await contexto(env, token);
  if (!ctx) return json({ error: 'Este link no es válido o ya venció.' }, 404);
  if (ctx.fila.firma) return json({ error: 'Este poder ya lo firmaste.', yaFirmado: true }, 409);

  // Correcciones del titular sobre SUS PROPIOS datos, antes de firmar. Quien
  // completó el checkout los cargó de memoria (el DNI del socio, su domicilio)
  // y esta es la única oportunidad de arreglarlos antes de ir al INPI.
  //
  // Se guardan ANTES de la firma a propósito: lo que se firma tiene que ser lo
  // que quedó guardado, no lo que había cuando se abrió la página.
  const cambios = await aplicarCorreccion(env, ctx, body?.titular);

  // Una firma no se pisa nunca: si dos pestañas mandan a la vez, gana la
  // primera y la segunda se entera acá.
  if (!await guardarFirma(env.DB, token, firma)) {
    return json({ error: 'Este poder ya lo firmaste.', yaFirmado: true }, 409);
  }

  const filas = await firmasDePedido(env.DB, ctx.fila.ref);
  const estado = estadoFirmas(filas);
  const pdfBase64: string | null = typeof body?.cartaPdfBase64 === 'string'
    ? body.cartaPdfBase64
    : null;

  // Los emails no bloquean la respuesta: la firma ya está guardada, que es lo
  // único irrecuperable. Si Resend falla, el dato sigue en D1.
  const avisar = async () => {
    if (!env.RESEND_API_KEY) {
      console.warn(`[${ctx.fila.ref}] firma de ${ctx.fila.nombre} guardada sin avisar: falta RESEND_API_KEY`);
      return;
    }
    const origin = new URL(request.url).origin;
    // El PDF se nombra igual en toda la cadena: el apellido es el del que armó
    // el pedido, no el de quien acaba de firmar. Es un solo documento.
    const archivo = {
      apellido: (ctx.titulares.find(t => t.firmaAqui) ?? ctx.titulares[0])?.apellido,
      fechaPoder: ctx.fecha,
    };
    try {
      await sendFirmaRecibida(env.RESEND_API_KEY, {
        ref: ctx.fila.ref,
        nombre: ctx.fila.nombre,
        marcas: ctx.marcas,
        archivo,
        firmadas: estado.firmadas,
        total: estado.total,
        completo: estado.completo,
        cambios,
        pendientes: estado.pendientes.map(f => ({
          nombre: f.nombre, email: f.email, url: urlFirma(origin, f.token),
        })),
      }, pdfBase64);
    } catch (e) {
      console.error(`[${ctx.fila.ref}] no se pudo avisar de la firma:`, e);
    }

    if (!estado.completo) return;
    // Recién con el poder entero se le manda la copia a cada titular: antes es
    // un documento a medio firmar.
    try {
      await sendPoderCompletoClientes(env.RESEND_API_KEY, {
        ref: ctx.fila.ref,
        marcas: ctx.marcas,
        archivo,
        emails: [
          ...filas.map(f => f.email),
          ctx.stored?.contacto?.email || '',
        ].filter(Boolean),
      }, pdfBase64);
    } catch (e) {
      console.error(`[${ctx.fila.ref}] no se pudo mandar el poder completo:`, e);
    }
  };

  // El alta en el portal se difirió hasta acá: hasta que firmó el último, los
  // cotitulares no tenían datos que cargar (ver src/lib/server/altaPedido.ts).
  // Recién ahora el pedido está completo y es presentable.
  const alta = async () => {
    if (!estado.completo) return;
    try {
      await darDeAltaEnVigilante(env, {
        ref: ctx.fila.ref,
        esProduccion: new URL(request.url).hostname === 'unamarca.com.ar',
      });
    } catch (e) {
      // Nunca frena la firma, que es lo único irrecuperable.
      console.error(`[${ctx.fila.ref}] no se pudo dar de alta en el portal:`, e);
    }
  };

  const despues = async () => { await avisar(); await alta(); };
  if (typeof waitUntil === 'function') waitUntil(despues());
  else await despues();

  return json({
    ok: true,
    ref: ctx.fila.ref,
    completo: estado.completo,
    firmadas: estado.firmadas,
    total: estado.total,
  });
};
