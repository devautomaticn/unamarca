// Acceso a los bindings de Cloudflare desde una ruta de Astro.
//
// Antes estas rutas eran Pages Functions y recibían `context.env` y
// `context.waitUntil` directo. Con el adaptador de Astro, los bindings viven en
// `Astro.locals.runtime`. Este helper existe para que cada ruta lo saque de un
// solo lugar y el cambio no se repita quince veces con quince variantes.
//
// ⚠️ En `astro dev` NO hay runtime de Cloudflare: `env` viene vacío y las rutas
// contestan su error de "no configurado". Para probarlas de verdad hay que usar
// `npx wrangler pages dev dist` sobre el build.

export interface Runtime<E> {
  env: E;
  /** Trabajo que sigue después de responder (emails, altas en Vigilante). */
  waitUntil: (p: Promise<unknown>) => void;
}

export function runtime<E = Record<string, unknown>>(locals: unknown): Runtime<E> {
  const rt = (locals as any)?.runtime;
  return {
    env: (rt?.env ?? {}) as E,
    waitUntil: (p: Promise<unknown>) => {
      // Sin runtime (dev) se deja correr la promesa igual: peor sería tragarse
      // el trabajo en silencio y que nadie note que no salió el email.
      if (rt?.ctx?.waitUntil) rt.ctx.waitUntil(p);
      else void p.catch(e => console.error('waitUntil sin runtime:', e));
    },
  };
}
