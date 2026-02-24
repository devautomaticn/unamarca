# UnaMarca — Project Documentation

## Overview

Static site for **UnaMarca**, a trademark registration service in Argentina
(Servicio de registro de marcas en Argentina). Built with Astro, deployed as a
fully static site.

**Live domain:** `https://unamarca.com.ar`

---

## Tech Stack

| Layer       | Technology                                |
|-------------|-------------------------------------------|
| Framework   | [Astro](https://astro.build) v5           |
| Rendering   | Static (SSG) — zero client-side JS        |
| Content     | Astro Content Collections (glob loader)   |
| Styling     | Vanilla CSS (`src/styles/global.css`)     |
| Sitemap     | `@astrojs/sitemap` — auto-generated       |
| Fonts       | Inter via Google Fonts                    |

---

## Project Structure

```
/
├── public/
│   ├── favicon.svg          # Site favicon
│   └── robots.txt           # Points crawlers to sitemap
│
├── src/
│   ├── content/
│   │   ├── config.ts        # Content collection schema (blog)
│   │   └── blog/            # ← One .md file per blog post
│   │       └── [slug].md
│   │
│   ├── layouts/
│   │   └── BaseLayout.astro # Shared layout: <head>, header, footer
│   │
│   ├── pages/
│   │   ├── index.astro      # Landing page (/)
│   │   └── blog/
│   │       ├── index.astro  # Blog listing (/blog)
│   │       └── [slug].astro # Individual post (/blog/[slug])
│   │
│   └── styles/
│       └── global.css       # All styles (no CSS modules / Tailwind)
│
├── astro.config.mjs          # Astro config — site URL + integrations
├── package.json
└── CLAUDE.md                 # This file
```

---

## How to Add a New Blog Post

1. Create a new file in `src/content/blog/` named with the exact URL slug:
   ```
   src/content/blog/mi-nuevo-articulo.md
   ```

2. Add the required frontmatter at the top:
   ```yaml
   ---
   title: "Título del artículo"
   description: "Meta description del artículo (150–160 caracteres ideales)"
   pubDate: 2026-03-01
   tags: []
   ---
   ```

3. Write the post content in Markdown below the frontmatter.

4. The post will automatically appear at `/blog/mi-nuevo-articulo` and be
   included in the sitemap on the next build.

**Rules for slugs:**
- Use only lowercase letters, numbers, and hyphens
- No spaces, no accented characters, no trailing slashes
- The slug in the filename **is** the final URL — do not change it after publishing

---

## Local Development

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # Build to ./dist/
npm run preview   # Preview the built site
```

---

## ⚠️ SEO is the Top Priority

This site depends on organic search traffic. Every change must preserve:

### 1. Meta tags
- Every page must have a unique `<title>` and `<meta name="description">`
- Both are set via the `title` and `description` props on `<BaseLayout>`
- Blog posts use: `[Post Title] | UnaMarca`

### 2. Canonical URLs
- Set via the `canonicalURL` prop on `<BaseLayout>`
- Must always match the actual public URL of the page
- Blog posts: `https://unamarca.com.ar/blog/[slug]`
- Home: `https://unamarca.com.ar`
- Blog index: `https://unamarca.com.ar/blog`

### 3. Sitemap
- Generated automatically by `@astrojs/sitemap` at build time → `/sitemap-index.xml`
- The `site` option in `astro.config.mjs` must always be set to the correct
  production domain
- `public/robots.txt` references the sitemap — do not remove or change it

### 4. Slug structure
- Original WordPress slugs are preserved exactly in the filenames
- **Never rename a .md file** after it has been indexed — this breaks incoming
  links and rankings
- If a URL must change, set up a redirect (e.g., Netlify `_redirects` or
  Vercel `vercel.json`)

### 5. Structured data (JSON-LD)
- Landing page: `LegalService` + `WebSite` schemas → update when real business
  info (phone, email, address) is available
- Blog posts: `Article` schema — auto-generated from frontmatter

### 6. Open Graph / Twitter Card
- Set via `BaseLayout.astro` using page props
- Add a real `og:image` at `/public/og-default.png` (1200×630px recommended)
  before going live

---

## Pending Before Launch

- [ ] Fill in all `[FILL_IN]` placeholders in `src/pages/index.astro`
- [ ] Update `title` and `description` in `BaseLayout.astro` defaults if needed
- [ ] Update JSON-LD in `index.astro` with real phone, email, address, priceRange
- [ ] Add a real `og:image` → `public/og-default.png` (1200×630px)
- [ ] Replace `public/favicon.svg` with the actual brand favicon
- [ ] Update footer links / add Privacy Policy / Terms if required
- [ ] Set up redirects if original WordPress posts were at `/<slug>` (not `/blog/<slug>`)
