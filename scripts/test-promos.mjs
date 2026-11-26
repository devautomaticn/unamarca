// Pruebas de src/lib/server/promos.ts (vigilant #313). Falla cerrado: todo lo
// que no sea un token auténtico, vigente y con el medio de pago correcto da
// null = precio de siempre.
//
//   node --experimental-strip-types scripts/test-promos.mjs
//
// El vector de oro lo genera Vigilant (clearance_agent/promociones.py,
// token_checkout) con el mismo secreto y nonce: si una de las dos puntas
// cambia el formato, esto se rompe.
import assert from 'node:assert/strict';
import {
  verificarToken, promoDelPedido, honorariosPromo, aplicaConMedio, PROMOS,
} from '../src/lib/server/promos.ts';

const SECRETO = 'k'.repeat(40);
const ORO = 'bf2026.1796093999.abcdefghijklmnop.rlpuK_Nxis7gNcb213keoAIIr_206AUZ3x1aNgJddOM';
const ANTES = new Date('2026-11-27T00:00:00Z');
const ULTIMO = new Date('2026-12-01T02:59:59Z');
const DESPUES = new Date('2026-12-01T03:00:00Z');
const ARANCEL = 42043, LISTA = 77526;

let n = 0;
async function caso(nombre, fn) { await fn(); n++; console.log('ok -', nombre); }

await caso('el token de Vigilant verifica', async () => {
  const v = await verificarToken(ORO, SECRETO, ANTES);
  assert.equal(v.promo.id, 'bf2026');
  assert.equal(v.nonce, 'abcdefghijklmnop');
  assert.ok(await verificarToken(ORO, SECRETO, ULTIMO));
});

await caso('vencido no vale', async () => {
  assert.equal(await verificarToken(ORO, SECRETO, DESPUES), null);
});

await caso('otro secreto, sin secreto o secreto corto no vale', async () => {
  assert.equal(await verificarToken(ORO, 'z'.repeat(40), ANTES), null);
  assert.equal(await verificarToken(ORO, undefined, ANTES), null);
  assert.equal(await verificarToken(ORO, '', ANTES), null);
  assert.equal(await verificarToken(ORO, 'k'.repeat(31), ANTES), null);
});

await caso('cualquier byte tocado no vale', async () => {
  const p = ORO.split('.');
  const variantes = [
    ['bf2027', p[1], p[2], p[3]],
    [p[0], String(Number(p[1]) - 1), p[2], p[3]],          // exp distinto
    [p[0], p[1], 'abcdefghijklmnoq', p[3]],                 // nonce distinto
    [p[0], p[1], p[2], p[3].slice(0, -1) + (p[3].endsWith('M') ? 'N' : 'M')],
  ];
  for (const v of variantes) assert.equal(await verificarToken(v.join('.'), SECRETO, ANTES), null, v.join('.'));
});

await caso('basura, códigos «adivinables» y tipos raros no valen ni rompen', async () => {
  for (const t of ['BLACKFRIDAY', 'blackfriday', 'bf2026', '', ' ', 'a.b.c.d', ORO + '.x', 'x'.repeat(500),
    null, undefined, 123, {}, [], ORO.replace(/\./g, '..')]) {
    assert.equal(await verificarToken(t, SECRETO, ANTES), null, String(t));
  }
});

await caso('un token firmado que dura más que la promo no vale', async () => {
  // Firmado bien pero con exp después del fin de la promo: se arma acá con la
  // misma receta para probar que el tope lo pone el servidor, no la firma.
  const enc = new TextEncoder();
  const hm = async (k, m) => new Uint8Array(await crypto.subtle.sign('HMAC',
    await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(m)));
  const b64 = b => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const clave = await hm(enc.encode(SECRETO), 'unamarca-promo-v1');
  const cuerpo = 'bf2026.1799999999.abcdefghijklmnop';
  const largo = `${cuerpo}.${b64(await hm(clave, cuerpo))}`;
  assert.equal(await verificarToken(largo, SECRETO, ANTES), null);
});

await caso('el pedido: sólo con transferencia y con un número coherente', async () => {
  const ok = await promoDelPedido(ORO, 'transferencia', SECRETO, ARANCEL, LISTA, ANTES);
  assert.equal(ok.honorarios, 56957);
  assert.equal(await promoDelPedido(ORO, 'mercadopago', SECRETO, ARANCEL, LISTA, ANTES), null);
  assert.equal(await promoDelPedido(ORO, undefined, SECRETO, ARANCEL, LISTA, ANTES), null);
  assert.equal(await promoDelPedido('BLACKFRIDAY', 'transferencia', SECRETO, ARANCEL, LISTA, ANTES), null);
  assert.equal(await promoDelPedido(ORO, 'transferencia', SECRETO, ARANCEL, LISTA, DESPUES), null);
  // Un arancel que se come la promo, o una promo que no descuenta: sin descuento.
  assert.equal(await promoDelPedido(ORO, 'transferencia', SECRETO, 99000, LISTA, ANTES), null);
  assert.equal(await promoDelPedido(ORO, 'transferencia', SECRETO, ARANCEL, 50000, ANTES), null);
});

await caso('honorariosPromo y aplicaConMedio fallan cerrado', async () => {
  const bf = PROMOS[0];
  assert.equal(honorariosPromo(bf, ARANCEL, LISTA), 56957);
  assert.equal(honorariosPromo(bf, NaN, LISTA), null);
  assert.equal(aplicaConMedio(bf, 'transferencia'), true);
  assert.equal(aplicaConMedio(bf, 'MERCADOPAGO'), false);
  assert.equal(aplicaConMedio(null, 'transferencia'), false);
});

console.log(`\n${n} casos ok`);
