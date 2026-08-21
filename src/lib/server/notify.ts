// Emails de confirmación de solicitud (cliente + admin) vía Resend,
// con la carta poder firmada adjunta en PDF.
import {
  TRANSFERENCIA, contarLineas, formatCm, normalizeTipoMarca, requiereLogo,
  tipoMarcaLabel, type TipoMarca,
} from '@/lib/checkout/constants';

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
  tipo?: TipoMarca;
  /** Solo en mixta y figurativa */
  colores?: string;
  alto?: number | null;
  ancho?: number | null;
  /** Nombre del JPG adjunto al email del admin, o null si no se pudo recuperar */
  logoAdjunto?: string | null;
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

/** Un titular en los emails: el encabezado de su tarjeta y sus filas. Con
 *  cotitulares son varios bloques, cada uno con su porcentaje en el título. */
export interface TitularEmail {
  titulo: string;
  filas: [string, string][];
}

/** Un cotitular al que le falta firmar, con su link propio. */
export interface FirmaPendienteEmail {
  nombre: string;
  email: string;
  url: string;
}

interface OrderEmailData {
  ref: string;
  status: string;
  marcas: MarcaEmail[];
  clientEmail: string;
  garantia: boolean;
  total: number;
  titulares: TitularEmail[];
  /** Cambios de tipo que el cliente hizo después de pagar (figurativa → mixta,
   *  la única que se acepta). Van al email porque el pedido ya no coincide con
   *  el snapshot del pago y el estudio tiene que poder verlo. */
  correcciones?: string[];
  /** Cotitulares a los que se les mandó el link para firmar. Mientras haya uno,
   *  la carta poder adjunta NO es la definitiva. */
  firmasPendientes?: FirmaPendienteEmail[];
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
  const filas = marcas.map(m => {
    const tipo = normalizeTipoMarca(m.tipo);
    const detalle = tipo === 'denominativa'
      ? clasesLabel(m.clases).toLowerCase()
      : `${clasesLabel(m.clases).toLowerCase()} · marca ${tipo}`;
    return `<li style="margin:0 0 4px">
        <b style="color:#0B1D3A">“${esc(m.nombre.toUpperCase())}”</b>
        <span style="color:#64748b"> — ${esc(detalle)}</span>
      </li>`;
  }).join('');
  return `<ul style="margin:0 0 14px;padding-left:20px;color:#475569;font-size:14px;line-height:1.6">${filas}</ul>`;
}

/** Aviso al cliente de que el poder todavía no está completo. Va arriba del
 *  todo: es lo único que puede frenar la presentación, y depende de él (tiene
 *  que avisarles a los cotitulares que les llegó el mail). */
function pendientesClientHTML(d: OrderEmailData): string {
  const pendientes = d.firmasPendientes ?? [];
  if (!pendientes.length) return '';
  const uno = pendientes.length === 1;
  // Sin email no hubo link que mandar: se lo decimos, porque es él quien puede
  // conseguirlo. Callarlo dejaría el trámite trabado sin que nadie se entere.
  const filas = pendientes.map(p => `<li style="margin:0 0 4px">
      <b style="color:#0B1D3A">${esc(p.nombre)}</b>
      <span style="color:#64748b">— ${p.email
        ? esc(p.email)
        : '<b>no tenemos su email</b>: escribinos y te pedimos ese dato'}</span>
    </li>`).join('');
  return `<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:10px;padding:16px 20px;margin-bottom:18px">
      <p style="margin:0 0 6px;color:#92400e;font-size:14px;font-weight:800">
        Falta ${uno ? 'una firma' : `${pendientes.length} firmas`} en la carta poder
      </p>
      <p style="margin:0 0 8px;color:#92400e;font-size:13px;line-height:1.6">
        Como la marca tiene más de un titular, ${uno ? 'el cotitular' : 'cada cotitular'}
        tiene que <b>completar sus datos y firmar</b> el poder. Le mandamos un
        email con su link a:
      </p>
      <ul style="margin:0 0 8px;padding-left:20px;font-size:13px;line-height:1.6">${filas}</ul>
      <p style="margin:0;color:#92400e;font-size:13px;line-height:1.6">
        Avisale que lo busque (puede caer en spam). Presentamos la solicitud
        cuando estén todas las firmas.
      </p>
    </div>`;
}

