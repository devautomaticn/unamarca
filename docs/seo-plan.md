# UnaMarca — SEO Plan

> Reference this file every time you work on SEO for UnaMarca.
> Update it as posts are published, rankings change, or strategy evolves.

---

## Context

- **Site:** `https://unamarca.com.ar`
- **Business:** Trademark registration service in Argentina (via INPI)
- **SEO goal:** Organic traffic from entrepreneurs and businesses looking to register or protect a brand
- **Top competitors:** `marcasregistro.com.ar`, `registratumarca.com.ar`, `idenbiz.com`, `abogadospymes.com.ar`
- **Unbeatable competition:** `argentina.gob.ar` and `portaltramites.inpi.gob.ar` dominate positions 1–4 on all main keywords — do not target head-on

---

## DataForSEO Access

Used for keyword research, SERP analysis, and competitor research before writing each post.

- **Login:** `dev@automaticnation.com`
- **Password:** `e9a3a819c09f4195`
- **API base URL:** `https://api.dataforseo.com/v3/`
- **Location code for Argentina:** `2032`
- **Language code:** `es`

**Endpoints used:**
- `dataforseo_labs/google/keyword_ideas/live` — keyword ideas from seed keywords
- `dataforseo_labs/google/related_keywords/live` — related keywords for a seed
- `serp/google/organic/live/advanced` — check who ranks for a keyword

---

## Strategic Pillars

1. **Target the government gap** — Government sites explain bureaucracy. UnaMarca sells simplicity. Every post frames the service as the easier path, with a clear CTA.
2. **Win informational keywords first** — Build authority with how-to and explainer content before competing on commercial keywords.
3. **Internal linking** — Every post links to at least 2 others. All posts audited and updated April 2026.
4. **Be the primary source on INPI changes** — Publish accurate, timely updates on INPI regulations. This is how authority and backlinks build naturally in this niche.
5. **JSON-LD business info** — Fill in real phone, email, address in `index.astro` to unlock rich results in Google.

---

## Backlink Strategy

Can't manufacture links easily — buying links is risky. Focus on:

1. **HARO / journalist requests** — Respond to journalists writing about emprendedorismo or legal topics in Argentina. One link from iProfesional or La Nación is worth more than 50 directory links.
2. **Reddit Argentina / emprendedor forums** — `r/AskArgentina` ranks for relevant keywords. Be genuinely helpful in trademark threads with natural references to the site.
3. **Guest posts on adjacent blogs** — Tienda Nube, MercadoLibre seller communities, marketing blogs for emprendedores. Offer content like "cómo proteger tu marca si vendés en Tienda Nube".
4. **Be the INPI change tracker** — When journalists cover INPI regulation changes, they need sources. UnaMarca covered UMAPI and Res. 583/25 early — keep doing this.

---

## Article Writing Workflow

Follow this process for every new blog post:

### Step 1 — Keyword research with DataForSEO
Before writing, query DataForSEO to validate:
- Search volume and keyword difficulty for the target keyword
- Related keywords worth including naturally
- Who currently ranks in the SERP (to find the content gap)

```bash
# Keyword ideas
curl -s --user "dev@automaticnation.com:e9a3a819c09f4195" \
  -X POST "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_ideas/live" \
  -H "Content-Type: application/json" \
  -d '[{"keywords": ["your seed keyword"], "language_code": "es", "location_code": 2032, "limit": 30}]'

# SERP check
curl -s --user "dev@automaticnation.com:e9a3a819c09f4195" \
  -X POST "https://api.dataforseo.com/v3/serp/google/organic/live/advanced" \
  -H "Content-Type: application/json" \
  -d '[{"keyword": "your keyword", "language_code": "es", "location_code": 2032, "depth": 10}]'
```

### Step 2 — Write the draft
Follow the rules in **Rules for New Blog Posts** below.

### Step 3 — Review through three lenses (iterate as needed)

**Lens 1 — Legibility**
- Is the intro hook strong? Does it put the reader in a scenario they recognize?
- Are H2s scannable and informative?
- Is the closing paragraph a real bridge to the CTA, not just a repeat of what was said?
- Are there any awkward or passive phrases that can be tightened?

**Lens 2 — SEO**
- Primary keyword in: title, meta description, first paragraph, at least one H2
- Meta description 150–160 chars
- At least 3 internal links to other posts
- Does the content fill a gap that current SERP results don't?
- Are there related keywords (from DataForSEO) that can be included naturally?

**Lens 3 — Accuracy**
- Are all legal claims correct under Argentine law (Ley 22.362, INPI resolutions)?
- Are all INPI process details current (especially post Resolución 583/25, March 2026)?
- Are cost figures current (UMAPI system, effective April 1 2026: 100 UMAPIS ≈ $36.000 ARS, updated monthly)?
- If citing timelines: new process is ~2 months without oppositions
- Cross-check any factual claims against official sources (boletinoficial.gob.ar, argentina.gob.ar/inpi) when in doubt

### Step 4 — Deploy
```bash
git add src/content/blog/[slug].md
git commit -m "Add blog post: [title]"
git push
```
Cloudflare auto-deploys in ~1 minute.

### Step 5 — Update this file
Mark the post as ✅ Published in the Content Roadmap table.

---

## Keyword Targets

