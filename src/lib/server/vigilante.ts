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

/** Tope del pedido ENTERO que declara la API (multipart incluido). Un alta con
 *  tres logos, el poder y dos certificados escaneados lo puede pasar, y un 413
 *  voltea el alta completa. Lo que no entra se deja afuera y se avisa. */
const PEDIDO_MAX_BYTES = 8 * 1024 * 1024;
/** Margen para el JSON del payload y los encabezados del multipart. */
const MARGEN_BYTES = 256 * 1024;

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
  /** Persona humana: el nombre de pila. Jurídica: la razón social. */
  nombre: string;
  apellido?: string;
  tipo?: 'Humana' | 'Juridica';
  /** Lo único que deduplica contactos del lado del portal: si lo tenemos, va.
   *  Un titular del exterior va SIN cuit —no tiene, y uno inventado lo
   *  cruzaría con otro contacto—, así que cada compra suya crea un contacto
   *  nuevo. Está aceptado del otro lado. */
  cuit?: string;
  email?: string;
  telefono?: string;
  tipo_doc?: string;
  documento?: string;
  genero?: string;
  estado_civil?: string;
  conyuge?: string;
  /** Dónde VIVE el titular, por NOMBRE en español ("Uruguay"), no el código.
   *  No confundir con el país de la marca, que no se manda: la marca se
   *  registra en Argentina, y una marca con `pais` queda afuera de todo el
   *  seguimiento contra el INPI. */
  pais?: string;
  provincia?: string;
  calle?: string;
  numero?: string;
  piso?: string;
  depto?: string;
  localidad?: string;
  cp?: string;
  /** Inscripción registral de una persona jurídica. Va acá y no en el trámite
   *  porque es un dato de la sociedad: estable, y el mismo en cada presentación.
   *
   *  Lo que NO existe del otro lado —ni va a existir— es quién firma por ella:
   *  eso es del acto, cambia de un poder al siguiente y vive en el PDF. */
  inscripcion_registro?: string;
  inscripcion_numero?: string;
  inscripcion_fecha?: string;
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
  /** Prioridades del Convenio de París: una por SOLICITUD DE ORIGEN, cada una
   *  con sus clases y su certificado. Las clases no se repiten entre ellas (un
   *  trámite tiene una sola prioridad). Vacío si no reclama. */
  prioridades?: PrioridadAlta[];
}

/** Un certificado (o traducción) que no entró en el alta: se sube después con
 *  `PUT /tramites/<id>/prioridad/<doc>` a cada trámite de sus clases. */
export interface DocPrioridadDiferido {
  denominacion: string;
  clases: number[];
  /** Posición en `tramites[]` de la respuesta del alta de cada una de
   *  `clases` (ver `posicionesTramites`). */
  posiciones: number[];
  /** Cuántos trámites tiene que traer la respuesta. Si trae otra cantidad, el
   *  mapeo por posición no vale y no se sube nada. */
  totalTramites: number;
  doc: 'certificado' | 'traduccion';
  /** "El certificado de prioridad 512345", para los avisos */
  que: string;
  bytes: ArrayBuffer;
}

export interface PrioridadAlta {
  /** ISO-2 o nombre en español: la API acepta los dos */
  pais: string;
  numero: string;
  /** AAAA-MM-DD, la fecha de la presentación de origen */
  fecha: string;
  clases: number[];
  certificado?: { filename: string; bytes: ArrayBuffer } | null;
  traduccion?: { filename: string; bytes: ArrayBuffer } | null;
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
  /** PDF de prioridad que no entraron en el tope del alta y hay que subir
   *  aparte, trámite por trámite (`subirPrioridadesDiferidas`). No viajan al
   *  guardar el resultado en D1: son bytes. */
  diferidos?: DocPrioridadDiferido[];
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

