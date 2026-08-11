// Emails de confirmación de solicitud (cliente + admin) vía Resend,
// con la carta poder firmada adjunta en PDF.
import { TRANSFERENCIA, contarLineas } from '../../src/lib/checkout/constants';

const FROM = 'UnaMarca <formulario@vigilante.unamarca.com.ar>';
const ADMIN_EMAIL = 'mike@automaticnation.com';

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** "Clase 25" / "Clases 9, 25 y 35" / "Clase —" */
function clasesLabel(clases: number[]): string {
  if (clases.length === 0) return 'Clase —';
  if (clases.length === 1) return `Clase ${clases[0]}`;
  const nums = [...clases].sort((a, b) => a - b);
  const last = nums.pop();
  return `Clases ${nums.join(', ')} y ${last}`;
}

/** Una marca del pedido, tal como llega desde el payload de D1 */
export interface MarcaEmail {
  nombre: string;
  clases: number[];
  descripcion?: string;
  sitioWeb?: string;
}

/** "MARCA A" / "MARCA A + MARCA B" — para asuntos y títulos */
function marcasTitulo(marcas: MarcaEmail[]): string {
  const nombres = marcas.map(m => m.nombre.trim().toUpperCase()).filter(Boolean);
  return nombres.length ? nombres.join(' + ') : '(sin marca)';
}

/** "Clases 2 y 3" con una marca; "2 marcas · 4 clases" con varias */
function alcanceLabel(marcas: MarcaEmail[]): string {
  if (marcas.length <= 1) return clasesLabel(marcas[0]?.clases ?? []);
  const lineas = contarLineas(marcas);
  return `${marcas.length} marcas · ${lineas} ${lineas === 1 ? 'clase' : 'clases'}`;
}

interface OrderEmailData {
  ref: string;
  status: string;
  marcas: MarcaEmail[];
  clientEmail: string;
  garantia: boolean;
  total: number;
  titularResumen: [string, string][];
}

/** Bloque con los datos de la cuenta: solo para pedidos por transferencia, que
 *  llegan acá casi siempre sin la plata acreditada todavía. */
function transferBlockHTML(d: OrderEmailData): string {
  return `<div style="background:#f5f7ff;border:1px solid #c7d2fe;border-radius:10px;padding:16px 20px;margin-bottom:18px">
      <p style="margin:0 0 8px;color:#312e81;font-size:14px;font-weight:700">Falta tu transferencia de $${d.total.toLocaleString('es-AR')}</p>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:3px 0;color:#64748b;font-size:13px;width:38%">Alias</td><td style="padding:3px 0;color:#0f172a;font-size:13px;font-weight:700">${esc(TRANSFERENCIA.alias)}</td></tr>
        <tr><td style="padding:3px 0;color:#64748b;font-size:13px">Titular</td><td style="padding:3px 0;color:#0f172a;font-size:13px">${esc(TRANSFERENCIA.titular)}</td></tr>
        <tr><td style="padding:3px 0;color:#64748b;font-size:13px">Banco</td><td style="padding:3px 0;color:#0f172a;font-size:13px">${esc(TRANSFERENCIA.banco)}</td></tr>
        <tr><td style="padding:3px 0;color:#64748b;font-size:13px">N° de pedido</td><td style="padding:3px 0;color:#0f172a;font-size:13px;font-weight:700">${esc(d.ref)}</td></tr>
      </table>
      <p style="margin:10px 0 0;color:#475569;font-size:13px;line-height:1.6">
        Cuando transfieras, mandanos el comprobante por WhatsApp con tu N° de pedido.
      </p>
    </div>`;
}

/** Lista de marcas del email al cliente: una línea por marca con sus clases */
function marcasClientHTML(marcas: MarcaEmail[]): string {
  const filas = marcas.map(m => `<li style="margin:0 0 4px">
        <b style="color:#0B1D3A">“${esc(m.nombre.toUpperCase())}”</b>
        <span style="color:#64748b"> — ${esc(clasesLabel(m.clases).toLowerCase())}</span>
      </li>`).join('');
  return `<ul style="margin:0 0 14px;padding-left:20px;color:#475569;font-size:14px;line-height:1.6">${filas}</ul>`;
}

