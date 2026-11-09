// Visitas al link de /registrar que arma el agente de WhatsApp (Sofía).
//
// Para qué: el pedido recién existe en D1 cuando el cliente aprieta pagar
// (paso 4). Todo lo de antes —si abrió el link, hasta qué paso llegó— no
// quedaba en ningún lado, y en el CRM sólo se ve «le mandamos el link» y
// «armó (o no) el pedido». Desde octubre de 2026 dos de cada tres que reciben
// el link no arman pedido, y sin esto no se puede saber si no lo abren o si
// lo abren y se van en algún paso.
//
// Sólo se registran las visitas que llegan con `?tel=` (el deep link que arma
// el agente lleva siempre el teléfono): ése es el dato que las cruza con la
// charla del CRM. El resto del tráfico de /registrar no se mira acá; para eso
// está el funnel de GA4.
//
// Este módulo es puro (sin D1 ni Request): valida lo que manda el navegador.

/** Pasos del wizard, en el orden en que se recorren. `done` = terminó. */
export const PASOS_VISITA = ['1', '2', '3', '4', '5', '6', '7', 'done'] as const;
export type PasoVisita = (typeof PASOS_VISITA)[number];

/** El paso como número, para guardar el más avanzado con MAX(). */
export function ordenPaso(paso: PasoVisita): number {
  return paso === 'done' ? 8 : parseInt(paso, 10);
}

export interface Visita {
  sid: string;
  paso: PasoVisita;
  /** Últimos 10 dígitos del WhatsApp del link. Sólo en el primer aviso. */
  tel: string | null;
  /** Ref del pedido, cuando el paso de pago lo creó. */
  ref: string | null;
}

const SID = /^[a-z0-9]{16,40}$/;
const REF = /^UM-\d{8}-[A-Z0-9]{4,12}$/;

/** Lo que manda el navegador → una visita válida, o null. Nada de lo que no
 *  esté acá se guarda. */
export function sanitizarVisita(raw: unknown): Visita | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const sid = typeof r.sid === 'string' ? r.sid : '';
  if (!SID.test(sid)) return null;
  const paso = String(r.paso ?? '') as PasoVisita;
  if (!PASOS_VISITA.includes(paso)) return null;
  // Igual que el CRM: se cruza por los últimos 10 dígitos (sin 54 ni 9).
  const digitos = typeof r.tel === 'string' ? r.tel.replace(/\D/g, '') : '';
  const tel = digitos.length >= 8 && digitos.length <= 15 ? digitos.slice(-10) : null;
  const ref = typeof r.ref === 'string' && REF.test(r.ref) ? r.ref : null;
  return { sid, paso, tel, ref };
}
