# Spec — Self-Checkout de Registro de Marca (v1)

**Status:** Draft — approved for initial implementation
**Date:** 2026-07-03
**Owner:** Mike

---

## 1. Overview

A commercial, frictionless self-checkout wizard where an end user requests the
registration of their trademark (marca denominativa, 1 clase, persona humana)
in a single session: enter the marca → pick a clase → email + WhatsApp →
confirm the order (+ optional garantía) → (payment placeholder) → enter titular data →
**sign the carta poder in-browser** → done. UnaMarca receives everything
needed to file before INPI, including the signed carta poder PDF, with zero
async back-and-forth.

**Guiding principles:**
- The biggest drop-off risk is any step that requires the user to come back
  later. Everything — including the signature — happens inside one wizard, in
  one session.
- **Minimal friction before payment.** Pre-payment inputs are only: marca,
  clase, email, WhatsApp, and plan. All titular/domicilio data comes after
  payment — and because email + WhatsApp were captured before it, we can
  always recover users who pay but don't finish the post-payment data.

---

## 2. Scope

### In scope (v1)

- New wizard page with 6 steps (see §4) — only marca, clase, email, WhatsApp
  and plan before payment; titular data after payment
- Tipo de persona: **Humana only** (field visible, fixed/disabled)
- Tipo de marca: **Denominativa only** (field visible, fixed/disabled)
- Clase: **single select**, official Nice class names
- Single base price (honorarios $40.000) + **Garantía de Devolución as an
  order-bump upsell** ($7.000): if INPI denies the registration, the $40.000
  honorarios are refunded (arancel never refunded). Worst case for UnaMarca:
  the $7.000 covers transaction costs
- When the garantía is NOT selected, the base order card shows a red-cross
  line ("Sin garantía de devolución…") — loss-aversion nudge
- Vigilancia shown with strikethrough price → "Gratis con UnaMarca"
- **Payment placeholder** — no Mercado Pago integration yet; a skip button
  advances the wizard (see §6)
- In-browser carta poder: live preview with the user's data + canvas signature
- Server-side PDF generation of the signed carta poder
- Email delivery: admin notification (data + PDF) and client confirmation
  (PDF copy), via the existing Resend setup

### Out of scope (v1) — future versions

- Mercado Pago integration (v2 — the placeholder step is designed to be
  swapped for MP Checkout Pro without changing the wizard structure)
- Personas jurídicas (different carta poder wording, representante legal)
- Multiple clases / multi-class discount
- Multiple titulares
- Marcas mixtas / figurativas (logo)
- Trademark search integrated into the funnel
- Oposiciones gestión quoting flow (happens later, off-platform: all orders
  include novedades por email; when an oposición arrives we notify and quote
  honorarios de gestión at that moment)
- Order database / resume-by-link (v1 is stateless, single-session)

### Escape hatches (v1)

Cases outside scope get a visible WhatsApp exit instead of a dead end:

- "¿La marca es para una empresa (SRL, SA, etc.)? Escribinos por WhatsApp"
- "¿Necesitás registrar en más de una clase? Escribinos por WhatsApp"
- "¿No sabés qué clase elegir? Escribinos por WhatsApp"

---

## 3. Page & routing

