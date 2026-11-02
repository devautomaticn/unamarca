// Plugin de remark que mete un bloque de WhatsApp a mitad de cada post del blog,
// y de paso pasa al catálogo los links de WhatsApp escritos a mano en el texto.
//
// Por qué existe: medido el 2026-11-02, el blog recibía ~550 clics de Google por
// mes y en tres meses el CTA del final (`blog_post`, un link chico debajo de las
// FAQ) no generó ni una charla con Sofía. Quien sí escribe desde la web compra
// ~4 veces más que quien llega por Meta, así que el problema era que el lector
// no veía la salida a tiempo.
//
// Va antes del tercer `##` (o del segundo, si el post tiene pocos): después de
// la introducción y de la primera sección, que es donde el lector ya decidió
// que el tema le sirve. Usa el mensaje `blog_post` del catálogo (no hay mensaje
// nuevo): para el CRM es "Blog"; GA4 lo separa del final con `cta_position`.
import { aplicarPrecios } from './precios';
import { waHrefBlogPost } from './wa';

interface Node {
  type: string;
  depth?: number;
  value?: string;
  url?: string;
  children?: Node[];
}

const WA_LINK = /^https:\/\/(api\.whatsapp\.com|wa\.me)\//;

/**
 * Los posts traían links de WhatsApp escritos a mano en el texto, con un
 * mensaje que no está en el catálogo ("Quisiera más información…"): llegaban al
 * CRM sin fuente. Se reescriben al de `blog_post` para que cuenten como Blog.
 * Devuelve cuántos tocó.
 */
export function normalizarLinksWa(tree: Node, href: string): number {
  let n = 0;
  (function walk(node: Node) {
    if (node.type === 'link' && node.url && WA_LINK.test(node.url)) {
      node.url = href;
      n++;
    }
    node.children?.forEach(walk);
  })(tree);
  return n;
}

interface VFile {
  path?: string;
  data?: { astro?: { frontmatter?: Record<string, unknown> } };
}

/** Índice del `##` antes del cual va el bloque, o -1 si no hay dónde. */
export function posicionCta(children: Node[]): number {
  const h2 = children
    .map((n, i) => (n.type === 'heading' && n.depth === 2 ? i : -1))
    .filter(i => i >= 0);
  if (h2.length >= 4) return h2[2];
  if (h2.length >= 2) return h2[1];
  return -1;
}

export function htmlCta(titulo: string): string {
  return `<aside class="post-cta-mid" aria-label="Consultanos por WhatsApp">
  <p class="post-cta-mid-title">¿Querés registrar tu marca?</p>
  <p class="post-cta-mid-sub">Escribinos por WhatsApp: te decimos gratis si el nombre está disponible y cuánto te sale el trámite.</p>
  <a class="btn btn-wa" href="${waHrefBlogPost(titulo)}" target="_blank" rel="noopener noreferrer" onclick="typeof gtag==='function'&&gtag('event','whatsapp_click',{'source':'blog_post','cta_position':'mid'})">Consultar por WhatsApp</a>
</aside>`;
}

export function remarkCtaBlog() {
  return function (tree: Node, file: VFile) {
    const path = file?.path ?? '';
    if (!/[\\/]content[\\/]blog[\\/]/.test(path)) return;
    const titulo = file.data?.astro?.frontmatter?.title;
    if (typeof titulo !== 'string' || !tree.children) return;
    // El título puede traer tokens de precio ({{TOTAL}}): el frontmatter que ve
    // remark es el crudo, el que resuelve config.ts llega recién a la página.
    const tituloFinal = aplicarPrecios(titulo, path);
    normalizarLinksWa(tree, waHrefBlogPost(tituloFinal));
    const i = posicionCta(tree.children);
    if (i < 0) return;
    tree.children.splice(i, 0, { type: 'html', value: htmlCta(tituloFinal) });
  };
}
