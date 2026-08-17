# Guía DIY — contrato para el agente de WhatsApp

Documento para compartir con el proyecto del agente. Describe qué vende la guía,
qué endpoints tiene que llamar el agente y qué decisiones toma él.

**Estado: implementado y probado, salvo un bloqueo.** Ver §7 antes de integrar.

---

## 1. Qué es

Una guía online que explica el trámite completo de registro de marca ante el
INPI, paso a paso, con herramientas embebidas (nomenclador, relevamiento de
antecedentes, términos oficiales, vigilancia del Boletín).

- **Precio:** $25.000, pago único.
- **Se vende SOLO por WhatsApp**, a leads que rebotaron por el precio del
  registro completo. No aparece en la web, no se linkea, no se indexa.
- **No tiene login.** El acceso es una URL única por compra. El token de esa URL
  *es* la credencial.
- **No vence.**
- **Cero intervención humana** después de la venta, salvo que el cliente pague
  por transferencia.

## 2. El flujo

```
Lead dice "es caro" para el registro
  → el agente crea el pedido           POST /api/guia/pedido
  → manda LOS DOS links en un mensaje  (pago + guía)
  → el cliente paga
       · con tarjeta   → el webhook de Mercado Pago acredita solo
       · por transferencia → el agente valida el comprobante y acredita
  → la guía se activa en la MISMA URL que ya tenía el cliente
  → además le llega por mail, como respaldo
```

**Los dos links van juntos, en el mismo mensaje.** La URL de la guía se entrega
antes de cobrar a propósito: así el cliente la tiene guardada desde el primer
mensaje y no depende de que Mercado Pago lo redirija (no vuelve si paga desde la
app) ni de que le llegue el mail. Hasta que se acredite el pago, esa URL muestra
una pantalla de "pendiente" con los datos para pagar. **No filtra contenido: no
se ve ni un paso de la guía.**

## 3. Autenticación

Todos los endpoints son server-to-server y piden:

```
Authorization: Bearer <GUIA_API_KEY>
```

El agente nunca ve la base de datos ni Mercado Pago. Sin header o con clave
incorrecta: **401**. Si el entorno no tiene la clave configurada: **503**.

Base: `https://unamarca.com.ar`

## 4. Endpoints

### 4.1 Crear el pedido

```http
POST /api/guia/pedido
Authorization: Bearer <GUIA_API_KEY>
Content-Type: application/json

{
  "email": "cliente@ejemplo.com",
  "marcas": [
    { "nombre": "MA-LIO", "tipo": "mixta", "alcance": "Llaveros y placas de resina" }
  ]
}
```

| Campo | Obligatorio | Notas |
|---|---|---|
| `email` | **sí** | Es donde llega el mail de respaldo y la clave para recuperar el link |
| `marcas` | no | 0 a 3. `tipo`: `denominativa` \| `mixta` \| `figurativa` (cualquier otro cae en denominativa). `alcance` es lo que vende esa marca, en palabras del cliente |

**`marcas` es opcional a propósito: la guía funciona perfecto con cero marcas.**
Si el chat no dio detalles, mandá sólo el email. Si los dio, la guía usa esos
datos como ejemplos en cada paso y le habla más de cerca.

Respuesta `201`:

```json
{
  "ref": "GU-20260817-K4M2XP",
  "email": "cliente@ejemplo.com",
  "estado": "pendiente",
  "guiaUrl": "https://unamarca.com.ar/guia/x7k2m9pqrs4tuv6wxy8zab",
  "pagoUrl": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=...",
  "precio": 25000,
  "creadoEn": "2026-08-17T20:14:02.881Z",
  "pagadoEn": null,
  "origenPago": null,
  "accesos": 0,
  "reutilizado": false
}
```

**Es seguro reintentar.** Si ya existe un pedido sin pagar para ese email, se
devuelve ese mismo con `reutilizado: true` en vez de crear otro. Así el cliente
nunca termina con dos links distintos preguntándose cuál era. Si en el reintento
mandás marcas, se actualizan las del pedido existente.

### 4.2 Consultar el estado

```http
GET /api/guia/pedido/GU-20260817-K4M2XP
Authorization: Bearer <GUIA_API_KEY>
```

```json
{ "ref": "...", "email": "...", "estado": "pagado", "guiaUrl": "...", "pagadoEn": "...", "origenPago": "mercadopago", "accesos": 3 }
```

`estado`: `pendiente` | `pagado` | `revocado`.

**No hace falta consultarlo de rutina.** El webhook acredita solo y el cliente
ya tiene su link. Es para cuando dice "ya pagué" y querés confirmar antes de
responderle.

### 4.3 Recuperar por email ("perdí mi link")

```http
GET /api/guia/por-email?email=cliente@ejemplo.com
Authorization: Bearer <GUIA_API_KEY>
```

```json
{ "guias": [ { "ref": "...", "estado": "pagado", "guiaUrl": "...", "creadoEn": "..." } ] }
```

Devuelve hasta 10, de la más nueva a la más vieja. **Esto reemplaza a una página
de recuperación:** el cliente te escribe, vos consultás y le volvés a pegar la
URL en el chat.

### 4.4 Acreditar una transferencia

```http
POST /api/guia/pedido/GU-20260817-K4M2XP/pago-manual
Authorization: Bearer <GUIA_API_KEY>
Content-Type: application/json

{
  "metodo": "transferencia",
  "monto": 25000,
  "observado": "Transferencia de Enrique C., 17/08 14:32, a ALFIL.MARCO.PAPEL"
}
```