function clientHTML(d: OrderEmailData): string {
  const porTransferencia = d.status === 'pending_transfer';
  const varias = d.marcas.length > 1;
  const plazo = porTransferencia
    ? `Presentaremos ${varias ? 'tus solicitudes' : 'tu solicitud'} ante el INPI dentro de las <b>48 horas hábiles</b> desde que se acredite tu transferencia y te enviaremos todas las novedades del trámite a este email.`
    : `Presentaremos ${varias ? 'tus solicitudes' : 'tu solicitud'} ante el INPI dentro de las próximas <b>48 horas hábiles</b> y te enviaremos todas las novedades del trámite a este email.`;
  const intro = varias
    ? `<p style="margin:0 0 8px;color:#475569;font-size:14px;line-height:1.6">
      Recibimos correctamente tu solicitud de registro de estas <b>${d.marcas.length} marcas</b>:
    </p>${marcasClientHTML(d.marcas)}`
    : `<p style="margin:0 0 6px;color:#475569;font-size:14px;line-height:1.6">
      Tu solicitud de registro de la marca <b>“${esc(marcasTitulo(d.marcas))}”</b>${d.marcas[0]?.clases.length ? ` (${clasesLabel(d.marcas[0].clases).toLowerCase()})` : ''} fue recibida correctamente.
    </p>`;
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px 16px;background:#f1f5f9;font-family:Inter,-apple-system,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:36px;border:1px solid #e2e8f0">
    <p style="margin:0 0 6px;color:#2563EB;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">UnaMarca</p>
    <h1 style="margin:0 0 14px;color:#0B1D3A;font-size:21px;font-weight:800">¡Recibimos ${varias ? 'tus solicitudes' : 'tu solicitud'}!</h1>
    ${intro}
    <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.6">
      N° de referencia: <b style="color:#0B1D3A">${esc(d.ref)}</b>
    </p>
    ${porTransferencia ? transferBlockHTML(d) : ''}
    <div style="background:#f8faff;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:18px">
      <p style="margin:0;color:#475569;font-size:13px;line-height:1.65">
        📎 Adjuntamos la <b>carta poder firmada</b> que nos autoriza a gestionar el trámite.<br>
        ${plazo}
      </p>
    </div>
    <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6">
      ¿Dudas? Respondé este email o escribinos por WhatsApp.
    </p>
  </div>
</body></html>`;
}

/** Bloque operativo del email al admin: una tarjeta por marca con sus clases,
 *  su descripción y su sitio. Es lo que se carga en el portal del INPI, donde
 *  cada marca es una solicitud distinta. */
function marcasAdminHTML(marcas: MarcaEmail[]): string {
  return marcas.map((m, i) => `<div style="border:1px solid #e2e8f0;border-left:3px solid #2563EB;border-radius:10px;padding:14px 18px;margin-bottom:12px">
      <p style="margin:0 0 2px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Solicitud ${i + 1} de ${marcas.length}</p>
      <p style="margin:0 0 2px;color:#0B1D3A;font-size:16px;font-weight:800">“${esc(m.nombre.toUpperCase())}”</p>
      <p style="margin:0 0 10px;color:#2563EB;font-size:13px;font-weight:700">${esc(clasesLabel(m.clases))}</p>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:4px 0;color:#64748b;font-size:13px;width:34%;vertical-align:top">Descripción</td><td style="padding:4px 0;color:#0f172a;font-size:13px;line-height:1.55">${esc(m.descripcion || '—')}</td></tr>
        ${m.sitioWeb ? `<tr><td style="padding:4px 0;color:#64748b;font-size:13px;vertical-align:top">Página web</td><td style="padding:4px 0;color:#0f172a;font-size:13px">${esc(m.sitioWeb)}</td></tr>` : ''}
      </table>
    </div>`).join('');
}

function adminHTML(d: OrderEmailData): string {
  const rows = d.titularResumen
    .map(([k, v]) => `<tr><td style="padding:5px 0;color:#64748b;font-size:13px;width:40%">${esc(k)}</td><td style="padding:5px 0;color:#0f172a;font-size:13px;font-weight:500">${esc(v)}</td></tr>`)
    .join('');
  const lineas = contarLineas(d.marcas);
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px 16px;background:#f1f5f9;font-family:Inter,-apple-system,sans-serif">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;padding:36px;border:1px solid #e2e8f0">
    <p style="margin:0 0 6px;color:#2563EB;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">UnaMarca · Self-Checkout</p>
    <h1 style="margin:0 0 4px;color:#0B1D3A;font-size:20px;font-weight:800">Solicitud completada: “${esc(marcasTitulo(d.marcas))}”</h1>
    <p style="margin:0 0 16px;color:#64748b;font-size:13px">${esc(d.ref)} · ${esc(alcanceLabel(d.marcas))} · ${d.garantia ? 'Con Garantía' : 'Sin garantía'} · Total $${d.total.toLocaleString('es-AR')}</p>
    ${d.marcas.length > 1
      ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px 16px;margin-bottom:16px">
      <p style="margin:0;color:#1e40af;font-size:13px;line-height:1.6">
        <b>Pedido multi-marca:</b> son ${d.marcas.length} presentaciones separadas ante el INPI
        (${lineas} ${lineas === 1 ? 'clase' : 'clases'} en total). La carta poder adjunta cubre todas.
      </p>
    </div>`
      : ''}
    ${d.status === 'pending_transfer'
      ? `<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:10px;padding:14px 18px;margin-bottom:16px">
      <p style="margin:0 0 4px;color:#92400e;font-size:14px;font-weight:800">⚠ TRANSFERENCIA PENDIENTE</p>
      <p style="margin:0;color:#92400e;font-size:13px;line-height:1.6">
        Eligió pagar por transferencia a ${esc(TRANSFERENCIA.alias)}. Verificá que se
        hayan acreditado los $${d.total.toLocaleString('es-AR')} antes de presentar ante el INPI.
      </p>
    </div>`
      : `<p style="margin:0 0 16px;font-size:13px;font-weight:700;color:${d.status === 'paid' ? '#16a34a' : '#b45309'}">
      Estado de pago: ${esc(d.status)}
    </p>`}
    ${marcasAdminHTML(d.marcas)}
    <p style="margin:18px 0 6px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Titular</p>
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
  marcas: MarcaEmail[];
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
    <h1 style="margin:0 0 4px;color:#0B1D3A;font-size:20px;font-weight:800">Pago ${esc(info.label.toLowerCase())}: “${esc(marcasTitulo(d.marcas))}”</h1>
    <p style="margin:0 0 16px;color:#64748b;font-size:13px">${esc(d.ref)} · ${esc(alcanceLabel(d.marcas))} · Total $${d.total.toLocaleString('es-AR')}</p>
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
    subject: `Pago ${info.label.toLowerCase()}: ${marcasTitulo(d.marcas)} (${d.ref})`,
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
      subject: `${d.status === 'pending_transfer' ? '[TRANSFERENCIA PENDIENTE] ' : ''}Solicitud completada: ${marcasTitulo(d.marcas)} (${d.ref})`,
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