  // Lo que no entra en el tope del pedido. Va a `advertencias` con un código
  // propio: sin eso, un adjunto que no se mandó sería invisible —el portal
  // sólo avisa `certificado_faltante` cuando se nombra una parte que no vino,
  // y acá directamente no se nombra.
  const propias: Advertencia[] = [];
  const diferidos: DocPrioridadDiferido[] = [];
  let pesoTotal = adjuntos.reduce((n, a) => n + a.bytes.byteLength, 0) + MARGEN_BYTES;
  const entra = (bytes: ArrayBuffer) => pesoTotal + bytes.byteLength <= PEDIDO_MAX_BYTES;
  const adjuntar = (a: { parte: string; bytes: ArrayBuffer; filename: string; tipo: string }) => {
    pesoTotal += a.bytes.byteLength;
    adjuntos.push(a);
  };

  // Primero los logos de todas las marcas, después los certificados: si el
  // pedido se pasa del tope, lo que queda afuera tiene que ser un certificado,
  // que se puede subir después por trámite. Un logo, no.
  const usaLogo = pedido.marcas.map((m, i) => {
    if (!m.logo || !m.logo.bytes.byteLength || m.logo.bytes.byteLength > LOGO_MAX_BYTES) return false;
    if (!entra(m.logo.bytes)) {
      propias.push({
        codigo: 'adjunto_no_enviado',
        mensaje: `El logo (${Math.round(m.logo.bytes.byteLength / 1024)} KB) no entró en el tope de 8 MB del alta: hay que subirlo a mano en el portal.`,
        marca: m.denominacion,
      });
      return false;
    }
    adjuntar({ parte: `logo_${i}`, bytes: m.logo.bytes, filename: m.logo.filename, tipo: 'image/jpeg' });
    return true;
  });

  // Dónde cae cada (marca, clase) en `tramites[]` de la respuesta. El portal lo
  // garantiza (doc de la API, sección 3): las marcas en el orden del pedido y,
  // dentro de cada una, las clases en el orden en que se mandan, una clase
  // repetida sólo en su primera aparición y una marca sin clases sin aportar
  // ninguno.
  const posicion = new Map<string, number>();
  let totalTramites = 0;
  pedido.marcas.forEach((m, i) => {
    for (const c of m.clases) {
      if (!posicion.has(`${i}:${c}`)) posicion.set(`${i}:${c}`, totalTramites++);
    }
  });

