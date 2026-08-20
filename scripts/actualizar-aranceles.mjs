#!/usr/bin/env node
// Baja los aranceles vigentes del INPI y regenera los dos archivos que el sitio
// lee para mostrarlos. Lo corre solo el workflow `.github/workflows/aranceles-inpi.yml`
// todos los días; si algo cambió, commitea y Cloudflare rebuildea.
//
// Por qué existe: los aranceles del INPI se expresan en UMAPI (Res. 75/2026) y
// el valor en pesos de la UMAPI se ajusta TODOS LOS MESES por IPC. Hasta ahora
// el número estaba escrito a mano en seis archivos y se actualizaba de memoria:
// cada mes que nos olvidábamos, la página de precio —la de más tráfico del
// sitio— cotizaba el arancel del mes pasado.
//
// Genera:
//   · src/data/aranceles-inpi.json  → tabla completa + histórico (lo lee la página)
//   · src/data/arancel-vigente.ts   → dos números sueltos (lo lee el checkout)
//
// Son dos archivos a propósito. El JSON son 40 KB y solo lo necesita
// `/aranceles-inpi` al buildear; `constants.ts` en cambio termina en el bundle
// del navegador del checkout, así que de ahí solo puede colgar un módulo chico.
//
// Uso:
//   node scripts/actualizar-aranceles.mjs           # escribe los archivos
//   node scripts/actualizar-aranceles.mjs --check   # falla si están desactualizados
//
// Si el INPI cambia el HTML o el endpoint, el script CORTA con error en vez de
// escribir un archivo a medias. Un valor viejo en el sitio es malo; un arancel
// inventado es peor.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO_JSON = join(RAIZ, 'src/data/aranceles-inpi.json');
const DESTINO_TS = join(RAIZ, 'src/data/arancel-vigente.ts');

const PORTAL = 'https://portaltramites.inpi.gob.ar/InfoPortal/Aranceles';
const ENDPOINT = 'https://portaltramites.inpi.gob.ar/InfoPortal/ListarAranceles';

/** El arancel de una solicitud de marca nueva: 100 UMAPI. Es el que cobra el
 *  checkout, así que si este código desaparece de la respuesta del INPI algo se
 *  rompió del otro lado y no queremos adivinar. */
const COD_MARCA_NUEVA = 110001;

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

class ErrorDeParseo extends Error {}

// ── Descarga ──────────────────────────────────────────────

