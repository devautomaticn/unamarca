# Guía DIY de registro de marca — todo lo que el agente necesita saber

Documento para el proyecto del agente de WhatsApp. Explica qué es el producto,
cómo venderlo, qué endpoints llamar y qué decisiones toma el agente.

**Estado: en producción y verificado de punta a punta** (pago real acreditado
automáticamente, guía activada, mail entregado).

---

## 1. Qué se vende

Una guía online que explica el trámite completo de registro de marca ante el
INPI, paso a paso, con herramientas embebidas.

| | |
|---|---|
| **Precio** | $25.000, pago único |
| **Qué incluye** | 18 pasos + 4 herramientas + soporte por este chat |
| **Qué NO incluye** | El arancel del INPI ($39.735 por marca y por clase, agosto 2026), que el cliente paga aparte y directamente al INPI |
| **Acceso** | Una URL única por compra. Sin usuario ni contraseña |
| **Vencimiento** | No vence |

### A quién se le ofrece

**Sólo a leads que rebotaron por el precio del registro completo.** La guía no
aparece en la web, no se linkea desde ningún lado y no se indexa. Es un
producto de rescate, no una alternativa que se ofrece de entrada.

Si el lead no objetó el precio, **no le ofrezcas la guía**: le estarías vendiendo
un producto de $25.000 a alguien dispuesto a pagar $79.735.

### El encuadre que funciona

El registro completo sale $79.735 por clase, pero **sólo $40.000 son honorarios
nuestros**: los otros $39.735 son el arancel del INPI, que el cliente paga igual
haga el trámite solo o con nosotros.

> "El arancel del INPI lo vas a pagar igual, lo hagas vos o nosotros. Lo que
> estás decidiendo es qué hacés con los $40.000 de honorarios. Por $25.000 te
> damos la guía completa para que lo presentes vos."

## 2. Qué hay adentro de la guía

Sirve para responder "¿y qué me dan por eso?".

**Parte 1 — Entender** (2 pasos): qué te da una marca registrada y qué no; qué
nombres se pueden registrar y por qué "Velas Ma-Lio" es peor marca que "Ma-Lio".

**Parte 2 — Preparar** (4 pasos): en qué clase va la marca; si está libre;
qué términos pedir; clave fiscal y habilitación del servicio del INPI.

**Parte 3 — Presentar** (8 pasos): el formulario del INPI pantalla por pantalla,
con las trampas señaladas donde caen. Guardar borrador, firmar y pagar el arancel.

**Parte 4 — Después** (4 pasos): plazos, publicación en el Boletín, oposiciones
y vistas, y las dos fechas que si se pasan hacen perder la marca.

### Las cuatro herramientas embebidas

1. **Nomenclador** — describe lo que vende y le sugiere las clases con los
   términos oficiales de cada una.
2. **Relevamiento** — busca antecedentes en la base del INPI.
3. **Términos de la clase** — el listado oficial completo, para tildar los suyos
   y copiarlos.
4. **Vigilancia** — lo da de alta para recibir avisos del Boletín.

Lo que elige en un paso se arrastra a los siguientes: la clase que elige en el
paso 3 aparece cargada en la búsqueda del 4, en los términos del 5 y en la
vigilancia del 15.

### Lo que la guía NO hace

- **No presentamos el trámite.** Lo presenta el cliente.
- **No revisamos su solicitud.** No hay revisión humana incluida.
- **No garantiza que la marca se conceda.** Eso lo decide el INPI.

Decilo claro al vender. Si el cliente quiere que lo presentemos nosotros, eso es
el servicio completo, no la guía.

## 3. El flujo de venta

```
El lead dice que el registro es caro
  → creás el pedido                POST /api/guia/pedido
  → mandás LOS DOS links en un mensaje  (pago + guía)
  → el cliente paga
       · con tarjeta       → se acredita solo, en segundos
       · por transferencia → validás el comprobante y acreditás vos
  → la guía se activa en la MISMA URL que el cliente ya tenía
  → además le llega por mail
```

**Los dos links van juntos, en el mismo mensaje.** La URL de la guía se entrega
antes de cobrar a propósito: así el cliente la tiene guardada desde el primer
mensaje y no depende de que Mercado Pago lo redirija (no vuelve si paga desde la
app) ni de que le llegue el mail.

Hasta que se acredite, esa URL muestra una pantalla de "pendiente de pago" con
los datos para pagar. **No filtra contenido: no se ve ni un paso de la guía.**

