// Config del self-checkout — precios, apoderado y contacto.
// Un solo lugar para actualizar valores (inflación, UMAPI, cambios de domicilio).

export const PRICING = {
  /** Honorarios base del registro */
  honorarios: 40_000,
  /** Upsell: Garantía de Devolución (si el INPI deniega, se devuelven los honorarios) */
  garantia: 7_000,
  /** Arancel INPI: solicitud de registro, 1 clase (100 UMAPIS, julio 2026) */
  arancelInpi: 38_994,
  /** Mes de referencia del valor UMAPI mostrado */
  arancelVigencia: 'julio 2026',
  /** Precio de lista de la vigilancia anual (se muestra tachado → gratis).
   *  TODO: igualar al precio real standalone de vigilante.unamarca.com.ar */
  vigilanciaLista: 30_000,
} as const;

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