- **Route:** `/registrar` (new Astro page, e.g. `src/pages/registrar.astro`)
- Single page, wizard steps implemented as sections toggled with vanilla JS
  (consistent with the site's zero-framework approach)
- Draft state persisted to `localStorage` so an accidental refresh doesn't
  lose progress (cleared on successful submission)
- **SEO:** `noindex` and excluded from sitemap while payment is a placeholder
  (same mechanism used for `/whatsapp`). Flip to indexed at launch with real
  payment.
- The existing `/formularioregistro` page stays as-is (manual/WhatsApp-driven
  intake); this wizard is the commercial funnel. Consolidation decided later.

---

## 4. Wizard steps

Progress indicator visible at all times (e.g. "Paso 2 de 6"). Each step
validates before advancing.

### Paso 1 — Tu marca

| Field | Type | Rules |
|---|---|---|
| Nombre de la marca | text | required, trimmed; placeholder "UnaMarca"; shown back everywhere in quotes + uppercase exactly as it will be filed |
| Tipo de persona | select, **disabled** | fixed: `Humana`. Helper: "Por ahora el registro online está disponible para personas humanas." + WhatsApp escape hatch for empresas |
| Tipo de marca | select, **disabled** | fixed: `Denominativa`. Helper: "Registramos el nombre de tu marca (sin logo)." |

(La clase se elige en el Paso 3 — ver abajo. Decisión: a esa altura el usuario
ya está invertido en el flujo y toma la decisión de clase en el momento.)

### Paso 2 — Contacto (pre-pago)

Only the two fields needed to reach the user if they abandon after paying:

| Field | Type | Rules |
|---|---|---|
| Email | email | required, format-validated. "Acá te enviaremos todas las novedades del trámite" |
| WhatsApp | tel | required, AR mobile format |

### Paso 3 — Tu pedido (checkout)

**Clase selector at the top** (moved here from Paso 1): single-select
searchable dropdown, options shown as `Clase {n} — {nombre corto}` (short
recognizable names, e.g. "Clase 3 — Cosméticos, perfumería, limpieza"). The
full official Nice heading lives in the shared module (`textoOficial`) and is
searchable too — it's what matters for the eventual filing, not for the UI.
WhatsApp escape hatches for "no sé cuál elegir" and multi-class.

Below it, one base order card + one upsell checkbox card (order bump), instead
of competing plan tiers:

**Card "Registro de marca" — $40.000 (honorarios, + arancel INPI):**
- ✔ Presentación de la solicitud ante el INPI
- ✔ Novedades del trámite por email
- ✔ Vigilancia de marca ~~$XX.XXX~~ **Gratis**
- Dynamic last line:
  - garantía OFF → ✗ (red) "Sin garantía de devolución: si el INPI deniega el
    registro, los honorarios no se devuelven"
  - garantía ON → ✔ (green) "Garantía de Devolución incluida: si el INPI
    deniega el registro, te devolvemos los honorarios"

**Upsell card (checkbox, unchecked by default):**
"Sumá la Garantía de Devolución — +$7.000. Si el INPI deniega tu registro, te
devolvemos los $40.000 de honorarios."

Economics: garantía payout refunds honorarios only (never the arancel), so
UnaMarca's worst case keeps the $7.000, covering transaction costs.

Pricing values are **config constants**, not hardcoded in markup
(see §7 — they will change with inflation and UMAPI updates).

Order summary always visible: `Honorarios + Arancel INPI (1 clase) = Total`.
The arancel is always a separate, labeled line ("el arancel se paga al INPI")
— required for price-transparency compliance and it builds trust.

**Mandatory scope disclaimer, visible at this step (not buried in terms):**

> "El registro de una marca está sujeto a la resolución del INPI. Durante el
> trámite pueden surgir oposiciones de terceros u observaciones; te
> notificaremos y podrás decidir cómo continuar."

**Garantía fine print (upsell):** link to terms defining
exactly what triggers the devolución de honorarios (arancel is never
refunded). Terms content: pending legal drafting — see §10.

**Vigilancia strikethrough price:** must match the real standalone price
charged on vigilante.unamarca.com.ar (credible anchor, not a fake one).

### Paso 4 — Pago (placeholder in v1)

See §6.

### Paso 5 — Datos del titular (post-pago)

All fields feed both the INPI solicitud and the carta poder — accuracy
matters, validate hard. Intro copy: "Ya casi está. Estos datos son necesarios
para la carta poder y la presentación de tu solicitud ante el INPI."

This is the full dataset needed for the eventual INPI filing (email/WhatsApp
were already captured at Paso 2 and are not repeated here):

| Field | Type | Rules |
|---|---|---|
| Nombre | text | required. Helper: "Tal como figura en tu documento" |
| Apellido | text | required |
| Tipo de documento | select | `DNI` (default) / `Pasaporte` / `Libreta Cívica` / `Libreta de Enrolamiento` |
| Número de documento | text | required. If tipo = DNI: 7–8 digits, numeric-only input |
| CUIT / CUIL | text (auto-format `XX-XXXXXXXX-X`) | required. Validate: (a) check digit (mod-11), (b) if tipo = DNI, middle digits must equal the document number. Inline error if mismatch |
| Género | select | `Masculino` / `Femenino` / `Otro`, required |
| Estado civil | select | `Soltero/a` / `Casado/a` / `Viudo/a` / `Divorciado/a`, required |
| Nombre del cónyuge | text | only visible + required when estado civil = `Casado/a` |
| Domicilio — País | text | default `Argentina`, editable |
| Domicilio — Calle | text | required |
| Domicilio — Número | text | required |
| Domicilio — Piso / Depto | text | optional |
| Domicilio — Localidad | text | required |
| Domicilio — Código Postal | text | required |
| Domicilio — Provincia | select (24 jurisdicciones) | required |

The carta poder renders `{{tipoDocumento}} {{numeroDocumento}}` (e.g. "DNI
22730331", "Pasaporte AB123456"). Género / estado civil / cónyuge don't appear
in the carta poder — they're captured for the INPI presentation and stored in
the order's completion data.

### Paso 6 — Carta poder: revisión y firma

1. **Preview:** the fully populated carta poder rendered as HTML on screen,
   from the same template used for the PDF (§5). "Revisá que todos los datos
   sean correctos" + an **"Editar mis datos"** link back to Paso 2 (returning
   preserves all state).
2. **Signature:** canvas signature pad (touch + mouse), with "Borrar y firmar
   de nuevo". Submit disabled until a signature is drawn.
3. **Submit:** POST all data + signature PNG (data URL) to the backend (§7).
   Server generates the PDF, sends both emails, returns the order reference.

### Confirmación (final screen)

- "¡Listo! Recibimos tu solicitud." + order reference (e.g. `UM-20260703-XXXX`)
- "Te enviamos una copia de tu carta poder firmada a {email}."
- "Presentaremos tu solicitud ante el INPI dentro de las próximas 48 horas
  hábiles y te enviaremos todas las notificaciones del trámite por email."
- No upsells on this screen (v1).

---

## 5. Carta poder — template

Templatized from the real document used in production (María Cristina Zajac
example). One source of truth for the text, rendered two ways: HTML preview
(Paso 5) and PDF (server).

### Template text

```
Sres.
Instituto Nacional de la Propiedad Industrial - INPI - Argentina

A los {{dia}} días del mes de {{mes}} de {{anio}}, yo, {{nombreApellido}},
DNI {{dni}}, CUIT/CUIL {{cuit}}, con domicilio en {{calle}} {{numero}}{{pisoDepto}},
Código Postal {{codigoPostal}}, {{localidad}}, Provincia de {{provincia}},
Argentina, por la presente autorizo expresamente al Dr. Michael Alan Simmons,
DNI 38.536.168, CUIT 20-38536168-9, con domicilio en Juan Francisco Seguí 4635,
Ciudad Autónoma de Buenos Aires, para que en mi nombre y representación:

  • Solicite el registro de la marca “{{marcaNombre}}” ante el Instituto
    Nacional de la Propiedad Industrial (INPI) en la clase {{clase}} de la
    Clasificación Internacional de NIZA;
  • Realice el seguimiento del trámite;
  • Conteste vistas, observaciones y oposiciones;
  • Presente escritos, recursos y cualquier otra gestión necesaria hasta la
    finalización del trámite.

La presente autorización se otorga a los efectos de que la marca sea
registrada a mi nombre.

{{firma — signature image}}
_________________________
{{nombreApellido}}
DNI {{dni}}
```

### Template rules

- **Fecha** generated at signing time, day/year as numbers, month spelled out
  in Spanish ("A los 3 días del mes de julio de 2026").
- **Marca** rendered in quotes, uppercase, exactly as entered (after trim).
- **Clase:** template supports singular/plural ("en la clase 25" / "en las
  clases 3 y 44") so multi-class in v2 needs no rewrite. v1 always singular.
- **Apoderado block** (name, DNI, CUIT, domicilio of Michael Alan Simmons):
  config constants, never inline in the template.
- The "vistas, observaciones y oposiciones" clause stays verbatim — it means
  no new paperwork is needed when an oposición later requires gestión.
- PDF: A4, generated server-side with `pdf-lib` in the Pages Function;
  signature PNG composited above the signature line, aclaración + DNI below.

---

## 6. Payment placeholder (v1)

Paso 4 renders a payment screen that looks final but does not charge:

- Order summary (plan + arancel + total)
- A disabled/visual "Pagar con Mercado Pago" button (sets the expectation of
  the real flow)
- A clearly functional button: **"Continuar"** → advances to Paso 5
- The submission payload carries `payment: { status: 'skipped', provider: null }`
  so the admin email flags the order as **PAGO PENDIENTE** and the schema
  already has the shape MP data will fill in v2
- v2 swap: replace the step's body with MP Checkout Pro redirect; webhook
  becomes source of truth; `payment.status` becomes `approved | pending`.
  Wizard structure, steps, and payload schema don't change.

---

## 7. Architecture

```
src/pages/registrar.astro          ← wizard page (markup + vanilla JS)
src/lib/checkout/constants.ts      ← pricing, apoderado data, vigilancia anchor price
src/lib/checkout/nizaClasses.ts    ← 45 official Nice class names (shared)
src/lib/checkout/cartaPoder.ts     ← template text + variable interpolation (shared)
src/lib/checkout/cuit.ts           ← CUIT check-digit + DNI cross-validation (shared)
functions/api/checkout/submit.ts   ← Pages Function: validate → PDF → emails
```

- **Shared modules:** the carta poder template, class list, and CUIT
  validation are imported by both the Astro page (preview, client validation)
  and the Pages Function (server validation, PDF) — one source of truth.
  Client-side validation is UX; the Function re-validates everything.
- **Endpoint** `POST /api/checkout/submit` (single, stateless — mirrors the
  existing `submit-form.ts` pattern):
  - Input: `{ marca, clase, titular, domicilio, contacto, plan, payment, firmaDataUrl }`
  - Server: re-validate all fields (incl. CUIT) → generate order ref
    `UM-YYYYMMDD-XXXX` → render carta poder PDF with `pdf-lib` → send emails
    via Resend → respond `{ success, orderRef }`
  - Reject signature payloads over a sane size cap (e.g. 500 KB)
- **Emails (Resend, existing `RESEND_API_KEY`):**
  1. **Admin** (`mike@automaticnation.com`): full order data (reuse the
     existing email HTML style), plan chosen, `PAGO PENDIENTE` banner in v1,
     signed carta poder PDF attached, reply-to set to the client
  2. **Client:** confirmation with order ref, what happens next ("presentamos
     dentro de las 48hs hábiles"), carta poder PDF attached
- **Storage:** v1 has no database; the emails are the record. (v1.5 candidate:
  persist order JSON + PDF to R2/D1 — do this before real payment volume.)

---

## 8. Data & privacy

The wizard collects DNI, CUIT, domicilio, and a handwritten signature —
personal data under Ley 25.326. Requirements:

- Privacy policy page published and linked from the wizard **before launch**
  (already on the CLAUDE.md pre-launch list; this makes it mandatory)
- Checkbox at Paso 2 or 5: acceptance of términos y política de privacidad
- HTTPS everywhere (already true via Cloudflare)
- Signature/PDF transits only through the Function → Resend; no third-party
  analytics on wizard steps that capture field values

---

## 9. Copy & legal requirements (summary)

- Advertised price framing: "Honorarios $40.000 **+ arancel INPI**" —
  arancel always visible as its own line, never absorbed into a teaser price
- Scope disclaimer at Paso 3 (verbatim in §4) — the user accepts INPI-outcome
  risk knowingly; UnaMarca is not responsible for the success of the solicitud
- Naming: "Registro de marca" + "Garantía de Devolución" (upsell) — the
  no-garantía state is shown factually on the order card, never as a tier name
- Garantía terms page (upsell): covers devolución de
  **honorarios** on denegatoria; arancel excluded; oposición gestión quoted
  separately regardless of garantía — exact wording pending (see §10)
- Official Nice class names only, verbatim

---

## 10. Open items — verify before launch

| # | Item | Blocking? |
|---|---|---|
| 1 | INPI acceptance of a digitalized (canvas-drawn) signature on the carta poder for trademark filings; fallback: gestor + ratificación, or print/sign/photo via WhatsApp | Blocks launch, not build |
| 2 | Final garantía terms (legal drafting) for the Garantía de Devolución upsell | Blocks enabling the upsell |
| 3 | Vigilancia: starts at inscripción (current decision) vs. at presentación (recommended — no extra cost, stronger selling point) | No — copy decision |
| 4 | Final pricing: $40.000 honorarios / $7.000 garantía confirmed? Vigilancia anchor price? | Blocks launch |
| 5 | Privacy policy + términos pages | Blocks launch |
| 6 | Official INPI/es-AR wording for the 45 Nice class headings | Blocks build of Paso 1 |
| 7 | Mercado Pago account + Checkout Pro credentials | v2 |

---

## 11. Mercado Pago — integration notes (v2)

Researched 2026-07. Product: **Checkout Pro** (MP-hosted checkout — handles
cards, dinero en cuenta, cuotas; maximum trust, minimum PCI surface).

### Flow

1. Wizard paso 4: user clicks "Pagar con Mercado Pago" → our Pages Function
   `POST /api/checkout/preference` creates the order (status `pending_payment`)
   and calls MP `POST https://api.mercadopago.com/checkout/preferences`
   (Bearer `MP_ACCESS_TOKEN`) with:
   - `items`: [{ title: 'Registro de marca "X" — Clase N', unit_price, quantity: 1 }]
     (+ item Garantía if selected)
   - `external_reference`: our `orderRef` (UM-…)
   - `metadata`: orderRef + wizard payload snapshot
   - `back_urls` + `auto_return: 'approved'`: return to
     `/registrar?order=<orderRef>&status=…` → wizard resumes at paso 5
   - `notification_url`: `https://unamarca.com.ar/api/checkout/webhook`
   - `payment_methods`: installments config (cuotas); optionally exclude
     `ticket` (Rapipago/PagoFácil) to avoid days-long `pending` states
2. Response contains `init_point` → redirect the browser there.
3. User pays on MP → redirected back via back_urls (UX only, NOT proof of
   payment).
4. **Webhook = source of truth**: MP POSTs `{data: {id}}` to our webhook.
   Handler must: validate `x-signature` (HMAC-SHA256 over
   `id:<dataId>;request-id:<xRequestId>;ts:<ts>;` with the app's webhook
   secret), fetch `GET /v1/payments/{id}`, check `status === 'approved'`,
   match `external_reference` → mark order paid → send emails. Always return
   HTTP 200 (non-200 triggers retries); handler must be idempotent
   (duplicate notifications are normal).

### What we need

| # | Item | Notes |
|---|---|---|
| 1 | Cuenta vendedor MP verificada (CUIT) | reuse existing MP account if any |
| 2 | App in the MP developers panel | gives test + production credentials |
| 3 | Production credentials activation | requires completing business data (homologación) |
| 4 | Secrets in Pages env | `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` |
| 5 | **Order storage (KV or D1)** | payment confirmation is async → v1's stateless model no longer works. Order record: orderRef, payload, payment status, timestamps |
| 6 | Function `POST /api/checkout/preference` | creates order + preference, returns init_point |
| 7 | Function `POST /api/checkout/webhook` | x-signature validation, payment fetch, idempotent state transition, trigger emails |
| 8 | Wizard wiring | paso 4 real button; resume-from-URL (`?order=`) so the back_urls return lands on paso 5 with state restored (localStorage covers same-browser; order token covers the rest) |
| 9 | Test accounts (comprador/vendedor de prueba) | full sandbox E2E before go-live |

### Implementation choices

- **REST via fetch, not the Node SDK** — Pages Functions run on Workers;
  plain `fetch` to MP's REST API avoids Node-compat friction entirely.
  (SDK works with `nodejs_compat` flag, but adds nothing we need.)
- Send an `X-Idempotency-Key` header on preference creation.
- Handle `pending` payments (if ticket methods stay enabled): let the user
  continue to paso 5/6, but only file before INPI once `approved`.

### Fees (verify in the MP panel before pricing is final)

Costo por cobro is a % of the total that varies by acreditation timing
(instant = highest, ~mid single digits + IVA; longer plazos cheaper) plus an
extra % if cuotas sin interés are enabled, plus provincial tax withholdings.
Exact current rates: MP panel → "Costos por cobrar" — factor them into the
$7.000 garantía margin math.
