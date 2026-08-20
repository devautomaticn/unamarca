// ────────────────────────────────────────────────────────────────────────────
//  CATÁLOGO DE MENSAJES DE WHATSAPP
//
//  ⚠️  CONTRATO CON EL PARSER DE ATRIBUCIÓN DEL CRM (issue #64).
//
//  Cada link de WhatsApp del sitio prellena uno de estos mensajes. El CRM los
//  matchea para saber de qué sección vino cada conversación. Cambiar un texto
//  NO rompe nada visible: rompe la atribución EN SILENCIO — no falla ningún
//  build ni ningún test, simplemente bajan los contactos atribuidos a "Web" y
//  suben los "sin match".
//
//  Si cambiás, agregás o borrás un mensaje:
//    1. Bumpeá CATALOG_VERSION (semver: patch = texto, minor = alta/baja).
//    2. El catálogo se publica solo en /wa-catalog.json (generado desde este
//       archivo por src/pages/wa-catalog.json.ts). El parser lo lee de ahí,
//       así que no hace falta avisar a mano — pero avisá igual si borrás algo.
//    3. NUNCA borres una entrada de LEGACY: siguen llegando mensajes viejos
//       desde páginas cacheadas, chats guardados y links compartidos.
//
//  Reglas de matcheo del lado del CRM (acordadas, se documentan acá para que
//  quien edite entienda por qué los textos son como son):
//    · match exacto, puntuación incluida — por eso nadie debe "prolijear" tildes
//      ni signos;
//    · sólo si es el PRIMER mensaje de la conversación;
//    · el referral de Meta Ads le gana siempre al texto.
//  Los mensajes marcados con riesgo 'medio' son frases que un humano podría
//  tipear solo. Al agregar uno nuevo, preferí que nombre dónde estaba parado
//  ("Entré al blog de UnaMarca…") antes que una intención genérica.
// ────────────────────────────────────────────────────────────────────────────

export const CATALOG_VERSION = '1.5.0';

/** Agente IA. Recibe todos los CTAs de conversión. */
export const WA_AGENTE = '5491148999564';
/** Línea original. Contacto directo, legales y clientes internacionales. */
export const WA_LINEA = '5491149712224';

/** Detalle grueso del CRM. Varios contextos mapean al mismo. */
export type WaSection =
  | 'Home'
  | 'Blog'
  | 'Checkout'
  | 'Verificador'
  | 'Legal'
  | 'Ads'
  | 'Internacional'
  | 'Guia'
  | 'Web';

/** Probabilidad de que un humano escriba esta frase por su cuenta. */
type WaRisk = 'nulo' | 'bajo' | 'medio';

type WaEntry = {
  number: string;
  section: WaSection;
  risk: WaRisk;
  /** Nota para el parser; se publica en el JSON. */
  note?: string;
} & (
  | { match: 'exact'; text: string }
  /** `prefix` es la parte constante: el parser matchea por ahí. */
  | { match: 'prefix'; prefix: string; template: string }
);

// ── Mensajes vivos ──────────────────────────────────────────────────────────

