// Helpers compartidos del checkout (carpeta _lib: no se publica como ruta).
import {
  MAX_CLASES, MAX_MARCAS, MAX_TITULARES, LOGO_CM_MAX, LOGO_CM_MIN,
  computeOrderPricing, contarLineas, normalizeTipoMarca, redondearPorcentaje,
  repartirPorcentajes, requiereLogo,
  type MarcaPedido, type TitularPedido,
} from '@/lib/checkout/constants';

// Tipos mínimos de D1 (evitamos la dependencia @cloudflare/workers-types,
// consistente con el resto de functions/ que no la usa)
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
}
export interface D1Database {
  prepare(query: string): D1Statement;
}

// Tipos mínimos de R2, en la misma línea que los de D1: el bucket guarda los
// logos de las marcas mixtas y figurativas.
export interface R2ObjectBody {
  arrayBuffer(): Promise<ArrayBuffer>;
  size: number;
}
export interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
}

export interface CheckoutEnv {
  DB: D1Database;
  MP_ACCESS_TOKEN: string;
  MP_WEBHOOK_SECRET: string;
  /** Binding del bucket de logos. Opcional: si falta, el checkout sigue
   *  funcionando y el logo se le pide al cliente por WhatsApp. */
  LOGOS?: R2Bucket;
}

/** Key del logo de una marca dentro del bucket. El índice es la posición de la
 *  marca en el pedido, que es la clave estable del wizard. */
export function logoKeyFor(ref: string, indice: number): string {
  return `logos/${ref}/marca-${indice + 1}.jpg`;
}

