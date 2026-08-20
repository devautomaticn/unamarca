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

### Precios dentro de un post

**Nunca escribas un precio nuestro a mano en un .md.** Usá los tokens, que se
resuelven contra `PRICING` al buildear: así un aumento no deja un artículo
cotizando el precio viejo (que fue exactamente lo que pasó en agosto 2026).

| Token | Vale |
|---|---|
| `{{HONORARIOS}}` / `{{HONORARIOS_2}}` | honorarios por clase / por 2 clases |
| `{{GARANTIA}}` | Garantía de Devolución por clase |
| `{{ARANCEL}}` / `{{ARANCEL_2}}` | arancel del INPI |
| `{{TOTAL}}` / `{{TOTAL_2}}` | lo que paga el cliente (honorarios + arancel) |
| `{{UMAPI}}` | valor de 1 UMAPI |
| `{{ARANCEL_POSICION}}` | excedente por posición del nomenclador (>20) |
| `{{VIGENCIA}}` | `"agosto 2026"`, el mes del valor UMAPI publicado |

- Andan en el cuerpo **y** en el frontmatter (`title`, `description`, `faqs`),
  así que también alcanzan a la meta description y al JSON-LD de `FAQPage`.
- El catálogo está en `src/lib/precios.ts`. El cuerpo lo resuelve
  `src/lib/remarkPrecios.ts` (plugin de remark) y el frontmatter, un
  `.transform()` en `src/content/config.ts`.
- **Un token mal escrito rompe el build a propósito.** Es preferible a publicar
  `{{HONORARIOOS}}` en la página de precio y que lo indexe Google.
- Los tres tokens del INPI (`{{ARANCEL}}`, `{{UMAPI}}`, `{{ARANCEL_POSICION}}`)
  salen del snapshot que se baja del portal, no de `PRICING`. **Nunca escribas
  un arancel a mano en un post**: se actualiza todos los meses. Ver más abajo.

---

## Local Development

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # Build to ./dist/
npm run preview   # Preview the built site
```

`build` corre con `--force` (limpia la caché de la content layer). No es un
capricho: los posts resuelven precios desde `PRICING` al buildear, y la caché
de `.astro/` sólo se invalida cuando cambia el .md — un cambio de precio en
`constants.ts` dejaba los artículos con el importe viejo. El sitio buildea en
dos segundos, así que la caché no compra nada.

---

## Hosting & Deployment

**Platform:** Cloudflare Pages (free tier)
**Git repo:** `https://github.com/devautomaticn/unamarca`
**Pages dashboard:** Cloudflare → Workers & Pages → `unamarca`

### How deploys work

Every push to the `main` branch triggers an automatic deployment:

1. Cloudflare detects the push
2. Runs `npm run build` (output: `./dist/`)
3. Deploys the static files globally — live in ~1–2 minutes

**You never need to manually deploy.** Just push to `main`.

### Deploy workflow

```bash
# Make your changes, then:
git add .
git commit -m "describe what you changed"
git push
```

Watch the deployment at: Cloudflare dashboard → Workers & Pages → unamarca → Deployments

### DNS & infrastructure

| Record | Type | Points to |
|--------|------|-----------|
| `unamarca.com.ar` | CNAME | `unamarca.pages.dev` (Cloudflare Pages) |
| `www.unamarca.com.ar` | CNAME | `unamarca.pages.dev` (Cloudflare Pages) |
| `vigilante.unamarca.com.ar` | A | `46.224.159.63` (Hetzner VPS) |

- **DNS managed by:** Cloudflare (nameservers: `evangeline.ns.cloudflare.com`, `harley.ns.cloudflare.com`)
- **Domain registered at:** NIC Argentina (`nic.ar`)
- **SSL:** Automatic via Cloudflare

### Redirects

Old WordPress URLs redirect to new `/blog/` paths via `public/_redirects`.
If new blog posts need redirects, add them there in the format:
```
/old-slug /blog/new-slug 301
```

---

