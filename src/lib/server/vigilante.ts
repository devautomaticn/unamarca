// Alta en el portal Vigilante — API externa v1.
// https://vigilante.unamarca.com.ar/api/ext/v1/altas
//
// Crea contacto + marca + un trámite POR CLASE, todo o nada. NO presenta nada
// ante el INPI: el alta genera trabajo pendiente en el estudio y el trámite
// nace en estado `no_presentado`. El acta la carga el estudio a mano cuando la
// solicitud se presenta de verdad, así que desde acá nunca se manda ninguna.
//
// La credencial vive en el secret VIGILANTE_API_KEY de Pages y nunca sale del
// servidor: el wizard no la ve ni la puede ver. El workspace sale de la propia
// clave, no es un parámetro.

const BASE_POR_DEFECTO = 'https://vigilante.unamarca.com.ar/api/ext/v1';

/** Tope por logo que declara la API. El nuestro sale del canvas del navegador
 *  y pesa muy por debajo, pero un archivo raro no puede voltear el alta entera. */
const LOGO_MAX_BYTES = 5 * 1024 * 1024;

/** Tope por poder que declara la API. El nuestro ronda los 100 KB. */
const PODER_MAX_BYTES = 10 * 1024 * 1024;

/** `%PDF-`. La API valida el poder por contenido, no por extensión ni por
 *  Content-Type: mandar algo que no lo es sería tirar el adjunto a la basura. */
function esPdf(bytes: ArrayBuffer): boolean {
  const c = new Uint8Array(bytes.slice(0, 5));
  return c[0] === 0x25 && c[1] === 0x50 && c[2] === 0x44 && c[3] === 0x46 && c[4] === 0x2d;
}

/** La API corta a los 30 s; cortamos antes para no quedarnos colgados con el
 *  cliente esperando la confirmación. */
const TIMEOUT_MS = 20_000;

export interface VigilanteEnv {
  /** Secret de Pages. Sin esto el alta se saltea (y se avisa en el log). */
  VIGILANTE_API_KEY?: string;
  /** Override del base URL, para apuntar a un entorno de prueba. */
  VIGILANTE_API_BASE?: string;
}

/** Un contacto tal como lo pide la API. Todos los campos menos `nombre` son
 *  opcionales; los vacíos no se mandan (un campo en blanco nunca borra un dato
 *  ya cargado, pero mandar menos evita ruido). */
export interface ContactoAlta {
  nombre: string;
  apellido?: string;
  tipo?: 'Humana' | 'Juridica';
  /** Lo único que deduplica contactos del lado del portal: si lo tenemos, va. */
  cuit?: string;
  email?: string;
  telefono?: string;
  tipo_doc?: string;
  documento?: string;
  genero?: string;
  estado_civil?: string;
  conyuge?: string;
  pais?: string;
  provincia?: string;
  calle?: string;
  numero?: string;
  piso?: string;
  depto?: string;
  localidad?: string;
  cp?: string;
  notas?: string;
}

/** Quién es dueño de la marca y en qué proporción. `contacto` es el índice
 *  dentro de `contactos[]` del mismo alta. La suma de los porcentajes da 100. */
export interface TitularAlta {
  contacto: number;
  porcentaje: number;
}

export interface MarcaAlta {
  denominacion: string;
  /** Denominativa | Mixta | Figurativa (los tres que maneja el checkout) */
  tipo: string;
  clases: number[];
  descripcion?: string;
  colores?: string;
  alto?: number | null;
  ancho?: number | null;
  /** JPG ya normalizado, tal como quedó en R2 */
  logo?: { filename: string; bytes: ArrayBuffer } | null;
}

export interface Advertencia {
  codigo: string;
  mensaje: string;
  marca?: string;
}

export interface AltaResultado {
  ok: boolean;
  /** Status HTTP; ausente si ni siquiera se llegó a hacer el pedido */
  status?: number;
  /** true cuando no hay credencial configurada: no es un error, es un entorno
   *  sin la integración prendida (dev local, preview sin secret). */
  omitido?: boolean;
  contactos?: number[];
  contactosReusados?: number[];
  marcas?: number[];
  tramites?: number[];
  advertencias?: Advertencia[];
  error?: string;
  detalles?: string[];
  /** true si conviene reintentar (429/500/timeout). Un 400 es un bug del mapeo
   *  y reintentarlo solo repite el mismo error. */
  reintentable?: boolean;
}

/** Saca las claves vacías: la API reporta `campos_ignorados` por cada cosa que
 *  no conoce y un `null` suelto solo agrega ruido a las advertencias. */
function limpio<T extends object>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && !v.trim()) continue;
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out as Partial<T>;
}

