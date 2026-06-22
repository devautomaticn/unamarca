// Same-origin proxy for the Relevamiento search endpoint.
// The real engine + data live on the Vigilante VPS (vigilante.unamarca.com.ar),
// which has no CORS headers and hard-requires the X-Requested-With header.
// This Pages Function lets the static site call it same-origin: it injects the
// required header server-side and normalizes non-JSON upstream errors (403/429/500).
// See docs/spec_relevamiento.html §11.

const UPSTREAM = 'https://vigilante.unamarca.com.ar/api/relevamiento/search';

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestPost: PagesFunction = async (context) => {
  let bodyText: string;
  try {
    bodyText = await context.request.text();
  } catch {
    return json({ error: 'Cuerpo de solicitud inválido.' }, 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // The upstream aborts with 403 unless this header is present.
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: bodyText,
    });
  } catch {
    return json({ error: 'No pudimos conectar con el buscador. Intentá de nuevo en unos minutos.' }, 502);
  }

  const contentType = upstream.headers.get('content-type') || '';

  // Happy path + validation errors: upstream replies JSON, pass it through verbatim.
  if (contentType.includes('application/json')) {
    const data = await upstream.text();
    return new Response(data, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Non-JSON responses (403 missing-header, 429 rate-limit, 500 HTML) → normalize.
  const message =
    upstream.status === 429
      ? 'Hiciste muchas búsquedas en poco tiempo. Esperá un momento y volvé a intentar.'
      : 'No pudimos completar la búsqueda. Intentá de nuevo en unos minutos.';
  return json({ error: message }, upstream.status === 200 ? 502 : upstream.status);
};
