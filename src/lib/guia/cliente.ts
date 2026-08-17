// Datos del comprador de la guía DIY.
//
// ⚠️ ESTO ES TODO LO QUE TENEMOS. La guía se vende por WhatsApp antes de que
// exista ningún trámite, así que del comprador sabemos su mail y lo que haya
// contado en el chat sobre sus marcas. Nada más.
//
// No tenemos (y la guía NUNCA debe simular que tiene): nombre, CUIT, domicilio,
// teléfono, clase ni términos. La clase y los términos los elige él con el
// nomenclador; el resto son datos suyos que sólo él conoce.
//
// Reglas de redacción que se desprenden de esto:
//   · Todo valor se muestra COMO EJEMPLO, nunca como instrucción
//     ("ej.: 4, 3 o 1", no "poné 4"). Quien presenta es el cliente.
//   · `marcas` puede venir VACÍO: si el chat no dio detalles, la guía sirve
//     igual con ejemplos genéricos. Nunca inventamos datos suyos.
//
// v1: registro de demo hardcodeado, para revisar la guía. Cuando exista la
// venta, `getCliente(token)` pasa a leer D1 desde una Pages Function.
//
// El token ES la credencial: no hay login. Un link por compra, revocable.

import type { TipoMarca } from '../checkout/constants';

export interface GuiaMarca {
  nombre: string;
  tipo: TipoMarca;
  /** Lo que ESA marca vende, en palabras del cliente. Dos marcas del mismo
   *  cliente pueden tener alcances distintos y caer en clases distintas. */
  alcance?: string;
}

export interface GuiaCliente {
  /** Credencial de acceso. Un token por compra. */
  token: string;
  /** Lo único que identifica al comprador. Se estampa en la guía. */
  email: string;
  /** 0..N. Sale del chat de WhatsApp, así que puede venir vacío. */
  marcas: GuiaMarca[];
}

/** Tope de ejemplos que se muestran. Más que esto satura cada paso y la guía
 *  deja de leerse. Si el cliente tiene más marcas, el trámite es el mismo. */
export const MAX_EJEMPLOS = 3;

/** Registro de demo: dos marcas, distinto tipo y distinto alcance. */
export const CLIENTE_DEMO: GuiaCliente = {
  token: 'demo-9f3a71c2',
  email: 'enrique.claudia@ejemplo.com.ar',
  marcas: [
    {
      nombre: 'CREACIONES MA-LIO',
      tipo: 'denominativa',
      alcance: 'Velas artesanales de soja, aromáticas y decorativas',
    },
    {
      nombre: 'MA-LIO',
      tipo: 'mixta',
      alcance: 'Llaveros y placas decorativas de resina',
    },
  ],
};

/** Cliente sin datos del chat: la guía tiene que seguir sirviendo. */
export const CLIENTE_SIN_DATOS: GuiaCliente = {
  token: 'demo-sindatos',
  email: 'sin.datos@ejemplo.com.ar',
  marcas: [],
};

/** Tokens que se buildean hoy. Al pasar a D1 esto desaparece. */
export const CLIENTES: GuiaCliente[] = [CLIENTE_DEMO, CLIENTE_SIN_DATOS];

export function getCliente(token: string): GuiaCliente | undefined {
  return CLIENTES.find(c => c.token === token);
}

/** Las marcas que se muestran como ejemplo, recortadas al tope. */
export function marcasEjemplo(c: GuiaCliente): GuiaMarca[] {
  return c.marcas.slice(0, MAX_EJEMPLOS);
}

/** Alguna marca del pedido lleva imagen (mixta o figurativa). */
export function algunaConLogo(c: GuiaCliente): boolean {
  return c.marcas.some(m => m.tipo !== 'denominativa');
}
