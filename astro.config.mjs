import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://unamarca.com.ar',
  integrations: [
    sitemap({
      // /registrar excluido mientras el pago sea placeholder (spec self-checkout §3)
      filter: (page) => !page.includes('/whatsapp/') && !page.includes('/registrar/'),
    }),
  ],
  output: 'static',
});
