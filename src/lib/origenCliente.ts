// Lado navegador del origen del pedido (ver src/lib/origen.ts).
//
// Corre en todas las páginas. Si la visita trae un origen reconocible —un clic
// en un anuncio, un UTM, un referrer de afuera— se lo avisa al servidor, que es
// quien escribe la cookie. Una visita directa o una navegación interna no
// manda nada: la mayoría de las páginas vistas no le cuestan un request al
// Worker, y un bot que recorre el sitio tampoco.
import { esSignificativo, sanitizarToque, toqueCrudo } from './origen';

/** Un aviso que no llegó (sin red, Worker caído) se reintenta en la página
 *  siguiente: para entonces la URL ya no tiene el gclid. */
const PENDIENTE_KEY = 'um-origen-pendiente';

function leerPendiente(): Record<string, string> | null {
  try {
    const raw = sessionStorage.getItem(PENDIENTE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function guardarPendiente(crudo: Record<string, string> | null): void {
  try {
    if (crudo) sessionStorage.setItem(PENDIENTE_KEY, JSON.stringify(crudo));
    else sessionStorage.removeItem(PENDIENTE_KEY);
  } catch { /* sin storage no hay reintento, y no pasa nada */ }
}

export function registrarOrigen(): void {
  try {
    const crudo = toqueCrudo(location.href, document.referrer);
    const toque = sanitizarToque(crudo, { ts: '', hostPropio: location.hostname });
    const envio = toque && esSignificativo(toque) ? crudo : leerPendiente();
    if (!envio) return;

    guardarPendiente(envio);
    fetch('/api/origen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envio),
      // Quien llega por un anuncio suele tocar el botón enseguida: el aviso
      // tiene que sobrevivir a que la página se vaya.
      keepalive: true,
    }).then(res => {
      if (res.ok) guardarPendiente(null);
    }).catch(() => { /* queda pendiente para la próxima página */ });
  } catch { /* la atribución nunca rompe una página */ }
}