/**
 * Da de alta el pedido en el portal.
 *
 * `ref` es la referencia del pedido y se usa como Idempotency-Key: si esto se
 * reintenta (timeout, 500, o un PATCH repetido dentro de las 48 h que la API
 * retiene la clave), el portal devuelve los ids del primer intento en vez de
 * crear todo de nuevo. Es lo único que separa "un alta" de "tres altas
 * idénticas".
 *
 * Nunca lanza: el pedido ya está pago y guardado, así que un problema del
 * portal no puede voltear la confirmación del cliente. Devuelve el resultado
 * para que el llamador lo persista y lo loguee.
 */
export async function crearAltaVigilante(
  env: VigilanteEnv,
  pedido: {
    ref: string;
    /** Un contacto por titular, en el orden del pedido. `titulares` los referencia
     *  por índice. */
    contactos: ContactoAlta[];
    /** Titularidad de TODAS las marcas del pedido: el checkout no permite que
     *  una marca del mismo pedido tenga dueños distintos. */
    titulares: TitularAlta[];
    marcas: MarcaAlta[];
    /** La carta poder firmada por TODOS los titulares. Es UNA sola para el
     *  pedido —el poder es genérico, no nombra la marca ni las clases— y todas
     *  las marcas la referencian: el portal la guarda una vez (el nombre sale
     *  del hash del contenido) y le cuelga una copia a cada trámite.
     *
     *  Si no llega, el alta entra igual y el portal lo reporta en
     *  `advertencias[]` como `poder_faltante`, una por marca. Nunca rechaza por
     *  esto, así que esa advertencia es el único aviso de que hay que subirla a
     *  mano: sin el poder el trámite no se puede presentar por el web service
     *  del INPI (lo pide en base64 con idIndice=6). */
    poder?: { filename: string; bytes: ArrayBuffer } | null;
  },
): Promise<AltaResultado> {
  const apiKey = env.VIGILANTE_API_KEY;
  if (!apiKey) {
    return { ok: false, omitido: true, error: 'VIGILANTE_API_KEY no configurada en este entorno' };
  }
  if (!pedido.marcas.length) {
    return { ok: false, omitido: true, error: 'El pedido no tiene marcas' };
  }
  if (!pedido.contactos.length) {
    return { ok: false, omitido: true, error: 'El pedido no tiene titulares' };
  }

  const base = (env.VIGILANTE_API_BASE || BASE_POR_DEFECTO).replace(/\/+$/, '');

  // Un logo por marca, nombrado por posición. Si la misma imagen va en dos
  // clases da igual: la API arma un trámite por clase y comparten el archivo.
  const adjuntos: { parte: string; bytes: ArrayBuffer; filename: string; tipo: string }[] = [];

  // La carta poder: UNA parte para todo el pedido, referenciada por todas las
  // marcas. Repetir el archivo por marca no costaría nada del lado del portal
  // (deduplica por hash), pero sí subirlo tres veces desde acá.
  const poder = pedido.poder;
  const usaPoder = !!poder && poder.bytes.byteLength > 0
    && poder.bytes.byteLength <= PODER_MAX_BYTES && esPdf(poder.bytes);
  if (poder && !usaPoder) {
    // No frena el alta: un poder que no se adjunta es una advertencia del
    // portal, no un pedido perdido.
    console.error(
      `[vigilante] la carta poder de ${pedido.ref} no se adjunta`
      + ` (${poder.bytes.byteLength} bytes, ¿PDF?: ${esPdf(poder.bytes)})`,
    );
  }
  if (usaPoder) {
    adjuntos.push({
      parte: 'poder_0', bytes: poder!.bytes, filename: poder!.filename, tipo: 'application/pdf',
    });
  }

  const marcas = pedido.marcas.map((m, i) => {
    const parte = `logo_${i}`;
    const usaLogo = !!m.logo && m.logo.bytes.byteLength > 0 && m.logo.bytes.byteLength <= LOGO_MAX_BYTES;
    if (usaLogo) {
      adjuntos.push({
        parte, bytes: m.logo!.bytes, filename: m.logo!.filename, tipo: 'image/jpeg',
      });
    }
    return limpio({
      denominacion: m.denominacion.slice(0, 120),
      tipo: m.tipo,
      clases: m.clases,
      descripcion: m.descripcion,
      colores: m.colores,
      logo: usaLogo ? parte : undefined,
      logo_alto_cm: m.alto ?? undefined,
      logo_ancho_cm: m.ancho ?? undefined,
      // La misma parte en todas las marcas: un pedido, un poder.
      poder: usaPoder ? 'poder_0' : undefined,
      // `limitaciones` (el mapa clase→lista de productos) NO se manda: lo que
      // el cliente escribe en el paso 5 es prosa libre, no la lista en formato
      // INPI, y derivarla de ahí achicaría el alcance del registro sin que
      // nadie lo haya decidido. El alcance queda en NULL —"nadie lo dijo
      // todavía"— hasta que el estudio lo decida en el portal.
      titulares: pedido.titulares,
      // Nunca se manda `acta`/`actas`: nada de lo que sale de acá se presentó.
    });
  });

  const payload = { contactos: pedido.contactos.map(limpio), marcas };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    // Estable por pedido: el mismo ref siempre da la misma clave, así que un
    // reintento devuelve los ids del primer intento en vez de duplicar.
    'Idempotency-Key': `alta-${pedido.ref}`,
  };

  let body: BodyInit;
  if (adjuntos.length) {
    const form = new FormData();
    form.append('payload', JSON.stringify(payload));
    for (const a of adjuntos) {
      form.append(a.parte, new Blob([a.bytes], { type: a.tipo }), a.filename);
    }
    body = form; // sin Content-Type: lo pone fetch con el boundary
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(payload);
  }

  let res: Response;
  try {
    res = await fetch(`${base}/altas`, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    // Timeout o red: puede haber llegado igual. Con el Idempotency-Key, el
    // reintento es seguro.
    return { ok: false, reintentable: true, error: `No se pudo contactar al portal: ${e}` };
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch { /* respuesta sin JSON (502 de un proxy, por ejemplo) */ }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      // 400 = bug del mapeo, 401/403 = credencial, 409 = ya existía: ninguno
      // se arregla repitiendo el mismo pedido.
      reintentable: res.status === 429 || res.status >= 500,
      error: data?.error || `El portal respondió ${res.status}`,
      detalles: Array.isArray(data?.detalles) ? data.detalles : undefined,
    };
  }

  return {
    ok: true,
    status: res.status,
    contactos: data?.contactos ?? [],
    contactosReusados: data?.contactos_reusados ?? [],
    marcas: data?.marcas ?? [],
    tramites: data?.tramites ?? [],
    // Un 201 NO significa que los datos estén bien: esto es lo único que avisa
    // que el mapeo se rompió, porque no falla ningún pedido.
    advertencias: Array.isArray(data?.advertencias) ? data.advertencias : [],
  };
}

