import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

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
  // ⚠️ NO agregar el adaptador de Cloudflare acá sin migrar antes `functions/`.
  // El adaptador emite `dist/_worker.js`, y Cloudflare Pages en modo avanzado
  // IGNORA por completo el directorio `functions/`: se caerían el checkout, el
  // webhook de Mercado Pago, el proxy de relevamiento y el nomenclador.
  // Verificado el 2026-08-17: con `_worker.js` presente, /api/* devuelve el
  // HTML de la home. Ver docs/spec_guia_agente.md §Pendiente.
  output: 'static',
});
