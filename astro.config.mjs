import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://unamarca.com.ar',
  integrations: [
    sitemap({
      // /guia/ es privada: se vende por WhatsApp, no se linkea desde ningún
      // lado y va con noindex. Fuera del sitemap.
      filter: (page) =>
        !page.includes('/whatsapp/') &&
        !page.includes('/wa-catalog.json') &&
        !page.includes('/guia/'),
    }),
  ],
  // El sitio sigue siendo estático: todas las páginas públicas se prerenderizan
  // al buildear y el SEO no cambia. El adaptador está para las rutas que sí
  // necesitan servidor, que llevan `export const prerender = false`:
  // `/api/**` y `/guia/[token]` (los tokens nacen cuando alguien compra, no
  // cuando corre el build).
  //
  // ⚠️ Ya no existe `functions/`: con el adaptador, Cloudflare Pages entra en
  // modo avanzado (`_worker.js`) e ignora por completo ese directorio. Las
  // Pages Functions se migraron a `src/pages/api/**` el 2026-08-17. No volver a
  // crear `functions/`: no se ejecutaría.
  // Astro bloquea por defecto los POST cuyo `origin` no coincide con el sitio,
  // como protección CSRF de formularios. Acá estorba: nuestras rutas son APIs
  // JSON que llaman sistemas externos (el webhook de Mercado Pago, el agente de
  // WhatsApp) y cada una tiene su propia autenticación — HMAC en el webhook,
  // Bearer en las de la guía. Con esto activado, un webhook de MP sin
  // `Content-Type: application/json` se comía un 403 antes de llegar al código.
  // La única página por-request que tenemos (/guia/[token]) no postea formularios.
  security: { checkOrigin: false },

  output: 'static',
  adapter: cloudflare({ imageService: 'passthrough' }),
});
