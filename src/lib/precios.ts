// Precios para textos editoriales (posts del blog).
//
// Un .md no puede importar código, así que escribe tokens `{{HONORARIOS}}` y
// acá se resuelven contra PRICING durante el build: subir un precio en
// `checkout/constants.ts` actualiza el artículo, sus FAQ y el JSON-LD sin que
// haya que acordarse de este archivo. Se aplican en dos lugares:
//   · el cuerpo del markdown → `remarkPrecios.ts` (plugin de remark)
//   · el frontmatter (title, description, faqs) → `src/content/config.ts`
//
// Además del precio que cobramos, hay tokens para los datos del INPI que antes
// se escribían a mano en el post ({{UMAPI}}, {{ARANCEL_POSICION}}): salen del
// snapshot que baja `scripts/actualizar-aranceles.mjs` del portal, así que un
// aumento mensual del organismo tampoco deja un artículo con el número viejo.
import { PRICING, formatARS } from './checkout/constants';
import aranceles from '../data/aranceles-inpi.json';

const hon = PRICING.honorarios;
const arancel = PRICING.arancelInpi;

/** Arancel del INPI, con los dos decimales que publica el portal cuando los
 *  tiene: $40.569 pero $1.622,76. `formatARS` redondea y acá el dato es la
 *  referencia, así que los centavos importan. */
export function pesosInpi(n: number): string {
  return '$' + n.toLocaleString('es-AR', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** Excedente por cada posición del nomenclador más allá de la 20 */
const posicionExtra = aranceles.tramites.find(t => t.codigo === 110100)!;

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
  /** Valor de 1 UMAPI, la unidad en la que el INPI expresa sus aranceles */
  UMAPI: pesosInpi(aranceles.umapi),
  /** Arancel por cada posición del nomenclador después de la 20 */
  ARANCEL_POSICION: pesosInpi(posicionExtra.importe),
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
