// Plugin de remark que resuelve los tokens `{{HONORARIOS}}` del cuerpo de los
// posts. Se registra en `astro.config.mjs` y corre sobre TODO el markdown, así
// que un post que no usa tokens no paga nada.
//
// Recorre el mdast a mano en vez de traer `unist-util-visit`: son ocho líneas y
// evita depender de un paquete que hoy sólo está como dependencia transitiva.
import { aplicarPrecios } from './precios';

interface Node {
  type: string;
  value?: string;
  children?: Node[];
}

/** Nodos con texto plano editable. `code` queda afuera a propósito: un bloque
 *  de código con llaves dobles es código, no un precio. */
const CON_TEXTO = new Set(['text', 'inlineCode']);

export function remarkPrecios() {
  return function (tree: Node, file: { path?: string }) {
    const origen = file?.path ?? 'markdown';
    (function walk(node: Node) {
      if (CON_TEXTO.has(node.type) && typeof node.value === 'string') {
        node.value = aplicarPrecios(node.value, origen);
      }
      node.children?.forEach(walk);
    })(tree);
  };
}