async function bajar(url, comoJson) {
  const res = await fetch(url, {
    headers: {
      // El portal devuelve 403 a los user agents que huelen a script.
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
      'Accept': comoJson ? 'application/json' : 'text/html',
    },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new ErrorDeParseo(`${url} respondió ${res.status}`);
  return comoJson ? res.json() : res.text();
}

// ── Parseo ────────────────────────────────────────────────

/** "397,35" y "39.735,00" → número. Es el formato de la página (es-AR). */
function numeroEsAr(txt) {
  const n = Number(String(txt).trim().replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n)) throw new ErrorDeParseo(`No pude leer el número "${txt}"`);
  return n;
}

/** El endpoint JSON manda los importes con punto decimal y sin separador de
 *  miles ("       39735.00"), al revés que el HTML. */
function numeroEndpoint(txt) {
  const limpio = String(txt ?? '').trim();
  if (limpio === '' || limpio === '-') return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

function textoPlano(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

/** El valor de hoy: "1 UMAPI = $ 397,35" */
function leerUmapi(texto) {
  const m = texto.match(/1\s*UMAPI\s*=\s*\$\s*([\d.,]+)/i);
  if (!m) throw new ErrorDeParseo('No encontré "1 UMAPI = $…" en el portal del INPI');
  return numeroEsAr(m[1]);
}

/** El aviso del mes que viene, cuando está publicado:
 *  "A partir del 01/09/2026, el valor de UMAPI se incrementará en un 2,1%,
 *   estableciéndose en $405,69"
 *
 *  Es opcional: el INPI lo publica recién a mitad de mes, cuando el INDEC saca
 *  el IPC. Sin aviso, `proximo` queda en null y la página no muestra la fila. */
function leerProximo(texto) {
  const m = texto.match(
    /A partir del\s*(\d{1,2})\/(\d{1,2})\/(\d{4})[\s\S]{0,160}?\$\s*([\d.,]+)/i,
  );
  if (!m) return null;
  const [, dd, mm, yyyy, valor] = m;
  // `\w` no cubre la tilde de "incrementará", así que el verbo se matchea con
  // su raíz y lo que siga hasta el espacio.
  const variacion = texto.match(/se\s+(incrementar|reducir)\S*\s+en\s+un\s+([\d,.]+)\s*%/i);
  return {
    desde: `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`,
    umapi: numeroEsAr(valor),
    variacionPct: variacion
      ? numeroEsAr(variacion[2]) * (/reducir/i.test(variacion[1]) ? -1 : 1)
      : null,
  };
}

/** Los trámites de marcas, que es lo único que publicamos. El INPI devuelve los
 *  187 aranceles del organismo (patentes, modelos, transferencia de
 *  tecnología); acá no tenemos nada que decir sobre los otros. */
function leerTramitesDeMarcas(filas) {
  if (!Array.isArray(filas) || filas.length === 0) {
    throw new ErrorDeParseo('El endpoint de aranceles vino vacío');
  }
  const marcas = filas
    .filter(f => String(f.titulo ?? '').trim().toUpperCase() === 'MARCAS')
    .map(f => ({
      codigo: Number(f.cod_arancel),
      descripcion: limpiarDescripcion(f.descripcion),
      umapis: numeroEndpoint(f.cantidad_UR),
      importe: numeroEndpoint(f.importe),
    }))
    // Los "escritos no arancelados" valen 0 y son ruido en una tabla de precios.
    .filter(t => t.importe !== null && t.importe > 0);

  if (marcas.length === 0) throw new ErrorDeParseo('No quedó ningún arancel de marcas');
  if (!marcas.some(t => t.codigo === COD_MARCA_NUEVA)) {
    throw new ErrorDeParseo(`Falta el arancel ${COD_MARCA_NUEVA} (solicitud de marca nueva)`);
  }
  return marcas.sort((a, b) => b.importe - a.importe);
}

/** El INPI escribe TODO EN MAYÚSCULAS, con el prefijo "MARCAS - " repetido y
 *  saltos de línea en el medio. */
function limpiarDescripcion(raw) {
  const txt = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^MARCAS\s*-?\s*/i, '')
    // El INPI cierra varias descripciones con ".-" o con un punto suelto.
    .replace(/\s*\.?-?\s*$/, '')
    .trim()
    .toLowerCase();
  const conMayuscula = txt.charAt(0).toUpperCase() + txt.slice(1);
  // Siglas y referencias legales que el toLowerCase() se comió.
  return conMayuscula
    .replace(/\binpi\b/gi, 'INPI')
    .replace(/\btmclass\b/gi, 'TMclass')
    .replace(/\bart\.\s*(\d+)/gi, 'art. $1')
    .replace(/\bley\b/gi, 'Ley');
}

// ── Mes de vigencia ───────────────────────────────────────

const mesISO = (fecha) =>
  fecha.toLocaleDateString('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
  }); // "2026-08"

function nombreDelMes(iso) {
  const [anio, mes] = iso.split('-');
  return `${MESES[Number(mes) - 1]} ${anio}`;
}

/** A qué mes corresponde el valor que muestra el portal.
 *
 *  Si hay aviso ("a partir del 01/09/2026"), el valor de hoy rige hasta el día
 *  anterior: el mes es el previo al del aviso. Se prefiere eso a mirar el
 *  calendario porque el INPI a veces tarda un par de días en dar vuelta la
 *  página, y ahí el reloj nos haría guardar el valor de agosto como si fuera de
 *  septiembre. Sin aviso publicado, cae en la fecha de hoy en Buenos Aires. */
function mesDeVigencia(proximo) {
  if (proximo) {
    const [anio, mes] = proximo.desde.split('-').map(Number);
    const previo = new Date(Date.UTC(anio, mes - 1, 1));
    previo.setUTCMonth(previo.getUTCMonth() - 1);
    return `${previo.getUTCFullYear()}-${String(previo.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  return mesISO(new Date());
}

// ── Histórico ─────────────────────────────────────────────

/** El histórico es lo único que no se puede volver a bajar: el portal publica
 *  el valor de hoy y nada más. Se conserva siempre y solo se agrega. */
function fusionarHistorial(previo, mes, umapi) {
  const porMes = new Map((previo ?? []).map(p => [p.mes, p]));
  porMes.set(mes, { ...porMes.get(mes), mes, umapi });
  return [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}

// ── Salida ────────────────────────────────────────────────

function moduloTs(datos) {
  const arancel = datos.tramites.find(t => t.codigo === COD_MARCA_NUEVA);
  return `// ⚠️ GENERADO AUTOMÁTICAMENTE — no lo edites a mano.
//
// Lo reescribe \`scripts/actualizar-aranceles.mjs\` con lo que publica el INPI,
// todos los días, desde el workflow \`aranceles-inpi\`. Cualquier cambio a mano
// se pierde en la próxima corrida.
//
// Vive aparte de \`aranceles-inpi.json\` porque \`constants.ts\` lo importa y
// termina en el bundle del checkout: acá solo pueden estar estos dos valores.
//
// Fuente: ${datos.fuente}
// Actualizado: ${datos.actualizado}

/** Solicitud de registro de marca nueva, por clase (${arancel.umapis} UMAPI) */
export const ARANCEL_MARCA_NUEVA = ${arancel.importe};

/** Mes del valor UMAPI con el que se calculó ese arancel */
export const ARANCEL_VIGENCIA = '${datos.vigenciaTexto}';

/** Valor de 1 UMAPI, en pesos */
export const UMAPI = ${datos.umapi};
`;
}

// ── Main ──────────────────────────────────────────────────

async function main() {
  const soloChequear = process.argv.includes('--check');

  const [html, filas] = await Promise.all([bajar(PORTAL, false), bajar(ENDPOINT, true)]);
  const texto = textoPlano(html);

  const umapi = leerUmapi(texto);
  const proximo = leerProximo(texto);
  const tramites = leerTramitesDeMarcas(filas);
  const vigencia = mesDeVigencia(proximo);

  // El importe del endpoint tiene que ser el valor UMAPI por la cantidad de
  // UMAPIs del trámite. Si no cierra, una de las dos fuentes está desfasada
  // (pasa el día que el INPI actualiza) y no publicamos nada.
  const marcaNueva = tramites.find(t => t.codigo === COD_MARCA_NUEVA);
  const esperado = umapi * marcaNueva.umapis;
  if (Math.abs(esperado - marcaNueva.importe) > 1) {
    throw new ErrorDeParseo(
      `El portal y el endpoint no coinciden: ${marcaNueva.umapis} UMAPI × $${umapi} = ` +
      `$${esperado.toFixed(2)}, pero el arancel ${COD_MARCA_NUEVA} vino $${marcaNueva.importe}. ` +
      'Probablemente el INPI está a mitad de una actualización; reintentá más tarde.',
    );
  }

  let anterior = null;
  try {
    anterior = JSON.parse(await readFile(DESTINO_JSON, 'utf8'));
  } catch {
    // Primera corrida.
  }

  const datos = {
    // `actualizado` cambiaría en cada corrida y ensuciaría el diff con commits
    // vacíos, así que solo se mueve cuando cambió algo de fondo.
    actualizado: anterior?.actualizado ?? null,
    fuente: PORTAL,
    umapi,
    vigencia,
    vigenciaTexto: nombreDelMes(vigencia),
    proximo,
    tramites,
    historial: fusionarHistorial(anterior?.historial, vigencia, umapi),
  };

  const sinFecha = (d) => JSON.stringify({ ...d, actualizado: null });
  const cambio = !anterior || sinFecha(anterior) !== sinFecha(datos);
  if (cambio) datos.actualizado = new Date().toISOString();
  else datos.actualizado = anterior.actualizado;

  if (soloChequear) {
    if (cambio) {
      console.error('✗ Los aranceles del sitio están desactualizados.');
      process.exit(1);
    }
    console.log('✓ Aranceles al día.');
    return;
  }

  await writeFile(DESTINO_JSON, JSON.stringify(datos, null, 2) + '\n');
  await writeFile(DESTINO_TS, moduloTs(datos));

  console.log(
    `${cambio ? '✓ Actualizado' : '· Sin cambios'}: 1 UMAPI = $${umapi} (${datos.vigenciaTexto}), ` +
    `marca nueva $${marcaNueva.importe}, ${tramites.length} trámites de marcas` +
    (proximo ? `, próximo $${proximo.umapi} desde ${proximo.desde}` : ', sin aviso del mes que viene'),
  );
}

main().catch(err => {
  console.error(`✗ ${err instanceof ErrorDeParseo ? err.message : err}`);
  process.exit(1);
});
