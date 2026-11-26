// Promociones del checkout (vigilant #313).
//
// Una promo es un TOTAL por clase (arancel del INPI incluido) para quien llega
// con su código en el link (`/registrar?…&promo=BLACKFRIDAY`, lo arma Sofía
// cuando la charla vino por la promo). El cliente no tipea nada.
//
// Reglas, iguales en la página y en el servidor (este módulo lo importan los
// dos):
// · vale hasta `hasta` (UTC) y sólo con los `medios` de pago listados; con
//   otro medio rige el precio de siempre;
// · se descuenta de los honorarios: honorarios = porClase − arancel vigente
//   (el arancel no se toca, es del INPI). La garantía va aparte, igual que
//   siempre;
// · el servidor vuelve a validar código, fecha y medio antes de cotizar: lo
//   que diga el navegador no fija ningún precio.
// Sumar otra promo = sumar una entrada a PROMOS.

import { PRICING } from './constants';

export type MedioPromo = 'mercadopago' | 'transferencia';

export interface PromoCheckout {
  codigo: string;
  nombre: string;
  /** Total por clase, arancel del INPI incluido. */
  porClase: number;
  /** Último instante en que vale, ISO en UTC. */
  hasta: string;
  /** Cómo se lo decimos al cliente. */
  hastaTexto: string;
  medios: MedioPromo[];
}

export const PROMOS: PromoCheckout[] = [
  {
    codigo: 'BLACKFRIDAY',
    nombre: 'Black Friday',
    porClase: 99_000,
    hasta: '2026-12-01T02:59:59Z', // lunes 30/11 23:59 (ART)
    hastaTexto: 'el lunes 30/11 a las 23:59',
    medios: ['transferencia'],
  },
];

/** La promo de ese código si todavía vale, o null. Sin distinguir mayúsculas. */
export function promoVigente(codigo: unknown, ahora: Date = new Date()): PromoCheckout | null {
  if (typeof codigo !== 'string' || !codigo.trim()) return null;
  const c = codigo.trim().toUpperCase();
  const p = PROMOS.find(x => x.codigo === c);
  if (!p) return null;
  return ahora.getTime() <= Date.parse(p.hasta) ? p : null;
}

/** ¿La promo aplica con este medio de pago? */
export function aplicaConMedio(p: PromoCheckout | null, medio: MedioPromo): boolean {
  return !!p && p.medios.includes(medio);
}

/** Honorarios por clase con la promo: lo que queda del total después del
 *  arancel vigente. Nunca negativo ni más que los de siempre. */
export function honorariosPromo(p: PromoCheckout, arancelInpi: number = PRICING.arancelInpi): number {
  return Math.max(0, Math.min(PRICING.honorarios, Math.round(p.porClase - arancelInpi)));
}
