// Alta en la vigilancia gratuita del Boletín, desde la guía.
//
// ⚠️ ESTE ES EL ÚNICO PROXY FRÁGIL DE LOS CUATRO. Vigilancia no tiene API JSON:
// es un formulario HTML clásico que postea a /vigilancia y responde con la
// página entera. Acá se traduce esa respuesta a JSON leyendo el banner de error.
//
//   · hay `<div class="error-banner">…</div>`  → el alta falló, con ese texto
//   · no hay banner                            → se dio de alta
//
// Eso significa que si Vigilante le cambia la clase al banner, esto empieza a
// devolver "ok" ante errores. Cuando exista un endpoint JSON hay que migrar y
// borrar todo el parseo de abajo. Ver ToolVigilancia.astro.

import type { APIRoute } from 'astro';
import { runtime } from '@/lib/server/runtime';

// Ruta de servidor: se ejecuta por request, no se prerenderiza.
export const prerender = false;

const UPSTREAM = 'https://vigilante.com.ar/vigilancia';

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Saca el texto del banner de error, si lo hay. */
function errorDelHtml(html: string): string | null {
  const m = html.match(/<div class="error-banner">([\s\S]*?)<\/div>/i);
  if (!m) return null;
  const texto = m[1].replace(/<[^>]+>/g, '').trim();
  return texto || 'No pudimos dar de alta la vigilancia.';
}

export const POST: APIRoute = async (context) => {
  let datos: { nombre?: string; email?: string; telefono?: string; clases?: number[] };
  try {
    datos = await context.request.json();
  } catch {
    return json({ error: 'Cuerpo de solicitud inválido.' }, 400);
  }

  const nombre = (datos.nombre || '').trim().slice(0, 120);
  const email = (datos.email || '').trim().slice(0, 160);
  const clases = (datos.clases || []).filter(n => Number.isInteger(n) && n >= 1 && n <= 45);

  // Se valida acá para dar un error claro en vez de rebotar contra el HTML.
  if (!nombre) return json({ error: 'Poné el nombre de tu marca.' }, 400);
  if (!email) return json({ error: 'Poné un email donde recibir los avisos.' }, 400);
  if (!clases.length) return json({ error: 'Elegí al menos una clase para vigilar.' }, 400);

  // El formulario espera `clases` repetido, una vez por clase.
  const form = new URLSearchParams();
  form.append('nombre', nombre);
  form.append('email', email);
  if (datos.telefono) form.append('telefono', datos.telefono.trim().slice(0, 40));
  for (const c of clases) form.append('clases', String(c));

  let upstream: Response;
  try {
    upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: form.toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return json({ error: 'No pudimos conectar con el servicio de vigilancia. Intentá de nuevo en unos minutos.' }, 502);
  }

  const html = await upstream.text();

  if (!upstream.ok) {
    return json({ error: errorDelHtml(html) || 'No pudimos dar de alta la vigilancia.' }, upstream.status);
  }

  const err = errorDelHtml(html);
  if (err) return json({ error: err }, 400);

  return json({ ok: true }, 200);
};