  const marcas = pedido.marcas.map((m, i) => {
    // Cada solicitud de origen, con su certificado y su traducción como partes
    // propias (`cert_<marca>_<solicitud>`): con una solicitud por clase, cada
    // trámite se queda con el suyo. Un PDF que no es PDF se deja afuera; uno
    // que no entra en el tope se DIFIERE: la prioridad entra igual sin él y
    // el PDF se sube después a cada trámite de sus clases (ver
    // `subirPrioridadesDiferidas`).
    const docPrioridad = (
      d: { filename: string; bytes: ArrayBuffer } | null | undefined,
      nombre: string, doc: DocPrioridadDiferido['doc'], que: string, clases: number[],
    ): string | undefined => {
      if (!d || !d.bytes.byteLength || d.bytes.byteLength > PODER_MAX_BYTES || !esPdf(d.bytes)) return undefined;
      if (!entra(d.bytes)) {
        diferidos.push({
          denominacion: m.denominacion, clases, doc, que, bytes: d.bytes, totalTramites,
          posiciones: clases.map(c => posicion.get(`${i}:${c}`) ?? -1),
        });
        return undefined;
      }
      adjuntar({ parte: nombre, bytes: d.bytes, filename: d.filename, tipo: 'application/pdf' });
      return nombre;
    };
    const prioridades = m.prioridades?.length
      ? m.prioridades.map((pr, j) => {
        const cual = pr.numero || `de ${pr.pais}`;
        return limpio({
          pais: pr.pais,
          numero: pr.numero,
          fecha: pr.fecha,
          // Siempre explícitas: una prioridad sin `clases` aplica a TODAS las
          // de la marca, y con varias solicitudes se llevaría las de las demás.
          clases: pr.clases,
          certificado: docPrioridad(pr.certificado, `cert_${i}_${j}`, 'certificado',
            `El certificado de prioridad ${cual}`, pr.clases),
          traduccion: docPrioridad(pr.traduccion, `trad_${i}_${j}`, 'traduccion',
            `La traducción del certificado ${cual}`, pr.clases),
        });
      })
      : undefined;
    return limpio({
      denominacion: m.denominacion.slice(0, 120),
      tipo: m.tipo,
      clases: m.clases,
      descripcion: m.descripcion,
      colores: m.colores,
      logo: usaLogo[i] ? `logo_${i}` : undefined,
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
      prioridades,
      // Nunca se manda `pais` en la marca: se registra en Argentina, y con
      // `pais` quedaría afuera del seguimiento contra el INPI.
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
    advertencias: [
      ...(Array.isArray(data?.advertencias) ? data.advertencias : []),
      ...propias,
    ],
    diferidos: diferidos.length ? diferidos : undefined,
  };
}

/**
 * Sube los PDF de prioridad que no entraron en el alta, a cada trámite de sus
 * clases: `PUT /tramites/<id>/prioridad/<doc>`, permiso `actualizar`. El
 * trámite ya tiene la prioridad cargada (vino en el alta, sin el PDF), que es
 * lo que el PUT necesita.
 *
 * Qué trámite es de qué clase sale de la POSICIÓN en `tramites[]` de la
 * respuesta, que el portal garantiza (ver `posicion` en `crearAltaVigilante`).
 * Si la respuesta no trae la cantidad esperada, el mapeo no vale y no se sube
 * nada: un certificado colgado del trámite equivocado es peor que uno que
 * falta, porque el que falta se ve en rojo en el portal.
 *
 * Cada PUT es una escritura, y la credencial tiene 60 por hora: un alta de 4
 * clases con el certificado subido aparte son 5. Es el caso raro (sólo pasa
 * cuando el pedido se pasa de 8 MB), así que no se racionan.
 *
 * Devuelve las advertencias de lo que NO se pudo subir (para el email al
 * estudio). Nunca lanza.
 */
export async function subirPrioridadesDiferidas(
  env: VigilanteEnv,
  alta: AltaResultado,
): Promise<Advertencia[]> {
  const diferidos = alta.diferidos ?? [];
  if (!diferidos.length) return [];
  const aMano = (d: DocPrioridadDiferido, por: string, clases = d.clases): Advertencia => ({
    codigo: 'adjunto_no_enviado',
    mensaje: `${d.que} (${Math.round(d.bytes.byteLength / 1024)} KB) no entró en el tope de 8 MB del alta`
      + ` y no se pudo subir aparte (${por}): hay que subirlo a mano en el portal`
      + ` (clases ${clases.join(', ')}).`,
    marca: d.denominacion,
  });
  const apiKey = env.VIGILANTE_API_KEY;
  if (!apiKey || !alta.ok) return diferidos.map(d => aMano(d, 'el alta no se completó'));

  const base = (env.VIGILANTE_API_BASE || BASE_POR_DEFECTO).replace(/\/+$/, '');
  const tramites = alta.tramites ?? [];
  const fallas: Advertencia[] = [];
  for (const d of diferidos) {
    if (tramites.length !== d.totalTramites || d.posiciones.some(p => p < 0)) {
      fallas.push(aMano(d, `el alta devolvió ${tramites.length} trámites y se esperaban ${d.totalTramites}`));
      continue;
    }
    for (let k = 0; k < d.clases.length; k++) {
      const id = tramites[d.posiciones[k]];
      try {
        const res = await fetch(`${base}/tramites/${id}/prioridad/${d.doc}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/pdf' },
          body: d.bytes,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) fallas.push(aMano(d, `PUT al trámite ${id} → ${res.status}`, [d.clases[k]]));
      } catch (e) {
        fallas.push(aMano(d, `PUT al trámite ${id}: ${e}`, [d.clases[k]]));
      }
    }
  }
  return fallas;
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
