// Emails de confirmación de solicitud (cliente + admin) vía Resend,
// con la carta poder firmada adjunta en PDF.

const FROM = 'UnaMarca <formulario@vigilante.unamarca.com.ar>';
const ADMIN_EMAIL = 'mike@automaticnation.com';

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface OrderEmailData {
  ref: string;
  status: string;
  marca: string;
  clase: number | null;
  clientEmail: string;
  garantia: boolean;
  total: number;
  titularResumen: [string, string][];
}

function clientHTML(d: OrderEmailData): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px 16px;background:#f1f5f9;font-family:Inter,-apple-system,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:36px;border:1px solid #e2e8f0">
    <p style="margin:0 0 6px;color:#2563EB;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">UnaMarca</p>
    <h1 style="margin:0 0 14px;color:#0B1D3A;font-size:21px;font-weight:800">¡Recibimos tu solicitud!</h1>
    <p style="margin:0 0 6px;color:#475569;font-size:14px;line-height:1.6">
      Tu solicitud de registro de la marca <b>“${esc(d.marca.toUpperCase())}”</b>${d.clase ? ` (clase ${d.clase})` : ''} fue recibida correctamente.
    </p>
    <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.6">
      N° de referencia: <b style="color:#0B1D3A">${esc(d.ref)}</b>
    </p>
    <div style="background:#f8faff;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:18px">
      <p style="margin:0;color:#475569;font-size:13px;line-height:1.65">
        📎 Adjuntamos la <b>carta poder firmada</b> que nos autoriza a gestionar el trámite.<br>
        Presentaremos tu solicitud ante el INPI dentro de las próximas <b>48 horas hábiles</b>
        y te enviaremos todas las novedades del trámite a este email.
      </p>
    </div>
    <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6">
      ¿Dudas? Respondé este email o escribinos por WhatsApp.
    </p>
  </div>
</body></html>`;
}

function adminHTML(d: OrderEmailData): string {
  const rows = d.titularResumen
    .map(([k, v]) => `<tr><td style="padding:5px 0;color:#64748b;font-size:13px;width:40%">${esc(k)}</td><td style="padding:5px 0;color:#0f172a;font-size:13px;font-weight:500">${esc(v)}</td></tr>`)
    .join('');
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px 16px;background:#f1f5f9;font-family:Inter,-apple-system,sans-serif">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;padding:36px;border:1px solid #e2e8f0">
    <p style="margin:0 0 6px;color:#2563EB;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">UnaMarca · Self-Checkout</p>
    <h1 style="margin:0 0 4px;color:#0B1D3A;font-size:20px;font-weight:800">Solicitud completada: “${esc(d.marca.toUpperCase())}”</h1>
    <p style="margin:0 0 16px;color:#64748b;font-size:13px">${esc(d.ref)} · Clase ${d.clase ?? '—'} · ${d.garantia ? 'Con Garantía' : 'Sin garantía'} · Total $${d.total.toLocaleString('es-AR')}</p>
    <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:${d.status === 'paid' ? '#16a34a' : '#b45309'}">
      Estado de pago: ${esc(d.status)}
    </p>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    <p style="margin:16px 0 0;color:#94a3b8;font-size:12px">Carta poder firmada adjunta. Datos completos en D1 (orders / ${esc(d.ref)}).</p>
  </div>
</body></html>`;
}

// ── Email al admin cuando MP notifica un pago (cualquier estado) ──
// Avisa que hubo movimiento de pago aunque el cliente nunca complete
// los datos del titular (ese caso dispara el email "Solicitud completada").

const STATUS_INFO: Record<string, { label: string; color: string }> = {
  paid: { label: 'Aprobado', color: '#16a34a' },
  payment_pending: { label: 'Pendiente', color: '#b45309' },
  rejected: { label: 'Rechazado', color: '#dc2626' },
  refunded: { label: 'Devuelto', color: '#dc2626' },
};

