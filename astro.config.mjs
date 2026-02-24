import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://unamarca.com.ar',
  integrations: [
    sitemap(),
  ],
  output: 'static',
});
