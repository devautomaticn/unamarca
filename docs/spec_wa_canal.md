# Canal en los mensajes de WhatsApp — cambio en el catálogo (v1.11.0)

Documento para el proyecto del CRM, que mantiene el parser de atribución
(issue #64). Explica qué campo nuevo trae `/wa-catalog.json`, qué tiene que
hacer el parser con él y en qué orden se despliega cada lado.

**Estado: emisión activada el 2026-09-29, catálogo 1.11.1.** El sitio ya manda
`Buenas!` a quien llegó por un anuncio de Google.

Las secciones 4 y 5 son la propuesta original. **Lo que quedó acordado después
de la respuesta del CRM está en la sección 9**, y es lo que vale donde difieran.

---

## 1. Qué problema resuelve

Hoy el parser sabe de qué **sección** del sitio salió un contacto (Home, Blog,
Checkout…), pero no por qué **canal** llegó esa persona al sitio. Quien entra
por un anuncio de Google y toca el botón del hero manda exactamente el mismo
texto que quien llegó buscando en Google sin pagar.

Con Meta esto no pasa porque el anuncio abre WhatsApp directo y manda un
referral. Los anuncios de Google llevan al sitio, y de ahí a WhatsApp no viaja
ningún dato.

Vamos a prender una campaña de Google Ads y necesitamos distinguir esos
contactos.

## 2. Qué cambia en los mensajes

Cuando el visitante llegó al sitio por un anuncio de Google, el mensaje
prellenado sale con **otro saludo**. El resto del texto es idéntico.

| Visitante | Mensaje del botón del hero (`home_hero`) |
|---|---|
| Sin anuncio detectado | `Hola! Quiero registrar mi marca y quería consultar cómo empezar.` |
| Llegó por Google Ads | `Buenas! Quiero registrar mi marca y quería consultar cómo empezar.` |

La sección no cambia: los dos son `Home`. Lo que se agrega es el canal.

## 3. Qué cambia en el catálogo

`https://unamarca.com.ar/wa-catalog.json` pasa a la versión `1.11.0`. Todo lo
que ya existía sigue igual, en el mismo lugar y con el mismo nombre. Se agregan
dos cosas.

### 3.1 `variants` en cada mensaje

Cada entrada de `messages[]` trae un array `variants`. Puede venir vacío.

```json
{
  "key": "home_hero",
  "number": "5491148999564",
  "section": "Home",
  "risk": "medio",
  "match": "exact",
  "text": "Hola! Quiero registrar mi marca y quería consultar cómo empezar.",
  "variants": [
    {
      "canal": "google_ads",
      "match": "exact",
      "text": "Buenas! Quiero registrar mi marca y quería consultar cómo empezar."
    }
  ]
}
```

Una variante de un mensaje con `match: "prefix"` también es `prefix`:

```json
{
  "key": "registrar_multiclase",
  "section": "Checkout",
  "match": "prefix",
  "prefix": "Hola! Quiero registrar una marca en más de ",
  "template": "Hola! Quiero registrar una marca en más de {maxClases} clases.",
  "variants": [
    {
      "canal": "google_ads",
      "match": "prefix",
      "prefix": "Buenas! Quiero registrar una marca en más de ",
      "template": "Buenas! Quiero registrar una marca en más de {maxClases} clases."
    }
  ]
}
```

**Las variantes vienen armadas.** No hace falta que el parser conozca la regla
del saludo ni que reemplace nada: alcanza con comparar contra `text` o `prefix`
de cada variante, igual que ya hace con el mensaje base.

### 3.2 `channels` en la raíz

```json
"channels": {
  "emitting": false,
  "baseGreeting": "Hola! ",
  "values": {
    "google_ads": { "greeting": "Buenas! " }
  }
}
```

| Campo | Para qué sirve |
|---|---|
| `emitting` | `false`: las variantes están publicadas pero el sitio todavía no las manda. Pasa a `true` el día que se activa. |
| `values` | Los canales que existen. Hoy uno solo. |
| `baseGreeting`, `greeting` | Informativos. El parser no los necesita. |

### 3.3 Qué mensajes tienen variante

De los 30 mensajes vivos, 22 tienen variante y 8 no.

| Sin variante | Por qué |
|---|---|
| `ads_whatsapp`, `ads_descuento_109`, `ads_descuento_119`, `ads_cupos_10`, `ads_gira`, `ads_disponibilidad` | Son de la sección `Ads`. Los prellena Meta y su canal ya lo dice el referral. |
| `en_landing`, `float_en` | Están en inglés. La campaña es en español; quedan para más adelante. |

Los mensajes de `legacy[]` tampoco tienen variante: el sitio ya no los emite.

## 4. Qué tiene que hacer el parser

### 4.1 Un campo nuevo: `canal`

Cada contacto atribuido por texto necesita un campo `canal`, **separado de
`section`**. Son dos preguntas distintas: desde qué parte del sitio escribió y
cómo llegó al sitio.

| Valor de `canal` | Cuándo |
|---|---|
| `google_ads` | El primer mensaje matcheó una variante con ese canal. |
| `sin_anuncio` | El primer mensaje matcheó el texto base. |
| (el que ya usen para Meta) | Hay referral de Meta. No cambia. |

⚠️ **`sin_anuncio` no es "orgánico".** Significa que el sitio no detectó un clic
en un anuncio de Google en los últimos 90 días. Ahí adentro hay búsquedas
orgánicas, pero también visitas directas, gente que vio el anuncio en el celular
y escribió desde la computadora, y navegadores con las cookies bloqueadas. Si el
CRM lo muestra como "orgánico", el canal orgánico va a quedar inflado.

### 4.2 El algoritmo

Las reglas que ya tienen no cambian. Se agrega un paso.

```
para el PRIMER mensaje de la conversación:

1. ¿Hay referral de Meta?
     → es Ads de Meta. Fin. (como hoy)

2. para cada mensaje del catálogo:
     ¿matchea `text` / `prefix` del mensaje base?
       → section = la del mensaje, canal = "sin_anuncio". Fin.
     para cada variante del mensaje:
       ¿matchea `text` / `prefix` de la variante?
         → section = la del mensaje, canal = el de la variante. Fin.

3. ¿matchea alguno de `legacy[]`?
     → como hoy, canal = "sin_anuncio".

4. sin match. (como hoy)
```

El match sigue siendo exacto, con puntuación y tildes, salvo en las entradas
`prefix`.

### 4.3 Casos de prueba

Se pueden probar hoy mismo escribiendo estos textos a mano al número del agente,
como primer mensaje de una conversación nueva.

| Primer mensaje | `section` | `canal` |
|---|---|---|
| `Buenas! Quiero registrar mi marca y quería consultar cómo empezar.` | Home | google_ads |
| `Hola! Quiero registrar mi marca y quería consultar cómo empezar.` | Home | sin_anuncio |
| `Buenas! Entré al blog de UnaMarca y quería consultar por el registro de mi marca.` | Blog | google_ads |
| `Buenas! Quiero registrar una marca en más de 5 clases.` | Checkout | google_ads |
| `Buenas! Estaba leyendo «Cuánto sale registrar una marca» y quería hacer una consulta.` | Blog | google_ads |
| `Buenas! Busqué la marca «ACME» en clase 25 y aparecieron marcas similares (ej. «ACMÉ»). Quiero asesorarme para registrarla.` | Verificador | google_ads |
| `Buenas! Vi el contacto en la web y quería hacer una consulta.` (a la línea original) | Home | google_ads |
| `Hola, vi su anuncio y quería consultar por el registro de marcas.` | Ads | como hoy |
| `Buenas! Quería hacer una consulta.` | sin match | — |
| `Buenas, quiero registrar mi marca` | sin match | — |

Los dos últimos importan: **un saludo "Buenas" suelto no alcanza**. Tiene que
matchear el mensaje entero. Mucha gente saluda así por su cuenta.

## 5. Lo que necesitamos que nos confirmen

1. **Que el parser ignora los campos que no conoce.** Si valida el JSON de forma
   estricta, publicar la versión 1.11.0 podría romperles la lectura del
   catálogo. Necesitamos saberlo **antes** de publicar.
2. **Que `Buenas!` no choca con nada.** Por ejemplo, con alguna regla del agente
   que interprete ese saludo de otra forma.
3. **Cómo van a nombrar los valores de `canal`.** Propusimos `google_ads` y
   `sin_anuncio`. Si ya tienen una convención, nos adaptamos en los reportes; el
   valor del catálogo (`google_ads`) queda como está.
4. **La fecha en que el parser queda desplegado**, para activar la emisión
   después.

## 6. Orden de despliegue

El orden importa. Si el sitio emite las variantes antes de que el parser las
conozca, esos contactos caen en "sin match" y se pierde la atribución de sección
que hoy funciona.

| Paso | Quién | Qué |
|---|---|---|
| 1 | CRM | Confirma el punto 5.1 (campos desconocidos). |
| 2 | Sitio | Publica el catálogo 1.11.0, con `emitting: false`. |
| 3 | CRM | Despliega el parser y corre los casos de la sección 4.3. |
| 4 | CRM | Avisa que está listo. |
| 5 | Sitio | Activa la emisión. El catálogo pasa a `emitting: true`. |
| 6 | Los dos | Primera semana: revisar que "sin match" no haya subido. |

## 7. Lo que este cambio no resuelve

- **Si la persona edita el mensaje antes de enviarlo, no hay match.** Ya pasa
  hoy con los mensajes base.
- **Se sabe el canal, no el anuncio.** El mensaje no dice qué campaña ni qué
  palabra clave. Ese detalle queda en Google Ads y en GA4.
- **Mensajes viejos.** Una página cacheada o un link guardado siguen mandando el
  mensaje base aunque la persona haya llegado por un anuncio.
- **Un link compartido arrastra el canal.** Si alguien que llegó por un anuncio
  copia el link del botón y se lo pasa a otra persona, esa segunda persona
  escribe con `Buenas!`. Es raro, pero puede pasar.

## 8. Agregar canales más adelante

Si algún día se suma otro canal, va a aparecer como una entrada más en
`channels.values` y una variante más en cada `variants[]`, con otro saludo. Un
parser que recorra `variants[]` sin asumir que hay una sola lo toma sin cambios
de código. Cualquier canal nuevo se avisa antes de emitirlo y sube la versión
del catálogo.

## 9. Lo acordado (2026-09-29)

El CRM contestó las cuatro confirmaciones de la sección 5 y se apartó de la
propuesta en tres puntos. Los tres quedan aceptados.

### Confirmaciones

| Punto | Respuesta |
|---|---|
| 5.1 Campos desconocidos | El parser en producción lee por nombre e ignora lo que no conoce. Probado contra un catálogo con `variants` y `channels`. |
| 5.2 `Buenas!` | No choca con ninguna regla del agente ni con otra frase del catálogo. |
| 5.3 Valores de `canal` | `google_ads`, `sin_anuncio` y `meta_ads`. En pantalla, `sin_anuncio` se lee "Sin anuncio detectado". |
| 5.4 Fecha | Despliegan cuando el sitio publique la 1.11.0, y avisan el mismo día. |

### Valores de `canal`, como quedaron

| Valor | Cuándo lo escribe el CRM |
|---|---|
| `google_ads` | El primer mensaje matcheó una variante. Se reconoce aunque `emitting` sea `false`. |
| `meta_ads` | Hay referral de Meta. |
| `sin_anuncio` | Matcheó el texto base de un mensaje **que tiene variante**, y la copia del catálogo dice `emitting: true`. |
| (vacío) | Todo lo demás: mensajes de `legacy[]`, mensajes sin variante (inglés, sección Ads), y cualquier texto base mientras `emitting` sea `false`. |

El vacío es correcto y no es un dato que falta: un mensaje que nunca pudo salir
con `Buenas!` no dice nada sobre si hubo anuncio o no.

### El CRM trabaja sobre una copia del catálogo

No lo lee en vivo. La copia se actualiza a mano del lado de ellos
(`run_wa_catalogo.py --aplicar`). Por eso:

- **El sitio avisa cada vez que sube la versión del catálogo.** Sin aviso, los
  mensajes nuevos llegan y no se atribuyen.
- **El día que se activa la emisión hay que avisar**, para que traigan la copia
  con `emitting: true`. Hasta que la traigan, el texto base queda sin canal;
  `google_ads` se reconoce igual.

### Secuencia, como quedó

| Paso | Quién | Qué | Estado |
|---|---|---|---|
| 1 | CRM | Confirma que el parser ignora campos desconocidos | Hecho |
| 2 | Sitio | Publica el catálogo 1.11.0 con `emitting: false` y avisa | Hecho |
| 3 | CRM | Trae la copia 1.11.0 y despliega el parser | Hecho |
| 4 | CRM | Avisa que está listo | Hecho |
| 5 | Sitio | Activa la emisión y avisa. Catálogo 1.11.1, `emitting: true` | Hecho, 2026-09-29 |
| 6 | CRM | Trae la copia 1.11.1 y despliega | Pendiente |
| 7 | Los dos | Primera semana: revisar que "sin match" no haya subido | Pendiente |