/** Resultado del reemplazo del poder de UN trámite. */
export interface PoderResultado {
  ok: boolean;
  tramite: number;
  status?: number;
  error?: string;
  advertencias?: Advertencia[];
}

/**
 * Reemplaza la carta poder de un trámite ya creado.
 *
 * `PUT /tramites/<id>/poder`, permiso `actualizar`. Es POR TRÁMITE, no por
 * marca: una marca en dos clases son dos llamadas con el mismo archivo (en el
 * disco del portal sigue habiendo uno solo, el nombre sale del hash).
 *
 * Reemplaza, no acumula: un trámite tiene un poder. **Nunca se llama con el
 * cuerpo vacío** —el portal responde 400 y no lo toma como una orden de
 * desadjuntar, justamente para que un bug de este lado no deje trámites sin
 * poder en silencio.
 *
 * Un 200 puede traer advertencias que importan: `poder_reemplazado` (pisó uno
 * distinto que ya estaba) y `poder_cambiado_despues_de_ingresar` (el trámite ya
 * se presentó ante el INPI, y el poder que el INPI tiene es el anterior:
 * cambiarlo acá no lo cambia allá). Ninguna de las dos falla; las dos hay que
 * mirarlas.
 *
 * Nunca lanza: esto corre después de que el poder firmado ya salió por email.
 */
export async function reemplazarPoderVigilante(
  env: VigilanteEnv,
  d: { tramite: number; filename: string; bytes: ArrayBuffer },
): Promise<PoderResultado> {
  const apiKey = env.VIGILANTE_API_KEY;
  if (!apiKey) {
    return { ok: false, tramite: d.tramite, error: 'VIGILANTE_API_KEY no configurada en este entorno' };
  }
  if (!d.bytes.byteLength || d.bytes.byteLength > PODER_MAX_BYTES || !esPdf(d.bytes)) {
    return { ok: false, tramite: d.tramite, error: `El archivo no es un PDF adjuntable (${d.bytes.byteLength} bytes)` };
  }

  const base = (env.VIGILANTE_API_BASE || BASE_POR_DEFECTO).replace(/\/+$/, '');
  const form = new FormData();
  form.append('poder', new Blob([d.bytes], { type: 'application/pdf' }), d.filename);

  let res: Response;
  try {
    res = await fetch(`${base}/tramites/${d.tramite}/poder`, {
      method: 'PUT',
      // Sin Content-Type: lo pone fetch con el boundary. Sin Idempotency-Key:
      // el PUT ya es idempotente (reemplaza), y subir dos veces el mismo archivo
      // no cuenta como reemplazo porque el hash es el mismo.
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return { ok: false, tramite: d.tramite, error: `No se pudo contactar al portal: ${e}` };
  }

  let data: any = null;
  try { data = await res.json(); } catch { /* respuesta sin JSON */ }

  if (!res.ok) {
    return {
      ok: false,
      tramite: d.tramite,
      status: res.status,
      error: data?.error || `El portal respondió ${res.status}`,
    };
  }
  return {
    ok: true,
    tramite: d.tramite,
    status: res.status,
    advertencias: Array.isArray(data?.advertencias) ? data.advertencias : [],
  };
}
