// ────────────────────────────────────────────────────────────────────────────
//  CANAL EN LOS MENSAJES DE WHATSAPP
//
//  ⚠️  ES PARTE DEL CONTRATO CON EL PARSER DEL CRM. Ver docs/spec_wa_canal.md.
//
//  El catálogo (src/lib/wa.ts) dice de qué SECCIÓN del sitio salió un mensaje,
//  pero no por qué CANAL llegó el visitante: quien entra por un anuncio de
//  Google y toca el hero manda lo mismo que un orgánico. Meta resuelve esto con
//  un referral dentro de WhatsApp; Google no manda nada.
//
//  Así que el canal viaja en el saludo. Si el visitante hizo clic en un anuncio
//  de Google, el mismo mensaje sale con "Buenas!" en vez de "Hola!":
//
//      Hola! Quiero registrar mi marca y…     → sección Home, sin anuncio
//      Buenas! Quiero registrar mi marca y…   → sección Home, canal google_ads
//
//  Es una regla y no una lista de textos nuevos: todos los mensajes en español
//  que emite el sitio arrancan con "Hola! ", y el resto del texto no cambia.
//
//  Este módulo no importa el catálogo a propósito: lo carga el script de todas
//  las páginas, y el catálogo pesa.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Prendido el 2026-09-29, después de que el CRM desplegó su parser con la copia
 * 1.11.0 del catálogo.
 *
 * ⚠️ CAMBIAR ESTE VALOR ES UN CAMBIO DE CONTRATO: bumpear CATALOG_VERSION y
 * avisar al CRM el mismo día. El valor se publica en /wa-catalog.json
 * (`channels.emitting`) y ellos escriben `sin_anuncio` sólo cuando su copia
 * dice `true`. Si algún día su parser deja de leer las variantes, apagar esto
 * es lo que evita que los contactos de anuncios caigan en "sin match".
 */
export const WA_CANAL_EMITIR = true;

/** Con qué arrancan los mensajes que admiten variante. */
export const WA_SALUDO_BASE = 'Hola! ';

/** Un canal por saludo. Agregar uno es un cambio de contrato: bumpear
 *  CATALOG_VERSION y avisar al CRM antes de emitirlo. */
export const WA_CANALES = {
  google_ads: { saludo: 'Buenas! ' },
} as const;

export type WaCanal = keyof typeof WA_CANALES;

/** Cookie que le dice al navegador por qué canal llegó. La escribe el servidor
 *  (ver src/pages/api/origen.ts) y no lleva ningún id: sólo el nombre del canal. */
export const WA_CANAL_COOKIE = 'um_canal';

/** Para probar en producción sin emitirle nada al público: con esta clave en
 *  `localStorage` el navegador se comporta como si la emisión estuviera
 *  prendida. `localStorage.setItem('um-canal-prueba', '1')`. */
export const WA_CANAL_PRUEBA_KEY = 'um-canal-prueba';

export function esWaCanal(v: unknown): v is WaCanal {
  return typeof v === 'string' && Object.hasOwn(WA_CANALES, v);
}

/** El mismo texto con el saludo del canal, o `null` si el mensaje no admite
 *  variante (no arranca con "Hola! "). */
export function varianteCanal(texto: string, canal: WaCanal): string | null {
  if (!texto.startsWith(WA_SALUDO_BASE)) return null;
  return WA_CANALES[canal].saludo + texto.slice(WA_SALUDO_BASE.length);
}

/**
 * Un link de wa.me con el mensaje pasado a la variante del canal. Devuelve el
 * mismo href si no es de WhatsApp, si no trae texto o si el mensaje no admite
 * variante.
 */
export function hrefConCanal(href: string, canal: WaCanal): string {
  try {
    const u = new URL(href);
    if (u.hostname !== 'wa.me') return href;
    const texto = u.searchParams.get('text');
    const variante = texto ? varianteCanal(texto, canal) : null;
    if (!variante) return href;
    // A mano y no con `searchParams.set`: ese serializa los espacios como "+",
    // y hay clientes de WhatsApp que muestran el signo tal cual.
    const resto = [...u.searchParams].filter(([k]) => k !== 'text')
      .map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('');
    return `${u.origin}${u.pathname}?text=${encodeURIComponent(variante)}${resto}`;
  } catch {
    return href;
  }
}
