// Config del self-checkout — precios, apoderado y contacto.
// Un solo lugar para actualizar valores (inflación, UMAPI, cambios de domicilio).

export const PRICING = {
  /** Honorarios del registro, POR CLASE */
  honorarios: 40_000,
  /** Upsell: Garantía de Devolución, POR CLASE (si el INPI deniega una clase,
   *  se devuelven los honorarios de esa clase) */
  garantia: 7_000,
  /** Arancel INPI: solicitud de registro, POR CLASE (100 UMAPIS, julio 2026) */
  arancelInpi: 38_994,
  /** Mes de referencia del valor UMAPI mostrado */
  arancelVigencia: 'julio 2026',
  /** Precio de lista de la vigilancia anual (se muestra tachado → gratis).
   *  TODO: igualar al precio real standalone de vigilante.unamarca.com.ar */
  vigilanciaLista: 30_000,
} as const;

/** Máximo de clases por pedido online; más que esto se deriva a WhatsApp */
export const MAX_CLASES = 5;

/** Totales del pedido para N clases. Todos los conceptos escalan por clase.
 *  Con 0 clases seleccionadas se muestra el precio de 1 (base del resumen). */
export function computeOrderPricing(nClases: number, garantia: boolean) {
  const n = Math.min(MAX_CLASES, Math.max(1, Math.floor(nClases) || 1));
  const honorarios = PRICING.honorarios * n;
  const garantiaMonto = garantia ? PRICING.garantia * n : 0;
  const arancelInpi = PRICING.arancelInpi * n;
  return {
    clases: n,
    honorarios,
    garantia: garantiaMonto,
    arancelInpi,
    total: honorarios + garantiaMonto + arancelInpi,
  };
}

/** Datos del apoderado que figura en la carta poder */
export const APODERADO = {
  tratamiento: 'Dr.',
  nombre: 'Michael Alan Simmons',
  dni: '38.536.168',
  cuit: '20-38536168-9',
  domicilio: 'Juan Francisco Seguí 4635, Ciudad Autónoma de Buenos Aires',
} as const;

export const WHATSAPP_NUMBER = '5491149712224';

export function waUrl(text: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

export const PROVINCIAS = [
  'Buenos Aires', 'Catamarca', 'Chaco', 'Chubut',
  'Ciudad Autónoma de Buenos Aires', 'Córdoba', 'Corrientes',
  'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja',
  'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta',
  'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe',
  'Santiago del Estero', 'Tierra del Fuego', 'Tucumán',
] as const;

export function formatARS(n: number): string {
  return '$' + n.toLocaleString('es-AR');
}
