// Alta del pedido en el portal Vigilante: arma el payload desde D1, lo manda,
// guarda el resultado y avisa al estudio de lo que el portal no ve.
//
// ⚠️ CUÁNDO CORRE. Con un solo titular, apenas se completa el checkout (es el
// comportamiento de siempre). Con cotitulares, recién CUANDO FIRMAN TODOS: hasta
// ese momento los datos de cada cotitular no existen —los carga él mismo al
// firmar— y dar de alta un contacto sin nombre, sin CUIT y sin domicilio deja
// basura en el portal que después hay que limpiar a mano. Nada se presenta
// antes del poder completo, así que no se pierde nada esperando.
//
// Vive acá y no en la ruta porque lo disparan dos caminos: el PATCH del pedido
// y la última firma de la cadena (`/api/firma/<token>`). El
// `Idempotency-Key: alta-<ref>` hace que un doble disparo devuelva los ids del
// primer intento en vez de duplicar.

import {
  type CheckoutEnv, consolidarMarcas, ensureVigilanteColumn, titularesDesdeCompletion,
} from './checkout';
import { crearAltaVigilante, type AltaResultado, type VigilanteEnv } from './vigilante';
import { sendVigilanteAlert } from './notify';
import { formatPorcentaje, tipoMarcaLabel } from '@/lib/checkout/constants';

interface AltaEnv extends CheckoutEnv, VigilanteEnv {
  RESEND_API_KEY?: string;
}

/** Da de alta el pedido. Nunca lanza: el pedido ya está pago y guardado, así
 *  que un problema del portal no puede voltear nada de lo que ya pasó. */
export async function darDeAltaEnVigilante(
  env: AltaEnv,
  opts: {
    ref: string;
    /** Sólo en producción se avisa la falta de credencial: en los previews y en
     *  local es lo normal y sería un email por cada pedido de prueba. */
    esProduccion: boolean;
  },
): Promise<AltaResultado> {
  const { ref, esProduccion } = opts;

  const row = await env.DB.prepare(
    'SELECT payload, completion FROM orders WHERE ref = ?'
  ).bind(ref).first<{ payload: string; completion: string | null }>();
  if (!row) {
    return { ok: false, omitido: true, error: `El pedido ${ref} no existe` };
  }

  // Se relee de D1 en vez de recibirlo por parámetro: para cuando dispara la
  // última firma, el `completion` ya tiene los datos que cargó cada cotitular,
  // y las correcciones de tipo post-pago ya quedaron persistidas en `payload`.
  const stored = JSON.parse(row.payload);
  const completion = row.completion ? JSON.parse(row.completion) : {};
  const { storedMarcas, marcas } = consolidarMarcas(stored, completion);
  const titulares = titularesDesdeCompletion(completion);

  const contactoEmail = stored.contacto?.email || completion?.contacto?.email || '';
  const whatsapp = stored.contacto?.whatsapp || completion?.contacto?.whatsapp || '';

  // Los logos salen de R2. Si el binding no está o el objeto no aparece, el
  // alta sigue sin la imagen: el estudio la tiene igual en el email.
  const logosBytes: (ArrayBuffer | null)[] = storedMarcas.map(() => null);
  for (let i = 0; i < marcas.length; i++) {
    const key = storedMarcas[i]?.logoKey;
    if (!key || !env.LOGOS) continue;
    try {
      const obj = await env.LOGOS.get(key);
      if (obj) logosBytes[i] = await obj.arrayBuffer();
    } catch (e) {
      console.error(`[vigilante] no se pudo leer el logo ${key}:`, e);
    }
  }

  const alta = await crearAltaVigilante(env, {
    ref,
    // Un contacto por titular. El portal deduplica por CUIT, así que un
    // cotitular que ya existe se reusa en vez de duplicarse.
    contactos: titulares.map((x, i) => {
      const d = x.domicilio;
      return {
        nombre: x.nombre,
        apellido: x.apellido,
        tipo: 'Humana' as const, // el checkout todavía no acepta personas jurídicas
        cuit: x.cuit,
        // El teléfono del pedido es de quien lo completó: no se le cuelga a un
        // cotitular un WhatsApp que no es suyo.
        email: x.email || (x.firmaAqui ? contactoEmail : ''),
        telefono: x.firmaAqui ? whatsapp : '',
        tipo_doc: x.documento?.tipo || '',
        documento: x.documento?.numero || '',
        genero: x.genero,
        estado_civil: x.estadoCivil,
        conyuge: x.nombreConyuge || '',
        pais: d.pais || 'Argentina',
        provincia: d.provincia,
        calle: d.calle,
        numero: d.numero,
        piso: d.piso || '',
        depto: d.depto || '',
        localidad: d.localidad,
        cp: d.codigoPostal,
        notas: `Alta automática desde el checkout web. Pedido ${ref}.`
          + (titulares.length > 1
            ? ` Cotitular ${i + 1} de ${titulares.length} (${formatPorcentaje(x.porcentaje)}%).`
            : ''),
      };
    }),
    titulares: titulares.map((x, i) => ({ contacto: i, porcentaje: x.porcentaje })),
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
    // La columna se agregó después de la tabla original: puede no existir en una
    // base recién creada.
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

  return alta;
}