Activa el acceso, le manda el mail al cliente y **dispara un aviso a Mike** con
lo que pusiste en `observado`, para que lo cruce contra el banco. Poné ahí lo
que viste en la captura: nombre, fecha, hora, destino. Es lo único con lo que se
puede conciliar después.

Es idempotente: si llamás dos veces, la segunda devuelve `yaEstaba: true` y no
duplica mails.

### 4.5 Revocar

```http
POST /api/guia/pedido/GU-20260817-K4M2XP/revocar
{ "deshacer": true }   ← opcional, para reactivar
```

Para cuando un comprobante no aparece en el banco o un link se publicó en algún
lado. La guía deja de renderizarse.

## 5. Lo que el agente tiene que decidir

### 5.1 El mensaje de venta

Los dos links juntos:

> Listo. Acá pagás la guía: `{pagoUrl}`
> Y esta es tu guía: `{guiaUrl}`
> Se activa sola apenas se acredite el pago.

### 5.2 Si elige transferencia

Le pasás:

> Alias: **ALFIL.MARCO.PAPEL**
> Titular: **Michael Alan Simmons**
> Importe: **$25.000**
> Cuando transfieras, mandame la captura del comprobante.

Y para activar, **las tres condiciones tienen que cumplirse en la captura**:

1. El monto es **$25.000 o más**
2. El destino es el alias `ALFIL.MARCO.PAPEL` o el titular Michael Alan Simmons
3. La transferencia figura como **realizada**, no programada ni pendiente

- **Se cumplen las tres** → llamás a `pago-manual` y le confirmás el acceso.
- **Falta alguna, o la captura no se lee** → **NO llamás al endpoint**. Respondés
  algo como: *"Recibí tu comprobante, lo estoy verificando. Te confirmo apenas
  lo tenga."*

**Regla dura: sin captura no se activa nada.** Un "ya te transferí" no alcanza.

> Una captura de pantalla se falsifica en dos minutos y el agente no puede
> detectarlo. Eso está asumido: el control es posterior, cruzando el mail de
> aviso contra el banco, y revocando si no cierra.

### 5.3 Pagos en efectivo

No se aceptan. Rapipago y Pago Fácil están excluidos de la preferencia de
Mercado Pago, así que no aparecen como opción. Quien no quiera tarjeta,
transfiere.

## 6. Errores

| Código | Qué pasó | Qué hace el agente |
|---|---|---|
| `400` | Falta el email o es inválido | Corregir y reintentar |
| `401` | Clave incorrecta o ausente | Avisar: es un problema de configuración |
| `404` | El `ref` no existe | Verificar el ref |
| `409` | El pedido está revocado | No se puede acreditar. Escalar |
| `502` | Mercado Pago no respondió | Reintentar en unos minutos |
| `503` | `GUIA_API_KEY` no configurada | Escalar, no reintentar |

Todos los errores vienen como `{ "error": "texto en castellano" }`.

## 7. Pendiente antes de poder vender

**La página de la guía todavía es estática**, con dos tokens de demo horneados
en el build. Los tokens reales, los que crean estos endpoints, **todavía no
resuelven**: hay que hacer que `/guia/[token]` se renderice por request.

Eso necesita el adaptador de Cloudflare en Astro, y ahí está el problema:

> El adaptador emite `dist/_worker.js`, y **Cloudflare Pages en modo avanzado
> ignora por completo el directorio `functions/`**. Verificado el 2026-08-17: con
> `_worker.js` presente, `/api/*` devuelve el HTML de la home. Se caerían el
> checkout, el webhook de Mercado Pago, el proxy de relevamiento y el
> nomenclador.

Las dos salidas posibles:

1. **Migrar `functions/` a rutas de Astro** (`src/pages/api/**`). Es el final
   correcto y el cambio es mecánico (cambia la firma del handler y de dónde
   salen los bindings), pero toca el código de pagos que ya está en producción.
2. **Poner la guía en un proyecto de Pages aparte** (`guia.unamarca.com.ar`), con
   adaptador propio. El sitio principal no se toca.

Todo lo demás de este documento está implementado y probado.

## 8. Configuración

| Dónde | Qué | Estado |
|---|---|---|
| Pages (Production y Preview) | `GUIA_API_KEY` — secreto compartido con el agente | **falta cargar** |
| Proyecto del agente | La misma clave, como variable de entorno | **falta cargar** |
| Pages | `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `RESEND_API_KEY`, binding `DB` | ya existen |
| D1 | La tabla `guias` se crea sola en la primera llamada | automático |

La clave conviene que la generes vos (`openssl rand -hex 32`) y la cargues en
los dos lados. No tiene que pasar por el repo ni por un chat.

## 9. Dónde está cada cosa

| Archivo | Qué hace |
|---|---|
| `functions/_lib/guia.ts` | Tabla, tokens, auth, estados |
| `functions/_lib/guiaMails.ts` | Mail al cliente y aviso de transferencia (BCC a Mike) |
| `functions/api/guia/pedido.ts` | Crear pedido + preferencia de MP |
| `functions/api/guia/pedido/[ref].ts` | Estado |
| `functions/api/guia/pedido/[ref]/pago-manual.ts` | Acreditar transferencia |
| `functions/api/guia/pedido/[ref]/revocar.ts` | Baja y alta |
| `functions/api/guia/por-email.ts` | Recuperación |
| `functions/api/checkout/webhook.ts` | Rama `GU-` que acredita los pagos de MP |
| `src/pages/guia/[token].astro` | Control de acceso |
| `src/components/guia/Contenido.astro` | La guía |
| `src/components/guia/Bloqueo.astro` | Pantallas de pendiente / revocado / inexistente |
| `src/lib/guia/cargar.ts` | Lookup del token contra D1 |