function clientHTML(d: OrderEmailData): string {
  const porTransferencia = d.status === 'pending_transfer';
  const varias = d.marcas.length > 1;
  const queCosa = varias ? 'tus solicitudes' : 'tu solicitud';
  // El orden de los condicionales es el orden real de los bloqueos: sin plata
  // no se presenta, y con plata pero sin todas las firmas del poder, tampoco.
  const plazo = porTransferencia
    ? `Presentaremos ${queCosa} ante el INPI dentro de las <b>48 horas hábiles</b> desde que se acredite tu transferencia y te enviaremos todas las novedades del trámite a este email.`
    : d.firmasPendientes?.length
      ? `Presentaremos ${queCosa} ante el INPI dentro de las <b>48 horas hábiles</b> desde que estén todas las firmas del poder, y te enviaremos todas las novedades del trámite a este email.`
      : `Presentaremos ${queCosa} ante el INPI dentro de las próximas <b>48 horas hábiles</b> y te enviaremos todas las novedades del trámite a este email.`;
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
    ${pendientesClientHTML(d)}
    <div style="background:#f8faff;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:18px">
      <p style="margin:0;color:#475569;font-size:13px;line-height:1.65">
        📎 Adjuntamos la <b>carta poder${d.firmasPendientes?.length ? '' : ' firmada'}</b> que nos autoriza a gestionar el trámite.<br>
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
  return marcas.map((m, i) => {
    const tipo = normalizeTipoMarca(m.tipo);
    const conLogo = requiereLogo(tipo);
    // La figurativa no lleva denominación: el nombre es referencia interna.
    const titulo = tipo === 'figurativa'
      ? `Figurativa · ref. interna “${esc(m.nombre.toUpperCase())}”`
      : `“${esc(m.nombre.toUpperCase())}”`;
    const medidas = [m.alto, m.ancho].every(v => typeof v === 'number')
      ? `${formatCm(m.alto)} cm (alto) × ${formatCm(m.ancho)} cm (ancho)`
      : '⚠ FALTAN — cargarlas a mano';
    const logo = m.logoAdjunto
      ? `${esc(m.logoAdjunto)} (adjunto a este email)`
      : '⚠ NO SE PUDO RECUPERAR — pedírselo al cliente';

    // Una figurativa con texto es una presentación defectuosa, y el formulario
    // no puede verificar la imagen: solo puede preguntarle al cliente, que es
    // justamente quien no sabe la diferencia. La última defensa es mirarla.
    const avisoFigurativa = tipo === 'figurativa'
      ? `<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:8px;padding:10px 14px;margin:0 0 10px">
        <p style="margin:0;color:#92400e;font-size:13px;line-height:1.55">
          <b>⚠ MIRAR LA IMAGEN ANTES DE PRESENTAR.</b> Una figurativa no puede tener
          ni una letra. Si el logo tiene texto, es <b>mixta</b>: hay que rehacer la
          carta poder con el tipo corregido antes de ir al INPI.
        </p>
      </div>`
      : '';

    return `<div style="border:1px solid #e2e8f0;border-left:3px solid #2563EB;border-radius:10px;padding:14px 18px;margin-bottom:12px">
      <p style="margin:0 0 2px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Solicitud ${i + 1} de ${marcas.length} · ${esc(tipoMarcaLabel(tipo))}</p>
      <p style="margin:0 0 2px;color:#0B1D3A;font-size:16px;font-weight:800">${titulo}</p>
      <p style="margin:0 0 10px;color:#2563EB;font-size:13px;font-weight:700">${esc(clasesLabel(m.clases))}</p>
      ${avisoFigurativa}
      <table style="width:100%;border-collapse:collapse">
        ${conLogo ? `<tr><td style="padding:4px 0;color:#64748b;font-size:13px;width:34%;vertical-align:top">Logo (JPG)</td><td style="padding:4px 0;color:#0f172a;font-size:13px">${logo}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b;font-size:13px;vertical-align:top">Medidas</td><td style="padding:4px 0;color:#0f172a;font-size:13px">${esc(medidas)}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b;font-size:13px;vertical-align:top">Colores</td><td style="padding:4px 0;color:#0f172a;font-size:13px">${esc(m.colores || '—')}</td></tr>` : ''}
        <tr><td style="padding:4px 0;color:#64748b;font-size:13px;width:34%;vertical-align:top">Descripción</td><td style="padding:4px 0;color:#0f172a;font-size:13px;line-height:1.55">${esc(m.descripcion || '—')}</td></tr>
        ${m.sitioWeb ? `<tr><td style="padding:4px 0;color:#64748b;font-size:13px;vertical-align:top">Página web</td><td style="padding:4px 0;color:#0f172a;font-size:13px">${esc(m.sitioWeb)}</td></tr>` : ''}
      </table>
    </div>`;
  }).join('');
}

/** Un bloque por titular. Con uno solo va la tabla pelada, como siempre; con
 *  cotitulares, cada uno en su tarjeta y con el porcentaje en el encabezado —
 *  que es el dato que hay que cargar en TITULARIDAD del portal del INPI. */
function titularesAdminHTML(titulares: TitularEmail[]): string {
  const tabla = (t: TitularEmail) => `<table style="width:100%;border-collapse:collapse">${
    t.filas.map(([k, v]) =>
      `<tr><td style="padding:5px 0;color:#64748b;font-size:13px;width:40%;vertical-align:top">${esc(k)}</td><td style="padding:5px 0;color:#0f172a;font-size:13px;font-weight:500;vertical-align:top">${esc(v)}</td></tr>`
    ).join('')
  }</table>`;

  if (titulares.length <= 1) return titulares[0] ? tabla(titulares[0]) : '';

  return titulares.map(t => `<div style="border:1px solid #e2e8f0;border-left:3px solid #6366F1;border-radius:10px;padding:12px 16px;margin-bottom:10px">
      <p style="margin:0 0 6px;color:#0B1D3A;font-size:14px;font-weight:800">${esc(t.titulo)}</p>
      ${tabla(t)}
    </div>`).join('');
}

/** Qué firmas faltan y en qué link. El estudio no puede presentar sin el poder
 *  completo, y esto es lo único que le dice a quién hay que apurar. */
function pendientesAdminHTML(d: OrderEmailData): string {
  const pendientes = d.firmasPendientes ?? [];
  if (!pendientes.length) return '';
  const filas = pendientes.map(p => `<li style="margin:0 0 6px">
      <b>${esc(p.nombre)}</b> — ${esc(p.email)}<br>
      <a href="${esc(p.url)}" style="color:#92400e;font-size:12px;word-break:break-all">${esc(p.url)}</a>
    </li>`).join('');
  return `<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:10px;padding:14px 18px;margin-bottom:16px">
      <p style="margin:0 0 4px;color:#92400e;font-size:14px;font-weight:800">⚠ CARTA PODER INCOMPLETA — faltan ${pendientes.length} ${pendientes.length === 1 ? 'firma' : 'firmas'}</p>
      <p style="margin:0 0 8px;color:#92400e;font-size:13px;line-height:1.6">
        El PDF adjunto tiene sólo las firmas que hay hasta ahora, y los renglones
        de los cotitulares en blanco: <b>cada uno carga sus propios datos</b>
        cuando entra a su link. Cuando firme el último llega el poder definitivo
        con el asunto “Carta poder completa”. <b>No presentar antes.</b><br>
        El alta en el portal Vigilante también espera a ese momento.
      </p>
      <ul style="margin:0;padding-left:18px;color:#92400e;font-size:13px;line-height:1.6">${filas}</ul>
    </div>`;
}

function adminHTML(d: OrderEmailData): string {
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
    ${d.correcciones?.length
      ? `<div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:10px;padding:14px 18px;margin-bottom:16px">
      <p style="margin:0 0 4px;color:#1e40af;font-size:14px;font-weight:800">Corrección de tipo después del pago</p>
      <p style="margin:0 0 6px;color:#1e40af;font-size:13px;line-height:1.6">
        El cliente subió el logo y avisó que tenía texto, así que la marca se
        presenta como mixta. El precio no cambia. La carta poder adjunta ya sale
        con el tipo corregido.
      </p>
      <ul style="margin:0;padding-left:18px;color:#1e40af;font-size:13px;line-height:1.6">
        ${d.correcciones.map(c => `<li>${esc(c)}</li>`).join('')}
      </ul>
    </div>`
      : ''}
    ${pendientesAdminHTML(d)}
    ${marcasAdminHTML(d.marcas)}
    <p style="margin:18px 0 6px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">${d.titulares.length > 1 ? `Titulares (${d.titulares.length})` : 'Titular'}</p>
    ${titularesAdminHTML(d.titulares)}
    <p style="margin:16px 0 0;color:#94a3b8;font-size:12px">Carta poder adjunta. Datos completos en D1 (orders / ${esc(d.ref)}).</p>
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
  garantia: boolean;
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
    <p style="margin:0 0 16px;color:#64748b;font-size:13px">${esc(d.ref)} · ${esc(alcanceLabel(d.marcas))} · ${d.garantia ? 'Con Garantía' : 'Sin garantía'} · Total $${d.total.toLocaleString('es-AR')}</p>
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

/** Aviso al estudio de que un alta en el portal Vigilante necesita una mirada.
 *  El portal ya avisa solo cuando devuelve 400, 403 o 500; esto cubre los tres
 *  casos que del otro lado nadie ve: las advertencias de un 201 (el pedido
 *  entró, pero algún campo del mapeo se rompió), un timeout de red (la request
 *  nunca llegó) y el entorno sin credencial configurada. */
export async function sendVigilanteAlert(
  apiKey: string,
  d: {
    ref: string;
    alta: {
      ok: boolean; omitido?: boolean; status?: number; error?: string;
      detalles?: string[]; tramites?: number[];
      advertencias?: { codigo: string; mensaje: string; marca?: string }[];
    };
  },
): Promise<void> {
  const { alta } = d;
  const asunto = alta.omitido
    ? `Alta en Vigilante NO enviada (${d.ref})`
    : !alta.ok
      ? `Alta en Vigilante falló (${d.ref})`
      : `Alta en Vigilante con advertencias (${d.ref})`;

  const filas: string[] = [];
  if (alta.error) filas.push(`<p><b>Motivo:</b> ${esc(alta.error)}</p>`);
  if (alta.status) filas.push(`<p><b>HTTP:</b> ${alta.status}</p>`);
  if (alta.detalles?.length) {
    filas.push(`<ul>${alta.detalles.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`);
  }
  if (alta.tramites?.length) {
    filas.push(`<p><b>Trámites creados:</b> ${alta.tramites.join(', ')}</p>`);
  }
  if (alta.advertencias?.length) {
    filas.push('<p><b>Advertencias:</b></p><ul>' + alta.advertencias.map(a =>
      `<li><code>${esc(a.codigo)}</code> — ${esc(a.mensaje)}${a.marca ? ` (${esc(a.marca)})` : ''}</li>`
    ).join('') + '</ul>');
  }

  const nota = alta.ok
    ? 'El pedido entró al portal igual. Revisá los campos marcados: un 201 no significa que los datos estén bien.'
    : 'El pedido está cobrado y guardado en D1, pero NO quedó cargado en el portal. Hay que darlo de alta a mano o reintentar.';

  await sendResend(apiKey, {
    from: FROM,
    to: [ADMIN_EMAIL],
    subject: asunto,
    html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#0f172a">
      <h2 style="margin:0 0 .5rem">${esc(asunto)}</h2>
      <p>Pedido <b>${esc(d.ref)}</b>.</p>
      ${filas.join('\n')}
      <p style="color:#64748b;font-size:14px">${esc(nota)}</p>
    </body></html>`,
  });
}

// ── Cadena de firmas de la carta poder ────────────────────
// Cuando la marca tiene cotitulares, el que completa el checkout firma ahí
// mismo y al resto le llega su link. Ver src/lib/server/firmas.ts.

export interface FirmaInviteData {
  ref: string;
  /** A quién se le pide la firma */
  nombre: string;
  email: string;
  /** Link propio, con su token */
  url: string;
  marcas: MarcaEmail[];
  /** Quién completó el pedido: es el nombre que el destinatario reconoce */
  completadoPor: string;
  /** Su porcentaje de titularidad, ya formateado ("50") */
  porcentaje: string;
  /** Reply-to: el email de quien armó el pedido, por si hay que preguntarle */
  responderA?: string;
}

/** El email que recibe un cotitular. Tiene que explicarse solo: el destinatario
 *  puede no haber visto nunca el sitio, y lo que le llega es un pedido de firma
 *  de un documento legal. Si esto se lee como spam, el trámite se frena. */
export async function sendFirmaInvite(apiKey: string, d: FirmaInviteData): Promise<void> {
  const titulo = marcasTitulo(d.marcas);
  await sendResend(apiKey, {
    from: FROM,
    to: [d.email],
    reply_to: d.responderA || undefined,
    subject: `Falta tu firma para registrar la marca ${titulo}`,
    html: `<!DOCTYPE html><html><body style="margin:0;padding:24px 16px;background:#f1f5f9;font-family:Inter,-apple-system,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:36px;border:1px solid #e2e8f0">
    <p style="margin:0 0 6px;color:#2563EB;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">UnaMarca</p>
    <h1 style="margin:0 0 14px;color:#0B1D3A;font-size:21px;font-weight:800">Hola ${esc(d.nombre)}, falta tu firma</h1>
    <p style="margin:0 0 12px;color:#475569;font-size:14px;line-height:1.65">
      ${esc(d.completadoPor)} contrató con nosotros el registro de
      ${d.marcas.length > 1 ? 'estas marcas' : `la marca <b>“${esc(titulo)}”</b>`}
      ante el INPI y te incluyó como <b>cotitular</b> con un
      <b>${esc(d.porcentaje)}%</b> de titularidad.
    </p>
    ${d.marcas.length > 1 ? marcasClientHTML(d.marcas) : ''}
    <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.65">
      Para poder presentar la solicitud necesitamos la firma de todos los
      titulares en la <b>carta poder</b>, que es el documento que nos autoriza a
      hacer el trámite en nombre de ustedes. Abrí el link, <b>completá tus
      datos</b> —tu documento, tu CUIT y tu domicilio, que sólo los sabés vos— y
      firmá con el dedo o el mouse:
    </p>
    <p style="margin:0 0 22px">
      <a href="${esc(d.url)}" style="display:inline-block;background:#0B1D3A;color:#fff;text-decoration:none;padding:14px 28px;border-radius:100px;font-size:15px;font-weight:600">Revisar y firmar</a>
    </p>
    <p style="margin:0 0 18px;color:#94a3b8;font-size:12px;line-height:1.6;word-break:break-all">
      Si el botón no funciona, copiá este link: ${esc(d.url)}
    </p>
    <div style="background:#f8faff;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px">
      <p style="margin:0;color:#475569;font-size:13px;line-height:1.65">
        El link es personal: completa y firma tu renglón del poder, y se usa una
        sola vez. Si el porcentaje no es el que acordaron, no firmes — respondé
        este email y lo corregimos antes.<br>
        N° de pedido: <b style="color:#0B1D3A">${esc(d.ref)}</b>
      </p>
    </div>
  </div>
</body></html>`,
  });
}

export interface FirmaRecibidaData {
  ref: string;
  /** Quién acaba de firmar */
  nombre: string;
  marcas: MarcaEmail[];
  firmadas: number;
  total: number;
  completo: boolean;
  /** Los que todavía faltan, para saber a quién apurar */
  pendientes: { nombre: string; email: string; url: string }[];
  /** Datos que el titular corrigió de sí mismo antes de firmar, campo por
   *  campo. No es un detalle: el poder que firmó el primero decía lo anterior,
   *  y el alta en el portal ya se hizo con eso. */
  cambios?: string[];
}

/** Aviso al estudio por cada firma de la cadena. El PDF adjunto es el poder con
 *  todas las firmas que hay hasta ese momento: si la cadena se corta, en la
 *  casilla queda igual lo firmado. Solo el último (`completo`) se puede
 *  presentar. */
export async function sendFirmaRecibida(
  apiKey: string,
  d: FirmaRecibidaData,
  pdfBase64: string | null,
): Promise<void> {
  const titulo = marcasTitulo(d.marcas);
  const asunto = d.completo
    ? `Carta poder completa (${d.firmadas}/${d.total}): ${titulo} — ${d.ref}`
    : `Firma ${d.firmadas} de ${d.total}: ${titulo} — ${d.ref}`;

  const pendientesHTML = d.pendientes.length
    ? `<p style="margin:0 0 6px;color:#92400e;font-size:13px;font-weight:700">Todavía falta:</p>
       <ul style="margin:0 0 16px;padding-left:18px;color:#92400e;font-size:13px;line-height:1.6">${
         d.pendientes.map(p => `<li><b>${esc(p.nombre)}</b> — ${esc(p.email)}<br><a href="${esc(p.url)}" style="color:#92400e;font-size:12px;word-break:break-all">${esc(p.url)}</a></li>`).join('')
       }</ul>`
    : '';

  await sendResend(apiKey, {
    from: FROM,
    to: [ADMIN_EMAIL],
    subject: asunto,
    html: `<!DOCTYPE html><html><body style="margin:0;padding:24px 16px;background:#f1f5f9;font-family:Inter,-apple-system,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:36px;border:1px solid #e2e8f0">
    <p style="margin:0 0 6px;color:#2563EB;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">UnaMarca · Carta poder</p>
    <h1 style="margin:0 0 4px;color:#0B1D3A;font-size:20px;font-weight:800">${esc(d.nombre)} firmó la carta poder</h1>
    <p style="margin:0 0 16px;color:#64748b;font-size:13px">${esc(d.ref)} · ${esc(titulo)} · firma ${d.firmadas} de ${d.total}</p>
    ${d.cambios?.length
      ? `<div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:10px;padding:14px 18px;margin-bottom:16px">
      <p style="margin:0 0 4px;color:#1e40af;font-size:14px;font-weight:800">Corrigió sus datos antes de firmar</p>
      <p style="margin:0 0 6px;color:#1e40af;font-size:13px;line-height:1.6">
        Ya está guardado en el pedido y el PDF adjunto sale con lo corregido.
        <b>Dos cosas quedaron con lo viejo:</b> el alta en el portal Vigilante
        (se hizo al completarse el pedido) y el poder que firmaron los titulares
        anteriores, si alguno firmó antes de esta corrección.
      </p>
      <ul style="margin:0;padding-left:18px;color:#1e40af;font-size:13px;line-height:1.6">
        ${d.cambios.map(c => `<li>${esc(c)}</li>`).join('')}
      </ul>
    </div>`
      : ''}
    ${d.completo
      ? `<div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:16px">
      <p style="margin:0;color:#166534;font-size:14px;line-height:1.6">
        <b>✓ PODER COMPLETO.</b> Están las ${d.total} firmas. El PDF adjunto es el
        definitivo: es el que va al INPI.
      </p>
    </div>`
      : `<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:10px;padding:14px 18px;margin-bottom:16px">
      <p style="margin:0 0 8px;color:#92400e;font-size:14px;line-height:1.6">
        <b>Poder incompleto.</b> El PDF adjunto tiene ${d.firmadas} de ${d.total}
        firmas: sirve de respaldo, <b>no para presentar</b>.
      </p>
      ${pendientesHTML}
    </div>`}
    ${pdfBase64 ? '' : `<div style="background:#fef2f2;border:1.5px solid #fecaca;border-radius:10px;padding:14px 18px;margin-bottom:16px">
      <p style="margin:0;color:#b91c1c;font-size:13px;line-height:1.6">
        <b>⚠ Sin PDF adjunto:</b> el navegador de quien firmó no pudo generarlo.
        La firma sí quedó guardada en D1 (firmas / ${esc(d.ref)}). Hay que rehacer
        el documento desde ahí o pedirle que vuelva a entrar al link.
      </p>
    </div>`}
    <p style="margin:16px 0 0;color:#94a3b8;font-size:12px">Datos completos en D1 (orders y firmas / ${esc(d.ref)}).</p>
  </div>
</body></html>`,
    attachments: pdfBase64
      ? [{ filename: `carta-poder-${d.ref}${d.completo ? '' : `-parcial-${d.firmadas}de${d.total}`}.pdf`, content: pdfBase64 }]
      : undefined,
  });
}

/** La copia del poder completo para cada titular. Sale una sola vez, cuando
 *  firma el último: antes de eso el documento no está terminado. */
export async function sendPoderCompletoClientes(
  apiKey: string,
  d: { ref: string; marcas: MarcaEmail[]; emails: string[] },
  pdfBase64: string | null,
): Promise<void> {
  const destinos = [...new Set(d.emails.map(e => e.trim().toLowerCase()).filter(Boolean))];
  if (!destinos.length || !pdfBase64) return;
  const titulo = marcasTitulo(d.marcas);
  await Promise.all(destinos.map(to => sendResend(apiKey, {
    from: FROM,
    to: [to],
    subject: `Carta poder firmada por todos los titulares — ${d.ref}`,
    html: `<!DOCTYPE html><html><body style="margin:0;padding:24px 16px;background:#f1f5f9;font-family:Inter,-apple-system,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:36px;border:1px solid #e2e8f0">
    <p style="margin:0 0 6px;color:#2563EB;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">UnaMarca</p>
    <h1 style="margin:0 0 14px;color:#0B1D3A;font-size:21px;font-weight:800">Ya están todas las firmas</h1>
    <p style="margin:0 0 12px;color:#475569;font-size:14px;line-height:1.65">
      La carta poder de ${d.marcas.length > 1 ? 'las marcas del pedido' : `<b>“${esc(titulo)}”</b>`}
      quedó firmada por todos los titulares. Te adjuntamos el documento completo:
      guardalo, es tu copia.
    </p>
    <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.65">
      Presentamos la solicitud ante el INPI dentro de las próximas
      <b>48 horas hábiles</b> y te avisamos por email en cada etapa.
    </p>
    <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6">
      N° de pedido: <b style="color:#0B1D3A">${esc(d.ref)}</b>
    </p>
  </div>
</body></html>`,
    attachments: [{ filename: `carta-poder-${d.ref}.pdf`, content: pdfBase64 }],
  })));
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
  /** Logos en JPG (mixtas y figurativas), ya leídos de R2. Solo al admin: es
   *  quien los sube al portal del INPI, y el cliente ya tiene su propio archivo. */
  logos: { filename: string; content: string }[] = [],
): Promise<void> {
  // Sin PDF (falla en el navegador) los emails salen igual, sin adjunto
  const carta = pdfBase64
    ? [{ filename: `carta-poder-${d.ref}.pdf`, content: pdfBase64 }]
    : [];
  const adminAttachments = [...carta, ...logos];

  // Admin siempre; cliente solo si dejó email
  const sends: Promise<void>[] = [
    sendResend(apiKey, {
      from: FROM,
      to: [ADMIN_EMAIL],
      reply_to: d.clientEmail || undefined,
      subject: `${d.status === 'pending_transfer' ? '[TRANSFERENCIA PENDIENTE] ' : ''}${d.firmasPendientes?.length ? `[FALTAN ${d.firmasPendientes.length} FIRMAS] ` : ''}Solicitud completada: ${marcasTitulo(d.marcas)} (${d.ref})`,
      html: adminHTML(d),
      attachments: adminAttachments.length ? adminAttachments : undefined,
    }),
  ];
  if (d.clientEmail) {
    sends.push(sendResend(apiKey, {
      from: FROM,
      to: [d.clientEmail],
      subject: `Recibimos tu solicitud de registro de marca — ${d.ref}`,
      html: clientHTML(d),
      attachments: carta.length ? carta : undefined,
    }));
  }
  await Promise.all(sends);
}
