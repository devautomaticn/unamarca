// Lado navegador del origen del pedido (ver src/lib/origen.ts).
//
// Corre en todas las páginas. Si la visita trae un origen reconocible —un clic
// en un anuncio, un UTM, un referrer de afuera— se lo avisa al servidor, que es
// quien escribe la cookie. Una visita directa o una navegación interna no
// manda nada: la mayoría de las páginas vistas no le cuestan un request al
// Worker, y un bot que recorre el sitio tampoco.
import { esSignificativo, sanitizarToque, toqueCrudo, type Toque } from './origen';
import {
  WA_CANAL_COOKIE, WA_CANAL_EMITIR, WA_CANAL_PRUEBA_KEY, esWaCanal, hrefConCanal, type WaCanal,
} from './waCanal';

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

// ── Canal en los mensajes de WhatsApp (ver src/lib/waCanal.ts) ──────────────

/** El canal de esta visita, recordado por si la cookie no llega a tiempo o el
 *  navegador la bloquea. Vive lo que dura la pestaña. */
const CANAL_KEY = 'um-canal';

function emisionPrendida(): boolean {
  if (WA_CANAL_EMITIR) return true;
  try {
    return localStorage.getItem(WA_CANAL_PRUEBA_KEY) === '1';
  } catch {
    return false;
  }
}

function canalDeCookie(): string {
  for (const parte of document.cookie.split(';')) {
    const [k, v] = parte.trim().split('=');
    if (k === WA_CANAL_COOKIE) return v ?? '';
  }
  return '';
}

/**
 * Por qué canal llegó este visitante, o `null`. Mira tres lugares, en orden:
 * la URL (quien aterriza desde el anuncio y toca el botón enseguida todavía no
 * tiene cookie), la pestaña y la cookie que dejó el servidor.
 */
function canalDelVisitante(toque: Toque | null): WaCanal | null {
  if (toque && esWaCanal(toque.canal)) {
    try { sessionStorage.setItem(CANAL_KEY, toque.canal); } catch { /* ignorar */ }
    return toque.canal;
  }
  let recordado = '';
  try { recordado = sessionStorage.getItem(CANAL_KEY) || ''; } catch { /* ignorar */ }
  if (esWaCanal(recordado)) return recordado;
  const cookie = canalDeCookie();
  return esWaCanal(cookie) ? cookie : null;
}

/**
 * Pasa los links de WhatsApp a la variante del canal, en el momento del clic.
 *
 * Se hace con un listener en el documento y no recorriendo los links al cargar
 * porque el checkout y el verificador arman los suyos después, con datos que
 * escribe el usuario. `pointerdown` además de `click` para que también valga
 * abrir en otra pestaña o copiar el link.
 */
function emitirCanal(canal: WaCanal): void {
  const ajustar = (e: Event) => {
    try {
      const a = (e.target as Element | null)?.closest?.('a[href*="wa.me/"]') as HTMLAnchorElement | null;
      if (!a) return;
      const href = hrefConCanal(a.href, canal);
      if (href !== a.href) a.href = href;
    } catch { /* un link sin variante sale con el mensaje base */ }
  };
  document.addEventListener('pointerdown', ajustar, true);
  document.addEventListener('click', ajustar, true);
}

export function registrarOrigen(): void {
  try {
    const crudo = toqueCrudo(location.href, document.referrer);
    const toque = sanitizarToque(crudo, { ts: '', hostPropio: location.hostname });

    if (emisionPrendida()) {
      const canal = canalDelVisitante(toque);
      if (canal) emitirCanal(canal);
    }

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