export interface PaymentEmailData {
  ref: string;
  status: string;    // estado interno: paid | payment_pending | rejected | refunded
  mpStatus: string;  // estado crudo de MP (approved, in_process, ...)
  marca: string;
  clase: number | null;
  total: number;
  clientEmail: string;
  whatsapp: string;
  completed: boolean; // ya envió titular + firma
}

function paymentHTML(d: PaymentEmailData): string {
  const info = STATUS_INFO[d.status] ?? { label: d.status, color: '#64748b' };
  const nextStep = d.completed
    ? 'El cliente <b>ya completó</b> los datos del titular: este pago corresponde a una solicitud con email "Solicitud completada".'
    : 'El cliente <b>todavía no completó</b> los datos del titular. Si no llega el email "Solicitud completada", conviene contactarlo.';
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px 16px;background:#f1f5f9;font-family:Inter,-apple-system,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:36px;border:1px solid #e2e8f0">
    <p style="margin:0 0 6px;color:#2563EB;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">UnaMarca · Self-Checkout</p>
    <h1 style="margin:0 0 4px;color:#0B1D3A;font-size:20px;font-weight:800">Pago ${esc(info.label.toLowerCase())}: “${esc(d.marca.toUpperCase() || '(sin marca)')}”</h1>
    <p style="margin:0 0 16px;color:#64748b;font-size:13px">${esc(d.ref)} · Clase ${d.clase ?? '—'} · Total $${d.total.toLocaleString('es-AR')}</p>
    <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:${info.color}">
      Estado: ${esc(info.label)} (MP: ${esc(d.mpStatus)})
    </p>
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:5px 0;color:#64748b;font-size:13px;width:40%">Email</td><td style="padding:5px 0;color:#0f172a;font-size:13px;font-weight:500">${esc(d.clientEmail || '—')}</td></tr>
      <tr><td style="padding:5px 0;color:#64748b;font-size:13px">WhatsApp</td><td style="padding:5px 0;color:#0f172a;font-size:13px;font-weight:500">${esc(d.whatsapp || '—')}</td></tr>
    </table>
    <p style="margin:16px 0 0;color:#475569;font-size:13px;line-height:1.6">${nextStep}</p>
  </div>
</body></html>`;
}

export async function sendPaymentEmail(apiKey: string, d: PaymentEmailData): Promise<void> {
  const info = STATUS_INFO[d.status] ?? { label: d.status, color: '' };
  await sendResend(apiKey, {
    from: FROM,
    to: [ADMIN_EMAIL],
    reply_to: d.clientEmail || undefined,
    subject: `Pago ${info.label.toLowerCase()}: ${d.marca.toUpperCase() || '(sin marca)'} (${d.ref})`,
    html: paymentHTML(d),
  });
}

async function sendResend(apiKey: string, payload: unknown): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

export async function sendOrderEmails(
  apiKey: string,
  d: OrderEmailData,
  pdfBase64: string | null,
): Promise<void> {
  // Sin PDF (falla en el navegador) los emails salen igual, sin adjunto
  const attachments = pdfBase64
    ? [{ filename: `carta-poder-${d.ref}.pdf`, content: pdfBase64 }]
    : undefined;

  // Admin siempre; cliente solo si dejó email
  const sends: Promise<void>[] = [
    sendResend(apiKey, {
      from: FROM,
      to: [ADMIN_EMAIL],
      reply_to: d.clientEmail || undefined,
      subject: `Solicitud completada: ${d.marca.toUpperCase() || '(sin marca)'} (${d.ref})`,
      html: adminHTML(d),
      attachments,
    }),
  ];
  if (d.clientEmail) {
    sends.push(sendResend(apiKey, {
      from: FROM,
      to: [d.clientEmail],
      subject: `Recibimos tu solicitud de registro de marca — ${d.ref}`,
      html: clientHTML(d),
      attachments,
    }));
  }
  await Promise.all(sends);
}