### El mensaje

> Listo. Acá pagás la guía: `{pagoUrl}`
> Y esta es tu guía: `{guiaUrl}`
> Se activa sola apenas se acredite el pago.

## 4. Los endpoints

Base: `https://unamarca.com.ar`

Todos piden `Authorization: Bearer <GUIA_API_KEY>`. Son server-to-server: el
agente nunca ve la base de datos ni Mercado Pago.

Sin header o con clave incorrecta → **401**. Si el entorno no tiene la clave
configurada → **503**.

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
| `email` | **sí** | Donde llega el mail de respaldo, y la clave para recuperar el link |
| `marcas` | no | 0 a 3. `tipo`: `denominativa` \| `mixta` \| `figurativa` (cualquier otro cae en denominativa). `alcance` es lo que vende esa marca, en palabras del cliente |

**`marcas` es opcional a propósito: la guía funciona perfecto con cero marcas.**
Si el chat no dio detalles, mandá sólo el email. Si los dio, la guía usa esos
datos como ejemplos en cada paso.

Respuesta `201`:

```json
{
  "ref": "GU-20260818-4WUFZD",
  "email": "cliente@ejemplo.com",
  "estado": "pendiente",
  "guiaUrl": "https://unamarca.com.ar/guia/htgp3hfkk94rxqhxvzakxyrsdx",
  "pagoUrl": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=...",
  "precio": 25000,
  "creadoEn": "2026-08-18T13:58:11.204Z",
  "pagadoEn": null,
  "origenPago": null,
  "accesos": 0,
  "reutilizado": false
}
```

**Es seguro reintentar.** Si ya existe un pedido sin pagar para ese email, se
devuelve ese mismo con `reutilizado: true` en vez de crear otro, así el cliente
nunca termina con dos links distintos. Si en el reintento mandás marcas, se
actualizan las del pedido existente.

### 4.2 Consultar el estado

```http
GET /api/guia/pedido/GU-20260818-4WUFZD
```

```json
{ "ref": "...", "email": "...", "estado": "pagado", "guiaUrl": "...",
  "pagadoEn": "...", "origenPago": "mercadopago", "accesos": 3 }
```

`estado`: `pendiente` | `pagado` | `revocado`.

**No hace falta consultarlo de rutina.** El pago con tarjeta se acredita solo y
el cliente ya tiene su link. Sirve para cuando dice "ya pagué" y querés
confirmar antes de responderle.

### 4.3 Recuperar por email ("perdí mi link")

```http
GET /api/guia/por-email?email=cliente@ejemplo.com
```

```json
{ "guias": [ { "ref": "...", "estado": "pagado", "guiaUrl": "...", "creadoEn": "..." } ] }
```

Hasta 10, de la más nueva a la más vieja. **Esto reemplaza a una página de
recuperación:** el cliente te escribe, consultás y le volvés a pegar la URL.

### 4.4 Acreditar una transferencia

```http
POST /api/guia/pedido/GU-20260818-4WUFZD/pago-manual
Content-Type: application/json

{
  "metodo": "transferencia",
  "monto": 25000,
  "observado": "Transferencia de Enrique C., 18/08 14:32, a ALFIL.MARCO.PAPEL"
}
```

Activa el acceso, manda el mail al cliente y **dispara un aviso al estudio** con
lo que pusiste en `observado`. Poné ahí lo que viste en la captura: nombre,
fecha, hora, destino. Es lo único con lo que se puede conciliar contra el banco.

Idempotente: si llamás dos veces, la segunda devuelve `yaEstaba: true` y no
duplica mails.

### 4.5 Revocar

```http
POST /api/guia/pedido/GU-20260818-4WUFZD/revocar
{ "deshacer": true }   ← opcional, para reactivar
```

Para cuando un comprobante no aparece en el banco o un link se publicó en algún
lado.

## 5. Las decisiones del agente

### 5.1 Pago por transferencia

Datos que le pasás:

> Alias: **ALFIL.MARCO.PAPEL**
> Titular: **Michael Alan Simmons**
> Importe: **$25.000**
> Cuando transfieras, mandame la captura del comprobante.

Para activar, **las tres condiciones tienen que cumplirse en la captura**:

1. El monto es **$25.000 o más**
2. El destino es el alias `ALFIL.MARCO.PAPEL` o el titular Michael Alan Simmons
3. La transferencia figura como **realizada**, no programada ni pendiente

