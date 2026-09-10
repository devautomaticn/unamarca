// Reemplazar en el portal la carta poder de un pedido ya cargado.
//
// Lo usa `/api/carta-poder`, el camino corto para rehacer un poder que salió
// con un dato mal (el nombre, el documento, el domicilio, la fecha). Hasta
// ahora ese camino no tocaba nada: producía el PDF firmado y lo mandaba por
// email, y el poder viejo seguía colgado del trámite en el portal — que es
// justamente el que hace falta para presentar ante el INPI.
//
// ⚠️ ESTO ESCRIBE. El ref del pedido ya era la llave de lectura, así que no hay
// una llave nueva, pero leer y escribir no son lo mismo: acá se reemplaza un
// documento legal de un trámite que puede estar por presentarse. Por eso
//   1) sin `ref` no se hace nada (es el default del endpoint abierto),
//   2) sólo se toca un pedido de UN titular (ver abajo), y
//   3) todo lo que pasa se cuenta en el email al estudio, incluida la
//      advertencia `poder_reemplazado` que devuelve el portal.
import {
  type CheckoutEnv, guardarPoderFirmado, pdfDesdeBase64, titularesDesdeCompletion,
} from './checkout';
import {
  reemplazarPoderVigilante, type Advertencia, type VigilanteEnv,
} from './vigilante';

export interface ReemplazoPoderEnv extends VigilanteEnv {
  DB?: CheckoutEnv['DB'];
  LOGOS?: CheckoutEnv['LOGOS'];
}

export interface ReemplazoPoder {
  /** false = ni se intentó; `motivo` dice por qué. No es un error: el caso
   *  normal es un poder firmado en /carta-poder sin `ref`. */
  intentado: boolean;
  motivo?: string;
  /** Trámites cuyo poder quedó reemplazado */
  hechos: number[];
  fallados: { tramite: number; error: string }[];
  /** Lo que devolvió el portal y nadie más ve: `poder_reemplazado` y
   *  `poder_cambiado_despues_de_ingresar`. */
  advertencias: Advertencia[];
  /** La copia nueva quedó archivada en R2, pisando a la anterior */
  archivado: boolean;
}

/**
 * Reemplaza el poder de todos los trámites del pedido `ref` por el PDF que
 * acaba de firmar el cliente.
 *
 * Nunca lanza: para cuando esto corre, el poder firmado ya salió por email, que
 * es lo único irrecuperable.
 */
export async function reemplazarPoderDelPedido(
  env: ReemplazoPoderEnv,
  d: { ref: string; pdfBase64: string; filename: string },
): Promise<ReemplazoPoder> {
  const vacio: ReemplazoPoder = {
    intentado: false, hechos: [], fallados: [], advertencias: [], archivado: false,
  };
  const no = (motivo: string): ReemplazoPoder => ({ ...vacio, motivo });

  if (!env.DB) return no('No hay base de datos en este entorno.');

  const bytes = pdfDesdeBase64(d.pdfBase64);
  // Sin PDF no hay nada que reemplazar, y un cuerpo vacío el portal lo rechaza
  // con 400 a propósito: desadjuntar no es un caso de uso.
  if (!bytes) {
    return no('El PDF firmado no llegó, o llegó cortado: no hay nada que subir al portal.');
  }

  let row: { payload: string; completion: string | null; vigilante: string | null } | null = null;
  try {
    row = await env.DB.prepare(
      'SELECT payload, completion, vigilante FROM orders WHERE ref = ?'
    ).bind(d.ref).first();
  } catch (e) {
    console.error(`[${d.ref}] no se pudo leer el pedido para reemplazar el poder:`, e);
    return no('No se pudo leer el pedido en la base.');
  }
  if (!row) return no(`El pedido ${d.ref} no existe: el poder no se subió a ningún trámite.`);

  const completion = row.completion ? JSON.parse(row.completion) : {};

  // /carta-poder es de UN solo otorgante. El poder de un pedido con cotitulares
  // dice "nosotros autorizamos" y lleva un pie de firma por cabeza: pisar ese
  // documento con uno de un solo titular cambiaría el poder por otro distinto.
  // Esos se rehacen por la cadena de firmas, no desde acá.
  const titulares = titularesDesdeCompletion(completion);
  if (titulares.length > 1) {
    return no(
      `El pedido tiene ${titulares.length} titulares: el poder del portal NO se tocó.`
      + ' Un poder con cotitulares lleva un pie de firma por cabeza y no se rehace'
      + ' desde /carta-poder — hay que rehacer la cadena de firmas.',
    );
  }

  let alta: any = null;
  try { alta = row.vigilante ? JSON.parse(row.vigilante) : null; } catch { /* ignorar */ }
  const tramites: number[] = Array.isArray(alta?.tramites) ? alta.tramites : [];
  if (!tramites.length) {
    return no('El pedido no tiene trámites cargados en el portal: no hay dónde reemplazar el poder.');
  }

  // La copia archivada tiene que quedar igual a la que se subió: si el alta se
  // reintenta dentro de la ventana de idempotencia, manda esta.
  const archivado = !!await guardarPoderFirmado(env, d.ref, d.pdfBase64);

  const res: ReemplazoPoder = {
    intentado: true, hechos: [], fallados: [], advertencias: [], archivado,
  };
  // Un trámite por clase: el mismo archivo va a todos los del pedido. Todos
  // devuelven la misma advertencia (es el mismo poder y el mismo reemplazo), así
  // que se listan una sola vez: repetida por trámite es ruido, y el bloque del
  // email ya dice cuáles se tocaron.
  const vistas = new Set<string>();
  for (const tramite of tramites) {
    const r = await reemplazarPoderVigilante(env, { tramite, filename: d.filename, bytes });
    if (r.ok) res.hechos.push(tramite);
    else res.fallados.push({ tramite, error: r.error || `HTTP ${r.status}` });
    for (const a of r.advertencias ?? []) {
      const clave = `${a.codigo}|${a.mensaje}|${a.marca ?? ''}`;
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      res.advertencias.push(a);
    }
  }

  if (res.fallados.length) {
    console.error(`[${d.ref}] reemplazo del poder con fallas:`, JSON.stringify(res.fallados));
  }
  if (res.advertencias.length) {
    console.warn(`[${d.ref}] advertencias del reemplazo:`, JSON.stringify(res.advertencias));
  }
  return res;
}
