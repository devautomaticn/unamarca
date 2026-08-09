// Publica el catálogo de mensajes de WhatsApp en /wa-catalog.json para que el
// parser de atribución del CRM (#64) lo lea en vez de hardcodearlo.
//
// Se genera desde src/lib/wa.ts en cada build: si alguien cambia un copy, el
// JSON cambia con el deploy y la atribución no se entera de nada. Ese es el
// punto — no borres este endpoint.
//
// Es público a propósito (no hay nada sensible: es copy de marketing y dos
// números que ya están en toda la web). Queda fuera del sitemap y bloqueado en
// robots.txt para que no compita por indexación.

import type { APIRoute } from 'astro';
import { buildCatalogExport } from '../lib/wa';

export const GET: APIRoute = () =>
  new Response(JSON.stringify(buildCatalogExport(), null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Robots-Tag': 'noindex',
    },
  });