- **Se cumplen las tres** → llamás a `pago-manual` y le confirmás el acceso.
- **Falta alguna, o la captura no se lee** → **NO llamás al endpoint**.
  Respondés: *"Recibí tu comprobante, lo estoy verificando. Te confirmo apenas
  lo tenga."*

**Regla dura: sin captura no se activa nada.** Un "ya te transferí" no alcanza.

> Una captura se falsifica en dos minutos y el agente no puede detectarlo. Está
> asumido: el control es posterior, cruzando el mail de aviso contra el banco.

### 5.2 Pagos en efectivo

No se aceptan. Rapipago y Pago Fácil están excluidos de la preferencia de
Mercado Pago, así que no aparecen como opción. Quien no quiera tarjeta,
transfiere.

### 5.3 Cuándo derivar al servicio completo

La guía tiene un paso final ("Cuándo esto te queda grande") que manda al cliente
a este chat. Los casos que llegan y conviene atender como venta del servicio
completo:

- **No puede vincular el servicio del INPI a su clave fiscal.** Es el lead más
  caliente: ya pagó y se trabó antes de empezar.
- **Le llegó una vista o una oposición.** El propio INPI recomienda un agente de
  la propiedad industrial para contestarlas.
- **Es una persona jurídica.** El wizard online sólo cubre personas humanas.

## 6. Errores

| Código | Qué pasó | Qué hace el agente |
|---|---|---|
| `400` | Falta el email o es inválido | Corregir y reintentar |
| `401` | Clave incorrecta o ausente | Escalar: es configuración |
| `404` | El `ref` no existe | Verificar el ref |
| `409` | El pedido está revocado | No se puede acreditar. Escalar |
| `502` | Mercado Pago no respondió | Reintentar en unos minutos |
| `503` | `GUIA_API_KEY` no configurada | Escalar, no reintentar |

Todos vienen como `{ "error": "texto en castellano" }`.

## 7. Preguntas que van a llegar

| Pregunta | Respuesta |
|---|---|
| "¿Ustedes lo presentan?" | No. La guía es para que lo presentes vos. Si querés que lo presentemos nosotros, es el servicio completo |
| "¿Está incluido el arancel del INPI?" | No. Son $39.735 por marca y por clase, y se pagan directo al INPI desde el portal |
| "¿Me garantizan que sale?" | No. La concesión la decide el INPI. La guía te evita los errores que hacen perder el arancel |
| "¿Cuánto tarda el trámite?" | Si no hay vistas ni oposiciones, entre 60 y 90 días desde la presentación |
| "¿Vence la guía?" | No. El link es tuyo y no vence |
| "¿Puedo usarla para varias marcas?" | Sí. El trámite es el mismo, se repite por cada marca y cada clase |
| "Pagué y no se activa" | Consultá el estado (4.2). Si figura `pendiente` y pagó con tarjeta, escalá |

## 8. Configuración

| Dónde | Qué |
|---|---|
| Proyecto del agente | `GUIA_API_KEY` como variable de entorno |
| Cloudflare Pages | La misma clave, como secret, en Production y Preview |

La clave no va en el repo ni en un chat. Si se rota, se cambia en los dos lados
y se redespliega. **Rotarla no invalida ninguna guía ya vendida**: los tokens de
los clientes son independientes.

## 9. Dónde está cada cosa (referencia para el otro proyecto)

| Archivo | Qué hace |
|---|---|
| `src/lib/server/guia.ts` | Tabla, tokens, auth, estados |
| `src/lib/server/guiaMails.ts` | Mail al cliente y aviso de transferencia |
| `src/pages/api/guia/pedido.ts` | Crear pedido + preferencia de MP |
| `src/pages/api/guia/pedido/[ref].ts` | Estado |
| `src/pages/api/guia/pedido/[ref]/pago-manual.ts` | Acreditar transferencia |
| `src/pages/api/guia/pedido/[ref]/revocar.ts` | Baja y alta |
| `src/pages/api/guia/por-email.ts` | Recuperación |
| `src/pages/api/checkout/webhook.ts` | Rama `GU-` que acredita los pagos de MP |
| `src/pages/guia/[token].astro` | Control de acceso |
| `src/components/guia/Contenido.astro` | La guía |
| `src/components/guia/Bloqueo.astro` | Pendiente / revocado / inexistente |
| `src/lib/guia/cargar.ts` | Lookup del token contra D1 |
