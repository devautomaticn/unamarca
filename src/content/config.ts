import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { aplicarPrecios } from '../lib/precios';

/** Texto de frontmatter con tokens de precio (`{{HONORARIOS}}`) resueltos al
 *  buildear. El cuerpo del post lo resuelve el plugin de remark; esto cubre lo
 *  que no pasa por markdown: el título, la meta description y las FAQ, que
 *  además alimentan el JSON-LD de FAQPage. Ver `src/lib/precios.ts`. */
const textoConPrecios = z.string().transform(s => aplicarPrecios(s, 'frontmatter'));

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: textoConPrecios,
    description: textoConPrecios,
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).optional().default([]),
    faqs: z
      .array(z.object({ question: textoConPrecios, answer: textoConPrecios }))
      .optional(),
  }),
});

export const collections = { blog };