| Keyword | Monthly Volume | KD | Competition | Notes |
|---|---|---|---|---|
| registrar una marca en argentina | 2,900 | 10 | MEDIUM | Biggest opportunity — very low KD |
| registro de marcas argentina | 3,600 | 22 | MEDIUM | Core commercial keyword |
| registrar marca argentina | 2,900 | 14 | MEDIUM | Core commercial keyword |
| inpi registrar marca | 1,600 | 22 | MEDIUM | High intent |
| inpi consulta de marcas | 1,600 | 39 | LOW | Informational |
| como patentar una marca | 720 | 17 | HIGH | People confuse patentar/registrar — dedicated post published April 2026 |
| consulta de marcas inpi | 210 | 29 | MEDIUM | Informational |
| buscador de marcas registradas | 170 | 48 | MEDIUM | Informational |
| cuanto sale registrar una marca en inpi | 110 | 2 | MEDIUM | Very low KD — existing post covers this |

*Data source: DataForSEO, April 2026. Location: Argentina (2032). Language: Spanish.*

---

## Published Blog Posts

| Status | Slug | Target Keyword | Volume | Notes |
|---|---|---|---|---|
| ✅ Published | `cuanto-sale-registrar-una-marca` | cuanto sale registrar una marca en inpi | 110 | Updated April 2026 with UMAPI system |
| ✅ Published | `inpi-buscador-de-marcas-guia-para-registrar-tu-marca-en-argentina` | inpi marcas / inpi consulta de marcas | 1,600–5,400 | High value |
| ✅ Published | `clases-de-marcas-guia-para-registrar-tu-marca-en-argentina` | clases de marcas inpi | Low | Covers niche well |
| ✅ Published | `como-saber-si-una-marca-esta-registrada-facilmente` | como saber si una marca esta registrada | Moderate | Good informational |
| ✅ Published | `como-registrar-marca-y-logo-en-argentina` | registrar marca argentina | 2,900 | Core keyword |
| ✅ Published | `que-nombre-le-puedo-dar-a-mi-emprendimiento` | que nombre poner a mi emprendimiento | Low | Top-of-funnel |
| ✅ Published | `como-registrar-una-marca-en-argentina-paso-a-paso` | registrar una marca en argentina | 2,900 | KD 10 — biggest opportunity |
| ✅ Published | `cuanto-tarda-registro-marca-argentina` | cuanto tarda registro marca argentina | Low | Covers Resolución 583/25 timeline |
| ✅ Published | `que-pasa-si-alguien-usa-mi-marca-sin-registrar` | que pasa si alguien usa mi marca | Low | High conversion intent |

---

## Content Roadmap

| Status | Post Title | Slug | Target Keyword | Volume | KD | Target Date |
|---|---|---|---|---|---|---|
| ✅ Published | Nombre comercial vs marca registrada: ¿cuál necesito? | `nombre-comercial-vs-marca-registrada-argentina` | nombre comercial argentina | Low | Low | April 2026 |
| ✅ Published | Cómo renovar una marca registrada en Argentina | `como-renovar-marca-registrada-argentina` | como renovar marca registrada | Low | Low | April 2026 |
| ✅ Published | Registro de marca para e-commerce en Argentina | `registro-marca-ecommerce-argentina` | registro marca ecommerce argentina | Low | Low | April 2026 |
| ✅ Published | Cómo patentar una marca en Argentina | `como-patentar-una-marca-en-argentina` | como patentar una marca | 720 | 17 | April 2026 |
| ✅ Published | Boletín de Marcas del INPI: qué es y cómo vigilar tu marca | `boletin-de-marcas-inpi` | boletin de marcas inpi | 140 | 19 | April 2026 |
| ✅ Published | Cómo registrar un nombre comercial en Argentina | `como-registrar-nombre-comercial-argentina` | como registrar un nombre comercial | 110 | Low | April 2026 |

---

## Technical SEO Checklist

- [x] Sitemap at `/sitemap-index.xml` — auto-generated by `@astrojs/sitemap`
- [x] `robots.txt` pointing to sitemap
- [x] Canonical URLs on all pages
- [x] 301 redirects from old WordPress URLs → `/blog/[slug]`
- [x] JSON-LD structured data on landing page and blog posts
- [x] Sitemap submitted to Google Search Console — 10 URLs discovered (April 2026)
- [x] Old WordPress sitemap (`sitemap_index.xml`) removed from Search Console
- [x] Internal links audited and added across all posts (April 2026)
- [ ] Fill in real business info in JSON-LD (phone, email, address, priceRange)
- [ ] Add `og:image` → `public/og-default.png` (1200×630px)
- [ ] Re-verify ownership in Google Search Console post-migration
- [ ] Request indexing on key pages via Search Console URL inspection tool

---

## Rules for New Blog Posts

1. Filename = URL slug — **never rename after publishing**
2. Slugs: lowercase, hyphens only, no accents, no trailing slashes
3. Every post needs unique `title`, `description` (150–160 chars), `pubDate`, `tags`
4. End every post with a WhatsApp CTA linking to the contact number
5. Link to at least 3 other existing blog posts internally
6. Target one primary keyword per post — use it in the title, first paragraph, and at least one H2
7. Write in Argentine Spanish — use "vos" forms (podés, tenés, hacés), not "tú"
8. Tone: direct, practical, no legal jargon — frame UnaMarca as the simpler path
9. Always check accuracy against current INPI rules before publishing (see Lens 3 above)
