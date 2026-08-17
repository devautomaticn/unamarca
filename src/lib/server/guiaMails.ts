// Emails de la guía DIY, vía Resend.
//
// Son dos, y los dos llevan copia oculta a Mike:
//  · al cliente, cuando se acredita el pago  → su link, de respaldo del chat
//  · a Mike, cuando el agente acredita una transferencia → para cruzar contra
//    el banco, que es el único control real sobre un comprobante falso
//
// El FROM es el mismo dominio verificado en Resend que usa el resto del sitio.
// NO cambiarlo por `vigilante.com.ar`: es un dominio de envío, no una URL, y
// tocarlo rompe los emails aunque el sitio siga andando.

import { PRICING } from '@/lib/checkout/constants';

const FROM = 'UnaMarca <formulario@vigilante.unamarca.com.ar>';
const ADMIN_EMAIL = 'mike@automaticnation.com';

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendResend(apiKey: string, payload: unknown): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

const WRAP = (cuerpo: string) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;color:#0F172A;line-height:1.65">
  ${cuerpo}
  <p style="margin-top:32px;padding-top:16px;border-top:1px solid #E2E8F0;font-size:12px;color:#64748B">
    UnaMarca · Registro de marcas en Argentina
  </p>
</div>`;

/** Al cliente, cuando el pago se acredita (por Mercado Pago o transferencia). */
export async function sendGuiaEntrega(
  apiKey: string,
  d: { email: string; ref: string; guiaUrl: string },
): Promise<void> {
  await sendResend(apiKey, {
    from: FROM,
    to: [d.email],
    // Copia oculta: así Mike ve cada entrega sin que el cliente vea su mail.
    bcc: [ADMIN_EMAIL],
    subject: 'Tu guía para registrar tu marca',
    html: WRAP(`
      <h2 style="font-size:20px;margin:0 0 12px">Ya tenés acceso a tu guía</h2>
      <p style="margin:0 0 20px">
        Este es tu link personal. No vence: entrá cuando quieras, desde donde quieras.
      </p>
      <p style="margin:0 0 24px">
        <a href="${esc(d.guiaUrl)}"
           style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:12px 24px;border-radius:100px;font-weight:700">
          Abrir mi guía
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#64748B">
        Si el botón no funciona, copiá esta dirección:<br>
        <span style="word-break:break-all">${esc(d.guiaUrl)}</span>
      </p>
      <p style="margin:20px 0 0;font-size:13px;color:#64748B">
        Guardá este mail: es tu respaldo si perdés el chat. Referencia ${esc(d.ref)}.
      </p>
    `),
  });
}

/** A Mike, cuando el agente da por válida una transferencia.
 *
 *  Este mail ES el control: una captura de pantalla se falsifica en dos
 *  minutos y el agente no puede detectarlo. Lo que llega acá hay que poder
 *  cruzarlo contra el banco, por eso va lo que el agente dijo haber visto. */
export async function sendGuiaAvisoTransferencia(
  apiKey: string,
  d: { ref: string; email: string; monto: number | null; observado: string | null; guiaUrl: string },
): Promise<void> {
  await sendResend(apiKey, {
    from: FROM,
    to: [ADMIN_EMAIL],
    subject: `Guía activada por transferencia: ${d.ref}`,
    html: WRAP(`
      <h2 style="font-size:18px;margin:0 0 4px">Guía activada por transferencia</h2>
      <p style="margin:0 0 16px;color:#64748B;font-size:14px">
        El agente dio por válido el comprobante. Conviene cruzarlo contra el banco.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#64748B">Referencia</td><td style="padding:6px 0"><strong>${esc(d.ref)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#64748B">Cliente</td><td style="padding:6px 0">${esc(d.email)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748B">Monto declarado</td><td style="padding:6px 0">${d.monto ? `$${d.monto.toLocaleString('es-AR')}` : '—'} <span style="color:#64748B">(esperado $${PRICING.guia.toLocaleString('es-AR')})</span></td></tr>
        <tr><td style="padding:6px 0;color:#64748B;vertical-align:top">Lo que vio el agente</td><td style="padding:6px 0">${esc(d.observado || '—')}</td></tr>
      </table>
      <p style="margin:20px 0 0;font-size:13px;color:#64748B">
        Si no aparece en tu cuenta, se da de baja con:<br>
        <code style="word-break:break-all">POST /api/guia/pedido/${esc(d.ref)}/revocar</code>
      </p>
    `),
  });
}