## ⚠️ WhatsApp Messages Are a Contract

Every WhatsApp link on the site prefills a message from the catalog in
`src/lib/wa.ts`. The CRM matches those exact strings to attribute where each
conversation came from (issue #64).

**Changing a message text does not break the build or any test — it breaks
attribution silently.** Contacts stop being counted as "Web" and start landing
in "no match".

Rules:
- Never write a `wa.me` URL by hand. Use `waHref('<context>')` or one of the
  builders in `src/lib/wa.ts`.
- The floating button takes its message from the `waContext` prop on
  `<BaseLayout>`. A new page without it falls back to `float_generic`.
- The gtag `source` must equal the catalog key, so GA4 and the CRM join on the
  same value. (Exception: the EN landing has two CTAs sharing one message —
  they keep `en_landing` / `en_landing_final`.)
- Bump `CATALOG_VERSION` when you change, add, or remove a message.
- `registrar_multiclase` (una marca en más de `MAX_CLASES` clases) y
  `registrar_multimarca` (más de `MAX_MARCAS` marcas en un pedido) llevan un
  número en el texto: se matchean por prefijo, no exacto.
- Never delete an entry from `WA_LEGACY`. Old messages keep arriving from
  cached pages, saved chats and shared links.

The catalog is published at `/wa-catalog.json` (generated at build time from
`src/lib/wa.ts` by `src/pages/wa-catalog.json.ts`) so the CRM parser reads it
instead of hardcoding the strings. Do not remove that endpoint.

---

---

## Los aranceles del INPI se actualizan solos

El INPI cobra en **UMAPI** (Res. 75/2026) y el valor en pesos de la UMAPI se
ajusta **todos los meses** por IPC. Antes el número estaba escrito a mano en seis
archivos y se actualizaba de memoria: cada mes que nos olvidábamos, la página de
precio —la de más tráfico del sitio— cotizaba el arancel del mes pasado.

Ahora no hay nada que hacer a mano. `.github/workflows/aranceles-inpi.yml` corre
todos los días a las 9 de la mañana, `scripts/actualizar-aranceles.mjs` baja el
valor vigente del portal del INPI y, si cambió, commitea. El push dispara el
deploy y el sitio entero sale con el número nuevo.

```
portal del INPI ──► scripts/actualizar-aranceles.mjs
                      ├─► src/data/aranceles-inpi.json   (tabla completa + histórico)
                      │     └─► /aranceles-inpi          (la página)
                      │     └─► {{UMAPI}}, {{ARANCEL_POSICION}}
                      └─► src/data/arancel-vigente.ts    (dos números)
                            └─► PRICING.arancelInpi      (/registrar, {{ARANCEL}}, {{TOTAL}})
```

- **Los dos archivos de `src/data/` son generados. No los edites**: la próxima
  corrida los pisa. Para forzar una actualización, `npm run aranceles`.
- Son dos y no uno porque `constants.ts` termina en el bundle del navegador del
  checkout: de ahí solo puede colgar el módulo chico, no los 40 KB de la tabla.
- **El script corta con error antes que escribir un dato dudoso.** Verifica que
  el valor UMAPI del HTML por la cantidad de UMAPIs del trámite dé el importe
  que manda el endpoint; si no cierra (pasa el día que el INPI actualiza a
  medias), no escribe nada y reintenta al día siguiente.
- El mes de vigencia **no sale del calendario** sino del aviso del propio INPI
  ("a partir del 01/09/2026…"): el portal a veces tarda un par de días en dar
  vuelta la página, y el reloj nos haría guardar el valor de agosto como si
  fuera de septiembre.
- **El histórico es lo único irrecuperable**: el portal publica el valor de hoy
  y nada más. `historial[]` solo se agrega, nunca se reescribe. Si se pierde, los
  meses viejos no se pueden volver a bajar (los de junio y julio 2026 salieron
  de copias archivadas del portal).

---

## Deep links a `/registrar` (contrato con otros proyectos)

`/verificar-marca`, las campañas y proyectos externos prellenan el wizard con
query params. **`marca`, `clase` y `tipo` son repetibles y se aparean por
posición.**

| Param | Formato | Notas |
|---|---|---|
| `marca` | texto, se recorta a 80 chars | Repetible, hasta `MAX_MARCAS` (3). |
| `clase` | enteros 1–45 separados por coma | Repetible. `?clase=9,25` = una marca en dos clases. |
| `tipo` | `denominativa` \| `mixta` \| `figurativa` | Repetible. No distingue mayúsculas. Cualquier otro valor cae en `denominativa`. |
| `tel` | texto, 30 chars | Prellena WhatsApp. |
| `email` | texto, 120 chars | Prellena email. |
| `order` | ref del pedido | Retoma un pedido existente e **ignora todos los demás params**. |

```
/registrar?marca=X&clase=9,25                          una marca (legado)
/registrar?marca=A&clase=2,3&marca=B&clase=4,6         varias
/registrar?marca=A&clase=25&tipo=mixta                 con tipo
/registrar?clase=25&tipo=figurativa                    figurativa (no lleva nombre)
```

Reglas que hay que respetar al cambiar esto:

- **En una figurativa el `marca` que venga se descarta**, pero *avisando*. No
  tiene denominación ante el INPI: la referencia interna la asigna
  `renderMarcasStep1()`, igual que cuando el tipo se elige a mano en el paso 1.
  Lo que no puede volver a pasar es que el descarte sea invisible — el cliente
  se enteraba de que había elegido mal el tipo cuando el trámite ya estaba
  firmado. `pintarPorTipo()` guarda la denominación descartada y muestra el
  aviso con un botón que pasa la marca a mixta conservando el nombre.
- Un `tipo` desconocido cae en `denominativa` en silencio. Es el default seguro:
  es el único que no obliga al cliente a subir una imagen después.
- **El deep link pisa el draft guardado en `localStorage`.** Si el usuario tenía
  un pedido a medias, las marcas del link reemplazan las suyas (y se pierden las
  descripciones que hubiera cargado).

---

## La figurativa con texto (y la única corrección post-pago)

Una marca figurativa **no puede tener ni una letra en la imagen**: si la tiene,
es mixta, y presentarla como figurativa es defectuoso. El formulario no puede
mirar el archivo, y el cliente que se equivoca de tipo llega al paso 5
convencido de que acertó. Se perdió un trámite así (agosto 2026): el logo tenía
el nombre adentro, la carta poder salió con el tipo equivocado y hubo que
reemitirla a mano.

- El paso 5 pide una **declaración obligatoria** en toda figurativa: *"¿Tu imagen
  tiene alguna letra o palabra?"*. Va en positivo y con las dos salidas a la
  vista, no como una casilla en negativo — *"confirmo que NO tiene texto"* se
  tilda de taquito y no frena a nadie.
- Si contesta que **sí**, la marca se convierte en mixta ahí mismo y se le pide
  la denominación. El tipo se elige antes de pagar y ahí queda congelado, pero
  la imagen recién se sube después: mandarlo a rehacer el pedido por algo que
  **no cambia el precio** (los honorarios son por clase, no por tipo) es peor.
- El servidor arma el pedido con el snapshot del pago e **ignora el tipo y el
  nombre que manda el cliente**. La excepción vive en `corregirTipoPostPago()`
  (`src/lib/server/checkout.ts`) y es la única que existe: solo
  figurativa → mixta, solo con `corregidaAMixta: true` y una denominación no
  vacía. Sin eso la corrección se perdería en silencio, que es exactamente el
  bug que vino a arreglar. La corrección también se persiste en
  `orders.payload`, para que un `?order=REF` o un reenvío de emails no
  reconstruya la marca sin corregir.
- **Toda figurativa dispara un aviso en el email al estudio** para que alguien
  mire la imagen antes de presentar. Es la última defensa: la declaración la
  hace quien no conoce la diferencia.

---

## `/carta-poder` — rehacer un poder ya firmado

Página privada (`noindex`, fuera del sitemap, no se linkea) para cuando el poder
que firmó el cliente salió con un dato mal: el tipo de marca, una clase, el
domicilio. En vez de hacerle repetir el checkout entero, se le manda un link con
**todos los campos prellenados por query params**: ve el documento corregido, lo
firma y lo envía.

- El texto sale del mismo `src/lib/checkout/cartaPoder.ts` y el PDF del mismo
  `cartaPoderPdf.ts` que usa el paso 7 del wizard. Los dos caminos no pueden
  divergir, y el PDF que llega es idéntico al del checkout.
- **No toca nada**: ni el pedido en D1, ni el alta en Vigilante, ni los emails
  del checkout. Lo único que produce es el PDF firmado, que le llega al estudio
  por `POST /api/carta-poder` (Resend → `mike@automaticnation.com`, con el PDF
  adjunto). El cliente se descarga su copia en la pantalla de confirmación.
- El PDF se genera **en el navegador**, por lo mismo que en el checkout: el plan
  free de Pages no tiene CPU para pdf-lib (error 1102).
- Si el navegador no pudo generar el PDF, el email sale igual con los datos y un
  aviso de que hay que rehacerlo. Perder un poder que la persona ya firmó es
  peor que mandar un aviso.
- El endpoint es abierto (no hay pedido contra el cual autenticar). Lo único que
  lo protege es que la URL no se publica en ningún lado, más un tope de 3 MB en
  el cuerpo.

| Param | Notas |
|---|---|
| `nombre`, `apellido` | Se concatenan en el nombre del poder. |
| `doctipo` | `DNI` (default), `Pasaporte`, `Libreta Cívica`, `Libreta de Enrolamiento`. |
| `doc` (alias `dni`, `docnum`) | Número de documento. |
| `cuit` | CUIT/CUIL. |
| `calle`, `numero`, `piso`, `depto` | Domicilio. `piso` y `depto` son opcionales. |
| `cp` (alias `codigopostal`) , `localidad`, `provincia` | `provincia` se matchea sin acentos; `CABA` / `capital federal` caen en `Ciudad Autónoma de Buenos Aires`. |
| `marca`, `clase`, `tipo` | **Repetibles y apareados por posición**, igual que en `/registrar`: hasta `MAX_MARCAS`, `clase` acepta `25,35`. |
| `fecha` | `YYYY-MM-DD`. Sin el param, hoy en Buenos Aires. |
| `email` | Va como `reply_to` del email al estudio. |
| `ref` (alias `order`, `pedido`) | Ref del pedido original: entra en el asunto y en el nombre del PDF. |
| `motivo` | Se muestra arriba de todo, en un banner: por qué se le pide firmar de nuevo. |

```
/carta-poder?nombre=Julio+Leonardo&apellido=Guerrero&doc=23971678
  &cuit=20-23971678-5&calle=Alvarez+Condarco&numero=222&cp=M5504HCN
  &localidad=Godoy+Cruz&provincia=Mendoza
  &marca=Caminantes+de+la+Antigua+Senda&clase=41&tipo=mixta
  &ref=UM-20260818-VB3FV7&motivo=La+anterior+dec%C3%ADa+figurativa
```

---

## Alta automática en el portal Vigilante

Cuando un pedido se completa (el cliente firma y se envía la solicitud), además
de los emails el checkout **da de alta el contacto, la marca y un trámite por
clase** en `vigilante.unamarca.com.ar` vía su API externa v1.

- Cliente: `functions/_lib/vigilante.ts`. Se llama desde el `PATCH
  /api/checkout/order/:ref`, dentro de `waitUntil` (el cliente no espera al
  portal) y después de los emails.
- **La API key vive en el secret `VIGILANTE_API_KEY` de Cloudflare Pages, nunca
  en el repo ni en el navegador.** El wizard no la ve: el alta la hace la Pages
  Function. `VIGILANTE_API_BASE` es un override opcional para apuntar a otro
  entorno.
- `Idempotency-Key: alta-<ref>` — estable por pedido, así un reintento (timeout,
  500, o un PATCH repetido dentro de las 48 h que el portal retiene la clave)
  devuelve los ids del primer intento en vez de duplicar.
- **Un trámite por clase.** Una marca en 2 clases son 2 trámites; no es un
  duplicado.
- **Nunca se manda `acta`.** Nada de lo que sale del checkout se presentó
  todavía: el trámite nace `no_presentado` y el acta la carga el estudio a mano.
- **Un 201 no significa que los datos estén bien.** El portal casi nunca rechaza:
  lo raro entra igual y viene en `advertencias[]`. Se loguean y disparan un email
  al estudio, porque es el único aviso de que el mapeo se rompió.
- El resultado se guarda en la columna `orders.vigilante` (D1) para poder ver qué
  pedidos quedaron sin cargar.
- El portal ya avisa por email al estudio ante 400, 403 y 500. Nosotros avisamos
  solo lo que él no ve: advertencias de un 201, timeouts de red, y la falta de
  credencial (esto último solo en producción, para no llenar de mails los
  previews).

Si cambian los campos del paso 5 o 6 del wizard, hay que revisar el mapeo en el
PATCH: los campos que la API no conoce entran como advertencia `campos_ignorados`
y **no fallan**, así que un typo se descubre solo leyendo el email de aviso.

---

## Guía DIY (`/guia/<token>`) — producto privado

Guía online del trámite del INPI, con las herramientas de Vigilante embebidas.
**$25.000, se vende SOLO por WhatsApp** a leads que rebotaron por precio: no se
linkea desde ningún lado, va con `noindex` y está fuera del sitemap.

- **El token es la credencial.** No hay login. Un token por compra, revocable.
  La URL se le entrega al cliente ANTES de pagar: hasta que se acredita muestra
  la pantalla de `<Bloqueo>`, sin filtrar ni un paso del contenido.
- El alta la hace el **agente de WhatsApp** (otro proyecto) contra cinco
  endpoints en `src/pages/api/guia/`. Contrato completo en
  `docs/spec_guia_agente.md` — **ese archivo es el que se comparte con el otro
  proyecto**.
- Los pagos de Mercado Pago se acreditan por la rama `GU-` del webhook que ya
  existía. Las transferencias las acredita el agente mirando el comprobante, y
  cada una dispara un mail a Mike para cruzar contra el banco.
- **Todo valor del cliente se muestra como ejemplo, nunca como instrucción**
  ("ej.: 4, 3 o 1", no "poné 4"). Quien presenta la solicitud es él. Ver la nota
  de arriba de `src/lib/guia/cliente.ts`.
- Las herramientas embebidas pegan a proxies en `src/pages/api/` porque las APIs
  de Vigilante rechazan con 403 sin el header `X-Requested-With` y no mandan
  CORS. `astro dev` NO corre las Pages Functions: para probarlas hay que usar
  `npx wrangler pages dev dist`.

### ⚠️ Ya no existe `functions/`

Las Pages Functions se migraron a **rutas de Astro** (`src/pages/api/**`) el
2026-08-17, porque el adaptador de Cloudflare emite `dist/_worker.js` y Pages en
modo avanzado ignora por completo `functions/`. **No volver a crear ese
directorio: no se ejecutaría.**

- Cada ruta lleva `export const prerender = false` y saca los bindings con
  `runtime(locals)` de `src/lib/server/runtime.ts`.
- Las librerías compartidas viven en `src/lib/server/`.
- `security.checkOrigin` está en `false` en `astro.config.mjs`: nuestras rutas
  son APIs JSON llamadas por sistemas externos (webhook de MP, agente de
  WhatsApp) con su propia autenticación. Con la protección activada, un webhook
  sin `Content-Type: application/json` se comía un 403 antes de llegar al código.

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
- [x] Set up redirects from WordPress `/<slug>` → `/blog/<slug>` (done via `public/_redirects`)
