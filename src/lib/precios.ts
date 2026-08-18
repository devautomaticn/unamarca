// Precios para textos editoriales (posts del blog).
//
// Un .md no puede importar código, así que escribe tokens `{{HONORARIOS}}` y
// acá se resuelven contra PRICING durante el build: subir un precio en
// `checkout/constants.ts` actualiza el artículo, sus FAQ y el JSON-LD sin que
// haya que acordarse de este archivo. Se aplican en dos lugares:
//   · el cuerpo del markdown → `remarkPrecios.ts` (plugin de remark)
//   · el frontmatter (title, description, faqs) → `src/content/config.ts`
//
// Los tokens son deliberadamente pocos: son para el precio que cobramos y los
// totales que se derivan de él. Un dato del INPI que no está en PRICING (el
// valor del UMAPI, la posición adicional) se escribe a mano en el post.
import { PRICING, formatARS } from './checkout/constants';

const hon = PRICING.honorarios;
const arancel = PRICING.arancelInpi;

export const PRECIO_TOKENS: Record<string, string> = {
  /** Honorarios por clase */
  HONORARIOS: formatARS(hon),
  HONORARIOS_2: formatARS(hon * 2),
  /** Garantía de Devolución por clase */
  GARANTIA: formatARS(PRICING.garantia),
  /** Arancel del INPI por clase (100 UMAPIS) */
  ARANCEL: formatARS(arancel),
  ARANCEL_2: formatARS(arancel * 2),
  /** Lo que paga el cliente, todo incluido */
  TOTAL: formatARS(hon + arancel),
  TOTAL_2: formatARS((hon + arancel) * 2),
  /** "agosto 2026" — mes del valor UMAPI que estamos publicando */
  VIGENCIA: PRICING.arancelVigencia,
};

const TOKEN_RE = /\{\{([A-Z0-9_]+)\}\}/g;

/** Resuelve los tokens de precio de un texto.
 *
 *  Un token que no existe corta el build a propósito. La alternativa —dejarlo
 *  pasar— publica `{{HONORARIOOS}}` en la página de precio con más tráfico del
 *  sitio y nadie se entera hasta que lo indexa Google; que falle el deploy se
 *  ve en el momento y el sitio anterior sigue en el aire. */
export function aplicarPrecios(texto: string, origen = 'texto'): string {
  return texto.replace(TOKEN_RE, (match, clave: string) => {
    const valor = PRECIO_TOKENS[clave];
    if (valor === undefined) {
      throw new Error(
        `[precios] Token desconocido ${match} en ${origen}. ` +
        `Disponibles: ${Object.keys(PRECIO_TOKENS).join(', ')}`,
      );
    }
    return valor;
  });
}
