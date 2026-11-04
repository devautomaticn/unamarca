// POST /api/formulario-terminos: relevamiento para redactar los términos y
// condiciones y la política de privacidad de la app o web de un cliente.
//
// La página (/formulario-terminos) se manda por WhatsApp; el pago se gestiona
// por fuera. Lo que llega se guarda en D1 (tabla `terminos_formularios`) y se
// manda por email al estudio. El cuerpo es genérico (secciones de pregunta y
// respuesta) para que cambiar una pregunta sea tocar sólo la página.
import type { APIRoute } from 'astro';
import { runtime } from '@/lib/server/runtime';
import { json } from '@/lib/server/checkout';

export const prerender = false;

const FROM = 'Formulario UnaMarca <formulario@vigilante.unamarca.com.ar>';
const ADMIN_EMAIL = 'mike@automaticnation.com';

// Topes contra un POST abusivo: el formulario real queda muy por debajo.
const MAX_BYTES = 80_000;
const MAX_SECCIONES = 12;
const MAX_CAMPOS = 30;
const MAX_TEXTO = 6_000;

interface Env {
  DB?: D1Database;
  RESEND_API_KEY?: string;
}

interface Campo { pregunta: string; respuesta: string }
interface Seccion { titulo: string; campos: Campo[] }
interface Contacto { nombre: string; email: string; app: string }

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function limpiar(body: any): { secciones: Seccion[]; contacto: Contacto } | null {
  if (!body || !Array.isArray(body.secciones)) return null;
  const secciones: Seccion[] = body.secciones.slice(0, MAX_SECCIONES).map((s: any) => ({
    titulo: str(s?.titulo, 120),
    campos: (Array.isArray(s?.campos) ? s.campos : []).slice(0, MAX_CAMPOS).map((c: any) => ({
      pregunta: str(c?.pregunta, 300),
      respuesta: str(c?.respuesta, MAX_TEXTO),
    })).filter((c: Campo) => c.pregunta && c.respuesta),
  })).filter((s: Seccion) => s.titulo && s.campos.length);
  const contacto: Contacto = {
    nombre: str(body.contacto?.nombre, 200),
    email: str(body.contacto?.email, 200),
    app: str(body.contacto?.app, 200),
  };
  if (!secciones.length || !contacto.nombre || !EMAIL_RE.test(contacto.email)) return null;
  return { secciones, contacto };
}

function emailHTML(secciones: Seccion[], contacto: Contacto, id: number | null): string {
  const fecha = new Date().toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'long', timeStyle: 'short',
  });
  const cuerpo = secciones.map(s => `
    <p style="margin:28px 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#2563EB">${esc(s.titulo)}</p>
    <table style="width:100%;border-collapse:collapse">
      ${s.campos.map(c => `<tr>
        <td style="padding:7px 12px 7px 0;color:#64748b;font-size:14px;width:40%;vertical-align:top;border-top:1px solid #f1f5f9">${esc(c.pregunta)}</td>
        <td style="padding:7px 0;color:#0f172a;font-size:14px;font-weight:500;vertical-align:top;border-top:1px solid #f1f5f9;white-space:pre-wrap">${esc(c.respuesta)}</td>
      </tr>`).join('')}
    </table>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px 16px;background:#f1f5f9;font-family:Inter,-apple-system,'Segoe UI',sans-serif">
  <div style="max-width:680px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:#0B1D3A;padding:28px 32px">
      <p style="margin:0 0 10px;color:rgba(255,255,255,.55);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">UnaMarca · Términos y privacidad</p>
      <h1 style="margin:0 0 6px;color:white;font-size:21px">${esc(contacto.app || 'Sin nombre')}: ${esc(contacto.nombre)}</h1>
      <p style="margin:0;color:rgba(255,255,255,.55);font-size:13px">${esc(fecha)}${id ? ` · formulario #${id}` : ''}</p>
    </div>
    <div style="padding:8px 32px 32px">${cuerpo}</div>
  </div>
</body></html>`;
}

async function guardar(db: D1Database, secciones: Seccion[], c: Contacto): Promise<number | null> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS terminos_formularios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creado_en TEXT NOT NULL,
      nombre TEXT NOT NULL,
      email TEXT NOT NULL,
      app TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL,
      email_enviado INTEGER NOT NULL DEFAULT 0
    )
  `).run();
  const r = await db.prepare(
    'INSERT INTO terminos_formularios (creado_en, nombre, email, app, payload) VALUES (?, ?, ?, ?, ?)'
  ).bind(new Date().toISOString(), c.nombre, c.email, c.app, JSON.stringify(secciones)).run();
  return (r.meta?.last_row_id as number) ?? null;
}

export const POST: APIRoute = async (context) => {
  const { env } = runtime<Env>(context.locals);

  const raw = await context.request.text();
  if (raw.length > MAX_BYTES) return json({ success: false, error: 'Formulario demasiado largo' }, 413);
  let body: any;
  try { body = JSON.parse(raw); } catch { return json({ success: false, error: 'Cuerpo inválido' }, 400); }

  // Honeypot: un bot que completa el campo oculto recibe "ok" y no se guarda nada.
  if (str(body?.website, 200)) return json({ success: true });

  const datos = limpiar(body);
  if (!datos) return json({ success: false, error: 'Faltan datos' }, 400);
  const { secciones, contacto } = datos;

  // Guardar primero: si el email falla, el formulario no se pierde.
  let id: number | null = null;
  if (env.DB) {
    try { id = await guardar(env.DB, secciones, contacto); }
    catch (e) { console.error('formulario-terminos D1:', e); }
  }

  let enviado = false;
  if (env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
        body: JSON.stringify({
          from: FROM,
          to: [ADMIN_EMAIL],
          reply_to: contacto.email,
          subject: `Términos y privacidad: ${contacto.app || contacto.nombre}`,
          html: emailHTML(secciones, contacto, id),
        }),
      });
      enviado = res.ok;
      if (!res.ok) console.error('formulario-terminos Resend:', await res.text());
    } catch (e) { console.error('formulario-terminos fetch:', e); }
  }

  if (enviado && id !== null && env.DB) {
    try { await env.DB.prepare('UPDATE terminos_formularios SET email_enviado = 1 WHERE id = ?').bind(id).run(); }
    catch { /* el registro ya está; la marca es sólo informativa */ }
  }

  if (id === null && !enviado) return json({ success: false, error: 'No se pudo guardar' }, 500);
  return json({ success: true });
};
