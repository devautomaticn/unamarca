// Proxy same-origin hacia las APIs públicas de Vigilante.
//
// El motor y los datos viven en el VPS de Vigilante (vigilante.com.ar), que no
// manda cabeceras CORS y además rechaza con 403 cualquier request sin
// `X-Requested-With`. Estas Pages Functions permiten que el sitio estático las
// llame same-origin: inyectan la cabecera del lado del servidor y normalizan
// los errores que llegan sin JSON.
//
// OJO CON EL HOST: tiene que ser `vigilante.com.ar`, el final. El viejo
// `vigilante.unamarca.com.ar` responde 301 en estas rutas, y un 301 sobre un
// POST lo convierte en GET al seguirlo, así que el upstream contesta 405 y la
// llamada muere en silencio. Eso rompió /verificar-marca (commit 4f32c20).

export const VIGILANTE = 'https://vigilante.com.ar';

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Mensaje para el usuario según lo que devolvió el upstream. */
function mensaje(status: number): string {
  if (status === 429) return 'Hiciste muchas consultas en poco tiempo. Esperá un momento y volvé a intentar.';
  return 'No pudimos completar la consulta. Intentá de nuevo en unos minutos.';
}

/**
 * Reenvía una request a Vigilante y devuelve su JSON tal cual.
 * `path` va sin host, con la barra inicial. `body` sólo en POST.
 */
export async function proxyVigilante(
  path: string,
  init: { method: 'GET' | 'POST'; body?: string }
): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(`${VIGILANTE}${path}`, {
      method: init.method,
      headers: {
        'Accept': 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        // Sin esto el upstream corta con 403.
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: init.body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return json({ error: 'No pudimos conectar con el servicio. Intentá de nuevo en unos minutos.' }, 502);
  }

  // Camino feliz y errores de validación: el upstream contesta JSON, pasa igual.
  if ((upstream.headers.get('content-type') || '').includes('application/json')) {
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Respuestas sin JSON (403 por falta de cabecera, 429, 500 en HTML) → normalizar.
  return json({ error: mensaje(upstream.status) }, upstream.status === 200 ? 502 : upstream.status);
}
