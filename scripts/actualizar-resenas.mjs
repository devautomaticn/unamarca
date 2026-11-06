#!/usr/bin/env node
// Baja las reseñas publicadas del portal Vigilante y regenera
// `src/data/resenas.json`, que leen el bloque de la home y /resenas/.
// Lo corre solo el workflow `.github/workflows/resenas.yml` todos los días; si
// algo cambió, commitea y Cloudflare rebuildea.
//
// Por qué un archivo y no un fetch en el build o en vivo: el sitio es estático
// y no puede depender del VPS ni para buildear ni para mostrarse. Si el portal
// está caído, el sitio sigue con las reseñas del último día bueno.
//
// Qué se publica lo decide el portal (`GET /api/ext/v1/resenas`, backlog #82 de
// Vigilant): toda reseña en la que el cliente marcó que se puede publicar; de
// esas, este script se queda sólo con las de 5 estrellas. La
// firma («Nombre I.») viene armada de allá: el nombre completo no sale del
// portal. Cuando no hay apellido cargado la firma viene en null y el sitio
// firma «Cliente de UnaMarca».
//
// La clave es VIGILANTE_RESENAS_KEY (secret del repo en GitHub). Es una clave
// acotada al permiso `resenas`: no puede leer contactos ni trámites.
//
// Uso:
//   VIGILANTE_RESENAS_KEY=vgl_… node scripts/actualizar-resenas.mjs
//   node scripts/actualizar-resenas.mjs --entrada respuesta.json   # sin red
//   … --forzar   # acepta que la lista baje a la mitad o a cero
//
// Si la respuesta no tiene la forma esperada, CORTA sin escribir: una reseña
// rota en la home es peor que una reseña de ayer.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'src/data/resenas.json');

const BASE = process.env.VIGILANTE_API_BASE || 'https://vigilante.unamarca.com.ar/api/ext/v1';

const args = process.argv.slice(2);
const forzar = args.includes('--forzar');
const iEntrada = args.indexOf('--entrada');
const entrada = iEntrada >= 0 ? args[iEntrada + 1] : null;

class Invalida extends Error {}

async function bajar() {
  if (entrada) return JSON.parse(await readFile(entrada, 'utf8'));
  const clave = process.env.VIGILANTE_RESENAS_KEY;
  if (!clave) throw new Error('Falta VIGILANTE_RESENAS_KEY.');
  const res = await fetch(`${BASE}/resenas`, {
    headers: { Authorization: `Bearer ${clave}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`El portal respondió ${res.status}.`);
  return res.json();
}

/** Valida y deja sólo los campos que el sitio usa, en un orden fijo: así el
 *  diff del commit muestra exactamente qué reseña cambió. */
function normalizar(crudo) {
  if (!crudo || !Array.isArray(crudo.items)) throw new Invalida('Falta `items`.');
  return crudo.items.map((r, i) => {
    const donde = `items[${i}]`;
    if (!Number.isInteger(r.id)) throw new Invalida(`${donde}.id`);
    if (!Number.isInteger(r.estrellas) || r.estrellas < 1 || r.estrellas > 5)
      throw new Invalida(`${donde}.estrellas`);
    if (typeof r.texto !== 'string') throw new Invalida(`${donde}.texto`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.fecha ?? '')) throw new Invalida(`${donde}.fecha`);
    if (r.firma !== null && typeof r.firma !== 'string') throw new Invalida(`${donde}.firma`);
    if (!Array.isArray(r.marcas)) throw new Invalida(`${donde}.marcas`);
    const marcas = r.marcas.map((m, j) => {
      if (typeof m.denominacion !== 'string' || !m.denominacion.trim())
        throw new Invalida(`${donde}.marcas[${j}].denominacion`);
      if (!Array.isArray(m.actas) || !m.actas.every(a => /^\d{7}$/.test(a)))
        throw new Invalida(`${donde}.marcas[${j}].actas`);
      return { denominacion: m.denominacion.trim(), actas: m.actas };
    });
    return {
      id: r.id,
      estrellas: r.estrellas,
      texto: r.texto.replace(/\r\n?/g, "\n").trim(),
      fecha: r.fecha,
      firma: r.firma ? r.firma.trim() : null,
      marcas,
    };
  });
}

async function anterior() {
  try {
    return JSON.parse(await readFile(DESTINO, 'utf8'));
  } catch {
    return null;
  }
}

// Sólo las de 5 estrellas (decisión de Mike, 2026-11-06). Por eso el sitio no
// muestra un promedio: sería el de una selección, no el de todas.
const items = normalizar(await bajar()).filter(r => r.estrellas === 5);
const previo = await anterior();
const nAntes = previo?.items?.length ?? 0;

// Una caída grande casi seguro es un problema del otro lado (una clave de otro
// workspace, un filtro roto), no siete clientes que se arrepintieron el mismo
// día. Se frena y se mira a mano.
if (!forzar && nAntes > 0 && items.length < nAntes / 2) {
  console.error(`La lista bajó de ${nAntes} a ${items.length} reseñas. No escribo; usá --forzar si es correcto.`);
  process.exit(1);
}

if (previo && JSON.stringify(previo.items) === JSON.stringify(items)) {
  console.log(`Sin cambios (${items.length} reseñas).`);
  process.exit(0);
}

const datos = { actualizado: new Date().toISOString(), items };
await writeFile(DESTINO, JSON.stringify(datos, null, 2) + '\n');
console.log(`Escribí ${items.length} reseñas (antes ${nAntes}).`);