export const WA_MESSAGES = {
  // Home
  home_hero: {
    number: WA_AGENTE,
    section: 'Home',
    risk: 'medio',
    match: 'exact',
    text: 'Hola! Quiero registrar mi marca y quería consultar cómo empezar.',
  },
  home_precios: {
    number: WA_AGENTE,
    section: 'Home',
    risk: 'bajo',
    match: 'exact',
    text: 'Hola! Vi los precios en la web y quería consultar por el registro de mi marca.',
  },
  home_cta_final: {
    number: WA_AGENTE,
    section: 'Home',
    risk: 'medio',
    match: 'exact',
    text: 'Hola! Ya tengo el nombre de mi marca y quiero registrarla.',
  },
  home_float: {
    number: WA_AGENTE,
    section: 'Home',
    risk: 'bajo',
    match: 'exact',
    text: 'Hola! Estaba mirando la web y quería consultar por el registro de mi marca.',
  },
  home_contacto: {
    number: WA_LINEA,
    section: 'Home',
    risk: 'bajo',
    match: 'exact',
    text: 'Hola! Vi el contacto en la web y quería hacer una consulta.',
    note: 'Bloque CONTACTO de la home. Cae en la línea original, no en el agente.',
  },

  // Blog
  blog_post: {
    number: WA_AGENTE,
    section: 'Blog',
    risk: 'nulo',
    match: 'prefix',
    prefix: 'Hola! Estaba leyendo «',
    template: 'Hola! Estaba leyendo «{titulo}» y quería hacer una consulta.',
    note:
      'El título va sólo en el cuerpo, para contexto del agente; en el CRM es "Blog". ' +
      'Se recorta a la parte anterior al primer ":" y a 65 caracteres. Máximo 119 en total.',
  },
  blog_float: {
    number: WA_AGENTE,
    section: 'Blog',
    risk: 'nulo',
    match: 'exact',
    text: 'Hola! Entré al blog de UnaMarca y quería consultar por el registro de mi marca.',
  },

  // Checkout
  registrar_empresa: {
    number: WA_AGENTE,
    section: 'Checkout',
    risk: 'nulo',
    match: 'exact',
    text: 'Hola! Quiero registrar una marca a nombre de una empresa (persona jurídica).',
  },
  registrar_clase: {
    number: WA_AGENTE,
    section: 'Checkout',
    risk: 'nulo',
    match: 'exact',
    text: 'Hola! Estoy registrando mi marca en unamarca.com.ar y no sé qué clase elegir.',
  },
  registrar_multiclase: {
    number: WA_AGENTE,
    section: 'Checkout',
    risk: 'nulo',
    match: 'prefix',
    prefix: 'Hola! Quiero registrar una marca en más de ',
    template: 'Hola! Quiero registrar una marca en más de {maxClases} clases.',
    note:
      'El número sale de MAX_CLASES (hoy 5) en src/lib/checkout/constants.ts, que ' +
      'desde 2026-08-11 es el máximo de clases POR MARCA. ' +
      'Cambia si se cambia el máximo de clases del checkout: matchear por prefijo.',
  },
  registrar_multimarca: {
    number: WA_AGENTE,
    section: 'Checkout',
    risk: 'nulo',
    match: 'prefix',
    prefix: 'Hola! Quiero registrar más de ',
    template: 'Hola! Quiero registrar más de {maxMarcas} marcas en el mismo pedido.',
    note:
      'Checkout multi-marca (alta 2026-08-11). El número sale de MAX_MARCAS (hoy 3) ' +
      'en src/lib/checkout/constants.ts: matchear por prefijo. No confundir con ' +
      'registrar_multiclase, que es UNA marca en muchas clases.',
  },
  registrar_float: {
    number: WA_AGENTE,
    section: 'Checkout',
    risk: 'nulo',
    match: 'exact',
    text: 'Hola! Estoy completando el formulario de registro y me trabé con algo.',
  },
  registrar_comprobante: {
    number: WA_AGENTE,
    section: 'Checkout',
    risk: 'nulo',
    match: 'prefix',
    prefix: 'Hola! Pagué por transferencia el pedido ',
    template: 'Hola! Pagué por transferencia el pedido {ref} y te mando el comprobante.',
    note:
      'Checkout pagado por transferencia (alta 2026-08-11). {ref} es el N° de pedido ' +
      '(UM-YYYYMMDD-XXXXXXXX): sirve para conciliar contra la tabla orders de D1, ' +
      'porque la transferencia bancaria llega sin nuestra referencia. Matchear por prefijo.',
  },

  // Verificador
  verificar_conflicto: {
    number: WA_AGENTE,
    section: 'Verificador',
    risk: 'nulo',
    match: 'prefix',
    prefix: 'Hola! Busqué la marca «',
    template:
      'Hola! Busqué la marca «{marca}» en {clases} y aparecieron marcas similares ' +
      '(ej. «{otraMarca}»). Quiero asesorarme para registrarla.',
    note:
      'Se emite sólo cuando el verificador encuentra un conflicto fuerte. Trae la ' +
      'marca buscada y las clases en el texto: es el mensaje más rico del catálogo.',
  },
  verificar_float: {
    number: WA_AGENTE,
    section: 'Verificador',
    risk: 'nulo',
    match: 'exact',
    text: 'Hola! Usé el verificador de marcas y quería consultar por el registro.',
  },

  // Legal
  legal_terminos: {
    number: WA_LINEA,
    section: 'Legal',
    risk: 'nulo',
    match: 'exact',
    text: 'Hola! Entré a los términos y condiciones y me quedó una duda.',
  },

  // Ads
  ads_whatsapp: {
    number: WA_AGENTE,
    section: 'Ads',
    risk: 'nulo',
    match: 'exact',
    text: 'Hola, vi su anuncio y quería consultar por el registro de marcas.',
    note:
      'Único mensaje que arranca con "Hola," (coma) en vez de "Hola!". Sirve de ' +
      'doble confirmación contra el referral de Meta.',
  },

  // Internacional
  en_landing: {
    number: WA_LINEA,
    section: 'Internacional',
    risk: 'nulo',
    match: 'exact',
    text:
      "Hello! We're a company based outside Argentina and we'd like to register " +
      'our trademark before the INPI. Could you help us?',
    note:
      'Lo usan los DOS CTAs de la landing EN. En GA4 se distinguen por source ' +
      '("en_landing" y "en_landing_final"); en el texto son indistinguibles.',
  },
  float_en: {
    number: WA_LINEA,
    section: 'Internacional',
    risk: 'nulo',
    match: 'exact',
    text:
      "Hi! I was browsing your site and I'd like to ask about registering a " +
      'trademark in Argentina.',
  },

  // Guía DIY (privada, se vende por WhatsApp; ver /guia/[token])
  guia_presentacion: {
    number: WA_AGENTE,
    section: 'Guia',
    risk: 'nulo',
    match: 'exact',
    text:
      'Hola! Compré la guía para registrar mi marca y no puedo dejar habilitado ' +
      'el trámite en el INPI. Quería consultar por presentarla ustedes.',
    note:
      'Paso de clave fiscal de la guía DIY. Es el lead más caliente del producto: ' +
      'ya pagó y se trabó antes de empezar.',
  },
  guia_ayuda: {
    number: WA_AGENTE,
    section: 'Guia',
    risk: 'nulo',
    match: 'exact',
    text: 'Hola! Estoy siguiendo la guía para registrar mi marca y me trabé en un paso.',
    note: 'Cierre de la guía DIY y paso "cuándo esto te queda grande".',
  },
  guia_pendiente: {
    number: WA_AGENTE,
    section: 'Guia',
    risk: 'nulo',
    match: 'exact',
    text:
      'Hola! Compré la guía para registrar mi marca y todavía no se me activa el acceso.',
    note:
      'Pantalla de pago pendiente / acceso dado de baja de la guía DIY. Puede ser ' +
      'una transferencia esperando que el agente valide el comprobante.',
  },
  guia_float: {
    number: WA_AGENTE,
    section: 'Guia',
    risk: 'nulo',
    match: 'exact',
    text: 'Hola! Tengo una consulta sobre la guía para registrar mi marca.',
    note: 'Botón flotante dentro de la guía DIY.',
  },

  // Aranceles del INPI (/aranceles-inpi)
  aranceles_float: {
    number: WA_AGENTE,
    section: 'Web',
    risk: 'nulo',
    match: 'exact',
    text:
      'Hola! Estaba viendo la tabla de aranceles del INPI y quería consultar por ' +
      'el registro de mi marca.',
    note:
      'Botón flotante de /aranceles-inpi. El lead llega mirando el costo oficial ' +
      'del trámite, así que ya sabe que el arancel va aparte de los honorarios.',
  },

  // Fallback
  float_generic: {
    number: WA_AGENTE,
    section: 'Web',
    risk: 'nulo',
    match: 'exact',
    text: 'Hola! Entré a la web de UnaMarca y quería hacer una consulta.',
    note:
      'Botón flotante en páginas sin contexto propio. Cualquier página nueva cae ' +
      'acá por defecto hasta que se le asigne uno.',
  },
} as const satisfies Record<string, WaEntry>;