export function base64FromArrayBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function ensureSchema(db: D1Database): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS orders (
      ref TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending_payment',
      payment_id TEXT,
      payment_status TEXT,
      mp_preference_id TEXT,
      payload TEXT NOT NULL,
      completion TEXT,
      completed_at TEXT
    )
  `).run();
}

/** Columnas agregadas después de la tabla original: D1 no tiene
 *  `ADD COLUMN IF NOT EXISTS`, así que el intento repetido se traga el error.
 *  Se llaman solo desde las rutas que las usan, no en cada request.
 *  · `vigilante` — resultado del alta en el portal.
 *  · `progreso`  — lo que el cliente lleva cargado del post-pago, guardado a
 *    medida que escribe. NO es `completion`: eso es la versión final firmada. */
async function addColumn(db: D1Database, sql: string): Promise<void> {
  try { await db.prepare(sql).run(); } catch { /* la columna ya existe */ }
}

export async function ensureVigilanteColumn(db: D1Database): Promise<void> {
  await addColumn(db, 'ALTER TABLE orders ADD COLUMN vigilante TEXT');
}

export async function ensureProgresoColumn(db: D1Database): Promise<void> {
  await addColumn(db, 'ALTER TABLE orders ADD COLUMN progreso TEXT');
}

/** Ref no adivinable: UM-YYYYMMDD-XXXXXXXX (base36). Es también la "llave" de
 *  lectura del pedido, por eso no usa un sufijo corto numérico. */
export function newOrderRef(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const rand = Array.from(bytes, b => (b % 36).toString(36)).join('').toUpperCase();
  return `UM-${ymd}-${rand}`;
}

/** Normaliza la lista de clases que manda el cliente: enteros 1–45, sin
 *  duplicados, ordenadas, y nunca más de MAX_CLASES. */
export function sanitizeClases(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const nums = raw
    .map(v => (typeof v === 'number' ? Math.floor(v) : parseInt(String(v), 10)))
    .filter(n => Number.isInteger(n) && n >= 1 && n <= 45);
  return [...new Set(nums)].sort((a, b) => a - b).slice(0, MAX_CLASES);
}

/** Medida del signo en cm: un decimal, dentro del rango que fijamos nosotros
 *  (el INPI no declara mínimo ni máximo). Fuera de rango → null. */
export function sanitizeCm(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const v = Math.round(n * 10) / 10;
  return v >= LOGO_CM_MIN && v <= LOGO_CM_MAX ? v : null;
}

/** Normaliza las marcas del pedido: nombre recortado, clases saneadas, sin
 *  marcas vacías ni repetidas, nunca más de MAX_MARCAS.
 *  El nombre se exige siempre: en una figurativa no es la denominación (no
 *  tiene) sino la referencia interna con la que se identifica el pedido.
 *  Los campos del logo (colores, medidas, key en R2) se completan post-pago;
 *  acá solo se preservan si ya venían en el payload guardado. */
export function sanitizeMarcas(raw: unknown): MarcaPedido[] {
  if (!Array.isArray(raw)) return [];
  const out: MarcaPedido[] = [];
  const vistos = new Set<string>();
  for (const m of raw) {
    const nombre = String((m as any)?.nombre ?? '').trim().slice(0, 120);
    if (!nombre) continue;
    const tipo = normalizeTipoMarca((m as any)?.tipo);
    // La clave incluye el tipo: la misma denominación como denominativa y como
    // mixta son dos solicitudes distintas ante el INPI, no un duplicado.
    const key = `${nombre.toLowerCase()}|${tipo}`;
    if (vistos.has(key)) continue;
    vistos.add(key);

    const marca: MarcaPedido = { nombre, tipo, clases: sanitizeClases((m as any)?.clases) };
    if (requiereLogo(tipo)) {
      marca.colores = String((m as any)?.colores ?? '').trim().slice(0, 200);
      marca.alto = sanitizeCm((m as any)?.alto);
      marca.ancho = sanitizeCm((m as any)?.ancho);
      const logoKey = String((m as any)?.logoKey ?? '').trim();
      marca.logoKey = logoKey && logoKey.length <= 200 ? logoKey : null;
    }
    out.push(marca);
    if (out.length >= MAX_MARCAS) break;
  }
  return out;
}

/** Convierte cualquier forma de payload (v2 multi-marca o v1 legado con
 *  `marca` + `clases`/`clase`) a la lista de marcas normalizada. */
export function marcasDesdePayload(p: {
  marcas?: unknown;
  marca?: { nombre?: string; tipo?: unknown } | null;
  clases?: unknown;
  clase?: number | null;
}): MarcaPedido[] {
  const v2 = sanitizeMarcas(p.marcas);
  if (v2.length) return v2;
  const nombre = String(p.marca?.nombre ?? '').trim();
  const clases = sanitizeClases(
    Array.isArray(p.clases) ? p.clases : (typeof p.clase === 'number' ? [p.clase] : []),
  );
  return nombre || clases.length
    ? [{ nombre, tipo: normalizeTipoMarca(p.marca?.tipo), clases }]
    : [];
}

/** La ÚNICA corrección de tipo que se acepta después del pago: figurativa →
 *  mixta. El tipo se elige antes de pagar y ahí queda congelado, pero la imagen
 *  recién se sube en el paso 5, y es al verla cuando se descubre que la
 *  "figurativa" tenía texto — que ante el INPI es una presentación defectuosa.
 *  No cambia el precio (los honorarios son por clase, no por tipo), así que se
 *  corrige en vez de mandar al cliente a rehacer el pedido.
 *
 *  Sin denominación no se corrige nada: una mixta sin texto declarado es peor
 *  que la figurativa que veníamos a arreglar. Ninguna otra combinación de tipos
 *  pasa: es la única que el formulario ofrece y la única que no toca el precio.
 *
 *  @param guardada  la marca del snapshot del pago (la fuente de verdad)
 *  @param delCliente  la misma marca según el paso 5, que puede venir corregida
 */
export function corregirTipoPostPago(
  guardada: { nombre: string; tipo?: unknown },
  delCliente: { nombre?: unknown; corregidaAMixta?: unknown } | null | undefined,
): { nombre: string; tipo: MarcaPedido['tipo']; correccion: string | null } {
  const tipo = normalizeTipoMarca(guardada.tipo);
  const denominacion = String(delCliente?.nombre ?? '').trim().slice(0, 120);
  if (tipo !== 'figurativa' || delCliente?.corregidaAMixta !== true || !denominacion) {
    return { nombre: guardada.nombre, tipo, correccion: null };
  }
  return {
    nombre: denominacion,
    tipo: 'mixta',
    correccion: `«${guardada.nombre}» pasó a MIXTA con la denominación «${denominacion}»`,
  };
}

/** Normaliza los titulares que llegan en `completion`.
 *
 *  Acepta las dos formas: `titulares[]` (multi-titular) y el `titular` suelto de
 *  todo pedido anterior a esto, que entra como un único titular al 100%. El
 *  legado NO se puede tirar: los pedidos viejos se releen para reenviar emails
 *  y para el alta en el portal.
 *
 *  Los porcentajes no se validan acá, se saneen: el pedido ya está pago y el
 *  poder firmado, así que un número raro no puede hacer fallar el PATCH. Lo que
 *  se garantiza es que sean números y que sumen 100 — si no cierran (payload
 *  armado a mano, bug del wizard) se reparte en partes iguales, que es la única
 *  respuesta defendible cuando no sabemos qué quiso decir. */
export function titularesDesdeCompletion(completion: unknown): TitularPedido[] {
  const c = completion as Record<string, any> | null | undefined;
  const crudos: any[] = Array.isArray(c?.titulares) && c.titulares.length
    ? c.titulares
    : (c?.titular ? [c.titular] : []);

  const texto = (v: unknown, max = 120) => String(v ?? '').trim().slice(0, max);

  const titulares: TitularPedido[] = crudos.slice(0, MAX_TITULARES).map((t: any) => ({
    tipoPersona: 'Humana' as const,
    nombre: texto(t?.nombre, 80),
    apellido: texto(t?.apellido, 80),
    genero: texto(t?.genero, 40),
    estadoCivil: texto(t?.estadoCivil, 40),
    nombreConyuge: texto(t?.nombreConyuge, 160),
    documento: {
      tipo: texto(t?.documento?.tipo, 40) || 'DNI',
      numero: texto(t?.documento?.numero, 30),
    },
    cuit: texto(t?.cuit, 20),
    email: texto(t?.email, 160).toLowerCase(),
    domicilio: {
      pais: texto(t?.domicilio?.pais, 60) || 'Argentina',
      calle: texto(t?.domicilio?.calle, 120),
      numero: texto(t?.domicilio?.numero, 20),
      piso: texto(t?.domicilio?.piso, 20),
      depto: texto(t?.domicilio?.depto, 20),
      localidad: texto(t?.domicilio?.localidad, 120),
      codigoPostal: texto(t?.domicilio?.codigoPostal, 20),
      provincia: texto(t?.domicilio?.provincia, 60),
    },
    porcentaje: (() => {
      const n = typeof t?.porcentaje === 'number'
        ? t.porcentaje
        : parseFloat(String(t?.porcentaje ?? '').replace(',', '.'));
      return Number.isFinite(n) && n >= 0 && n <= 100 ? redondearPorcentaje(n) : NaN;
    })(),
    firmaAqui: t?.firmaAqui === true,
  }));

  if (!titulares.length) return [];

  const suma = redondearPorcentaje(
    titulares.reduce((s, t) => s + (Number.isFinite(t.porcentaje) ? t.porcentaje : 0), 0),
  );
  if (titulares.some(t => !Number.isFinite(t.porcentaje)) || suma !== 100) {
    const partes = repartirPorcentajes(titulares.length);
    titulares.forEach((t, i) => { t.porcentaje = partes[i]; });
  }

  // Alguien tiene que ser el que firma en el wizard. Sin la bandera (pedido
  // legado, o payload armado a mano) es el primero: es el orden en que se
  // cargaron y el primero es siempre quien está completando.
  if (!titulares.some(t => t.firmaAqui)) titulares[0].firmaAqui = true;

  return titulares;
}

/** Una marca del pedido, ya consolidada: lo que se pagó + lo que se cargó
 *  después. Es la forma que consumen los emails y el alta en el portal. */
export interface MarcaConsolidada extends MarcaPedido {
  tipo: MarcaPedido['tipo'];
  descripcion: string;
  sitioWeb: string;
  colores?: string;
  alto?: number | null;
  ancho?: number | null;
  logoAdjunto?: string | null;
}

/** Junta el snapshot del pago con lo que el cliente cargó post-pago.
 *
 *  Marcas, clases y tipo salen SIEMPRE del snapshot: es lo que se pagó y lo que
 *  se presenta. Descripción, sitio, colores y medidas sólo existen en
 *  `completion`. Las dos listas salen del mismo array ordenado del wizard, así
 *  que el índice es la clave fiable; el nombre queda de respaldo por si el
 *  cliente reordenó.
 *
 *  Vive acá y no en la ruta porque lo necesitan tres caminos —el PATCH del
 *  pedido, el alta en el portal y la página de firma de un cotitular— y las
 *  tres tienen que ver exactamente la misma marca. */
export function consolidarMarcas(stored: any, completion: any): {
  storedMarcas: MarcaPedido[];
  marcas: MarcaConsolidada[];
  /** Correcciones de tipo post-pago (figurativa → mixta), en texto */
  correcciones: string[];
} {
  const storedMarcas = marcasDesdePayload(stored);

  // Legado v1: la descripción venía suelta en completion.marca.
  const completionMarcas: any[] = Array.isArray(completion?.marcas)
    ? completion.marcas
    : (completion?.marca ? [completion.marca] : []);
  const porNombre: Record<string, any> = {};
  for (const m of completionMarcas) {
    const key = String(m?.nombre ?? '').trim().toLowerCase();
    if (key) porNombre[key] = m;
  }

  const correcciones: string[] = [];
  const marcas: MarcaConsolidada[] = storedMarcas.map((m, i) => {
    const porIndice = completionMarcas[i];
    const extra = (
      String(porIndice?.nombre ?? '').trim().toLowerCase() === m.nombre.toLowerCase()
        ? porIndice
        : porNombre[m.nombre.toLowerCase()] ?? porIndice
    ) ?? {};
    const { nombre, tipo, correccion } = corregirTipoPostPago(m, extra);
    if (correccion) correcciones.push(correccion);
    return {
      nombre,
      clases: m.clases,
      tipo,
      descripcion: String(extra.descripcion || '').trim(),
      sitioWeb: String(extra.sitioWeb || '').trim(),
      ...(requiereLogo(tipo ?? 'denominativa') ? {
        colores: String(extra.colores || '').trim(),
        alto: sanitizeCm(extra.alto),
        ancho: sanitizeCm(extra.ancho),
        logoAdjunto: null as string | null,
      } : {}),
    };
  });

  return { storedMarcas, marcas, correcciones };
}

/** Precios calculados SIEMPRE en el servidor — nunca se confía en el cliente.
 *  Una línea = una marca en una clase. */
export function computePricing(marcas: MarcaPedido[], garantia: boolean) {
  return computeOrderPricing(contarLineas(marcas), garantia);
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function hexEncode(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

/** HMAC-SHA256 en hex, con Web Crypto (disponible en Workers sin flags) */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return hexEncode(sig);
}
