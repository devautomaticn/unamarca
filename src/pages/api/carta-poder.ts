// POST /api/carta-poder — recibe la carta poder firmada en /carta-poder y la
// manda por email al estudio, con el PDF adjunto.
//
// Es el camino corto para rehacer un poder mal emitido (tipo de marca
// equivocado, un dato del titular con un error) sin que el cliente vuelva a
// pasar por el checkout. No toca D1 ni el portal: el pedido ya existe, lo único
// que falta es el papel firmado de nuevo.
//
// El PDF llega generado desde el navegador, igual que en el checkout: el plan
// free de Pages no tiene CPU para pdf-lib (error 1102).
import type { APIRoute } from 'astro';
import { runtime } from '@/lib/server/runtime';

// Ruta de servidor: se ejecuta por request, no se prerenderiza.
export const prerender = false;

const FROM = 'UnaMarca <formulario@vigilante.unamarca.com.ar>';
const ADMIN_EMAIL = 'mike@automaticnation.com';

/** Cap del cuerpo. Una carta poder firmada pesa ~60 KB en base64; 3 MB deja
 *  margen de sobra y frena un POST hecho a mano contra el endpoint abierto. */
const MAX_BODY = 3_000_000;

interface Body {
  pdfBase64?: string;
  /** Ref del pedido original, si el link lo traía */
  ref?: string;
  /** Email del cliente: va como reply_to, no se le manda copia desde acá */
  email?: string;
  /** Por qué se rehizo el poder (lo escribe quien arma el link, no el cliente) */
  motivo?: string;
  titular?: {
    nombreApellido?: string;
    documento?: string;
    cuit?: string;
    domicilio?: string;
  };
  marcas?: { nombre?: string; tipo?: string; clases?: number[] }[];
  fecha?: string;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** "“MARCA” (mixta · clases 9 y 25)" — una línea por marca */
function marcasHTML(marcas: NonNullable<Body['marcas']>): string {
  const filas = marcas.map(m => {
    const clases = (m.clases ?? []).join(', ') || '—';
    // La figurativa no lleva denominación ante el INPI: el nombre es nuestra
    // referencia interna, y el poder tampoco la nombra.
    const titulo = m.tipo === 'figurativa'
      ? `Figurativa · ref. interna “${esc(String(m.nombre ?? '').toUpperCase())}”`
      : `“${esc(String(m.nombre ?? '').toUpperCase())}”`;
    return `<li style="margin:0 0 6px">
      <b style="color:#0B1D3A">${titulo}</b>
      <span style="color:#64748b"> — ${esc(m.tipo ?? 'denominativa')} · ${(m.clases?.length ?? 0) === 1 ? 'clase' : 'clases'} ${esc(clases)}</span>
    </li>`;
  }).join('');
  return `<ul style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.6">${filas}</ul>`;
}

function emailHTML(b: Body, adjunto: boolean): string {
  const t = b.titular ?? {};
  const row = (k: string, v: unknown) =>
    `<tr><td style="padding:5px 0;color:#64748b;font-size:13px;width:34%;vertical-align:top">${esc(k)}</td><td style="padding:5px 0;color:#0f172a;font-size:13px;vertical-align:top">${esc(v || '—')}</td></tr>`;

  return `<!DOCTYPE html><html><body style="margin:0;padding:24px 16px;background:#f1f5f9;font-family:Inter,-apple-system,sans-serif">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;padding:36px;border:1px solid #e2e8f0">
    <p style="margin:0 0 6px;color:#2563EB;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">UnaMarca · Carta poder</p>
    <h1 style="margin:0 0 4px;color:#0B1D3A;font-size:20px;font-weight:800">Carta poder firmada${b.ref ? `: ${esc(b.ref)}` : ''}</h1>
    <p style="margin:0 0 18px;color:#64748b;font-size:13px">
      Firmada en /carta-poder el ${esc(b.fecha)}${b.ref ? ` · pedido ${esc(b.ref)}` : ' · sin pedido asociado'}
    </p>

    ${b.motivo ? `<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:10px;padding:14px 18px;margin-bottom:18px">
      <p style="margin:0 0 4px;color:#92400e;font-size:13px;font-weight:800">Motivo del reenvío</p>
      <p style="margin:0;color:#92400e;font-size:13px;line-height:1.6">${esc(b.motivo)}</p>
    </div>` : ''}

    <p style="margin:0 0 8px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Marcas del poder</p>
    ${marcasHTML(b.marcas ?? [])}

    <p style="margin:0 0 8px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Titular</p>
    <table style="width:100%;border-collapse:collapse">
      ${row('Nombre', t.nombreApellido)}
      ${row('Documento', t.documento)}
      ${row('CUIT/CUIL', t.cuit)}
      ${row('Domicilio', t.domicilio)}
      ${row('Email', b.email)}
    </table>

    <p style="margin:18px 0 0;color:${adjunto ? '#94a3b8' : '#b91c1c'};font-size:12px;line-height:1.6">
      ${adjunto
        ? '📎 Carta poder firmada adjunta en PDF. Reemplaza a la que se hubiera emitido antes para este pedido.'
        : '⚠ El navegador no pudo generar el PDF: llegaron los datos pero NO el documento firmado. Hay que rehacerlo.'}
    </p>
  </div>
</body></html>`;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const { env } = runtime<{ RESEND_API_KEY?: string }>(locals);
  if (!env.RESEND_API_KEY) return json({ error: 'Email no configurado en este entorno' }, 500);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: 'Payload demasiado grande' }, 413);

  let body: Body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400);
  }

  const marcas = Array.isArray(body.marcas) ? body.marcas : [];
  const nombre = String(body.titular?.nombreApellido ?? '').trim();
  if (!nombre || marcas.length === 0) {
    return json({ error: 'Faltan el titular o las marcas' }, 400);
  }

  const pdf = typeof body.pdfBase64 === 'string' ? body.pdfBase64 : '';
  // Sin PDF el email sale igual, marcado: perder los datos de un poder que la
  // persona ya firmó es peor que mandar un aviso de que hay que rehacerlo.
  const nombreArchivo = `carta-poder-${(body.ref || nombre.replace(/\s+/g, '-')).slice(0, 60)}.pdf`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: [ADMIN_EMAIL],
        reply_to: String(body.email ?? '').trim() || undefined,
        subject: `Carta poder firmada: ${marcas.map(m => String(m.nombre ?? '').toUpperCase()).filter(Boolean).join(' + ') || nombre}${body.ref ? ` (${body.ref})` : ''}`,
        html: emailHTML(body, !!pdf),
        attachments: pdf ? [{ filename: nombreArchivo, content: pdf }] : undefined,
      }),
    });
    if (!res.ok) {
      console.error('Resend error en /api/carta-poder:', res.status, await res.text());
      return json({ error: 'No se pudo enviar el email' }, 502);
    }
  } catch (e) {
    console.error('Error de red enviando la carta poder:', e);
    return json({ error: 'Error de red' }, 502);
  }

  return json({ ok: true });
};