export type WaContext = keyof typeof WA_MESSAGES;

/** Contextos válidos para el botón flotante de BaseLayout. */
export type WaFloatContext =
  | 'home_float'
  | 'blog_float'
  | 'registrar_float'
  | 'verificar_float'
  | 'aranceles_float'
  | 'float_en'
  | 'guia_float'
  | 'float_generic';

// ── Mensajes retirados ──────────────────────────────────────────────────────

/**
 * Ya no se emiten, pero siguen llegando: páginas cacheadas, chats guardados,
 * links compartidos por WhatsApp. Matchear indefinidamente.
 */
export const WA_LEGACY = [
  {
    key: 'legacy_generico',
    match: 'exact',
    text: 'Hola, tomé su contacto de la web y quería consultar por el servicio de registro de marcas!',
    section: 'Web',
    retiredOn: '2026-08-09',
    note:
      'Mensaje único que usaban 6 links distintos (home ×4, botón flotante de TODAS ' +
      'las páginas, y el CTA de los posts). Uno de esos links apuntaba a la línea ' +
      'original y el resto al agente. No es atribuible a ninguna sección de forma ' +
      'retroactiva: mapear a "Web" y nada más.',
  },
] as const;

// ── Helpers ─────────────────────────────────────────────────────────────────

function href(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** Contextos que arman el texto con datos: no sirven para waHref/waText. */
type WaTemplateContext =
  | 'blog_post'
  | 'registrar_multiclase'
  | 'registrar_multimarca'
  | 'registrar_comprobante'
  | 'verificar_conflicto';

/** Link de WhatsApp para un contexto de mensaje estático. */
export function waHref(context: Exclude<WaContext, WaTemplateContext>): string {
  const entry = WA_MESSAGES[context] as Extract<WaEntry, { match: 'exact' }>;
  return href(entry.number, entry.text);
}

/** Texto del mensaje de un contexto estático (para reusar fuera de un href). */
export function waText(context: Exclude<WaContext, WaTemplateContext>): string {
  return (WA_MESSAGES[context] as Extract<WaEntry, { match: 'exact' }>).text;
}

const BLOG_TITLE_MAX = 65;

/**
 * Recorta el título de un post para el mensaje: se queda con la parte anterior
 * al primer ":" y trunca a 65 caracteres. Mantiene el mensaje en 119 o menos.
 */
export function shortenPostTitle(title: string): string {
  const head = title.split(':')[0].trim();
  if (head.length <= BLOG_TITLE_MAX) return head;
  return head.slice(0, BLOG_TITLE_MAX - 1).trimEnd() + '…';
}

/** Link del CTA de un post, con el título del artículo en el cuerpo. */
export function waHrefBlogPost(title: string): string {
  const e = WA_MESSAGES.blog_post;
  return href(e.number, e.template.replace('{titulo}', shortenPostTitle(title)));
}

/** Link de "quiero más de N clases" (en una misma marca) del checkout. */
export function waHrefMulticlase(maxClases: number): string {
  const e = WA_MESSAGES.registrar_multiclase;
  return href(e.number, e.template.replace('{maxClases}', String(maxClases)));
}

/** Link de "quiero más de N marcas en el mismo pedido" del checkout. */
export function waHrefMultimarca(maxMarcas: number): string {
  const e = WA_MESSAGES.registrar_multimarca;
  return href(e.number, e.template.replace('{maxMarcas}', String(maxMarcas)));
}

/** Link para mandar el comprobante de una transferencia, con el N° de pedido. */
export function waHrefComprobante(ref: string): string {
  const e = WA_MESSAGES.registrar_comprobante;
  return href(e.number, e.template.replace('{ref}', ref));
}

/**
 * Lo que necesita el script del verificador, que arma el mensaje en el cliente
 * con la marca y las clases que buscó el usuario.
 */
export const VERIFICAR_CONFLICTO = {
  number: WA_MESSAGES.verificar_conflicto.number,
  build(marca: string, clases: string, otraMarca: string): string {
    return href(
      WA_MESSAGES.verificar_conflicto.number,
      `Hola! Busqué la marca «${marca}» en ${clases} y aparecieron marcas similares ` +
        `(ej. «${otraMarca}»). Quiero asesorarme para registrarla.`
    );
  },
};

/** Payload que se publica en /wa-catalog.json para el parser del CRM. */
export function buildCatalogExport() {
  return {
    version: CATALOG_VERSION,
    source: 'https://unamarca.com.ar/wa-catalog.json',
    contract: 'crm-attribution-parser (#64)',
    matching: {
      rules: [
        'Match exacto incluyendo puntuación y tildes, salvo las entradas con match "prefix".',
        'Aplicar sólo al primer mensaje de la conversación.',
        'El referral de Meta Ads le gana siempre al texto: si hay ambos, es Ads.',
      ],
      riskNote:
        'risk="medio" marca frases que un humano podría tipear por su cuenta. ' +
        'Son las que más pueden inflar "Web" si se relaja el match exacto.',
    },
    numbers: { agente: WA_AGENTE, linea: WA_LINEA },
    messages: Object.entries(WA_MESSAGES).map(([key, e]) => ({ key, ...e })),
    legacy: WA_LEGACY,
  };
}
