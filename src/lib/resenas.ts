// Reseñas de clientes. Los datos salen de `src/data/resenas.json`, que regenera
// `scripts/actualizar-resenas.mjs` desde el portal Vigilante todos los días
// (workflow `resenas`). Acá no se escribe ninguna reseña a mano.
import crudo from '../data/resenas.json';

export interface MarcaResena {
  denominacion: string;
  /** Actas del INPI, 7 dígitos. Una marca en varias clases trae varias. */
  actas: string[];
}

export interface Resena {
  id: number;
  estrellas: number;
  texto: string;
  /** AAAA-MM-DD, el día que el cliente la dejó */
  fecha: string;
  /** «Nombre I.»; null si el portal no la puede armar sin adivinar */
  firma: string | null;
  marcas: MarcaResena[];
}

export const RESENAS: Resena[] = (crudo as { items: Resena[] }).items;

/** Lo mismo que linkea /verificar-marca: un redirect de Vigilante que abre la
 *  ficha del acta en el portal del INPI (que sólo acepta POST). */
export const actaUrl = (acta: string) => `https://vigilante.com.ar/inpi/acta/${acta}`;

/** Sin firma no se repite la marca: ya va debajo, con su acta. */
export const firmaDe = (r: Resena) => r.firma ?? 'Cliente de UnaMarca';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «noviembre de 2026». Se arma a mano y no con toLocaleDateString: un
 *  AAAA-MM-DD sin hora se parsea como UTC y en Buenos Aires retrocede un día. */
export const mesDe = (fecha: string) => {
  const [a, m] = fecha.split('-');
  return `${MESES[Number(m) - 1]} de ${a}`;
};

export const promedio = RESENAS.length
  ? RESENAS.reduce((s, r) => s + r.estrellas, 0) / RESENAS.length
  : 0;
