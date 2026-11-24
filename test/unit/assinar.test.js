import 'fake-indexeddb/auto';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createAssinar } from '../../ext/lib/assinar.js';
import { createVault } from '../../ext/lib/vault.js';
import { createSites } from '../../ext/lib/sites.js';
import { createCredits } from '../../ext/lib/credits.js';
import { parsePfx } from '../../ext/lib/pfx.js';
import { thumbprintOf } from '../../ext/lib/certmodel.js';
import { memoryKv, fakeClock } from './helpers.js';

const forge = createRequire(import.meta.url)('node-forge');
const O = 'https://exemplo.com.br';
let kv, clock, vault, sites, credits, assinar, T, pkcs8, keyBlob;

const pfx = new Uint8Array(fs.readFileSync(new URL('../fix/pf-moderno.pfx', import.meta.url)));

before(async () => {
  const r = parsePfx(forge, pfx, 'senha123');
  pkcs8 = r.pkcs8;
  T = await thumbprintOf(r.certDer);
});

async function setup({ unlocked = true, allowed = true, creditos = 0 } = {}) {
  kv = memoryKv();
  clock = fakeClock(1_000_000);
  vault = createVault({ ...kv, now: clock.now, iterations: 1000 });
  await vault.create('senha-do-cofre');
  keyBlob = await vault.encrypt(pkcs8);
  if (!unlocked) await vault.lock();
  sites = createSites(kv);
  if (allowed) await sites.setAllowed(O, true);
  credits = createCredits({ session: kv.session, now: clock.now });
  if (creditos) await credits.grant(O, T, creditos);
  assinar = createAssinar({ vault, sites, credits });
}
// A chave cifrada (entry.key do certificado) vem do chamador, em key.
const chamar = (extra = {}, fazer = async () => 'ok') =>
  assinar({ origin: O, thumbprint: T, key: keyBlob, ...extra }, fazer);

test('site novo: pede site e assinatura, sem chamar fazer', async () => {
  await setup({ allowed: false, creditos: 1 });
  let chamado = false;
  const r = await chamar({}, async () => { chamado = true; });
  assert.deepEqual(r, { needs: { site: true, sign: { count: 1, thumbprint: T } } });
  assert.equal(chamado, false);
});

test('cofre travado: pede unlock e assinatura', async () => {
  await setup({ unlocked: false, creditos: 1 });
  const r = await chamar();
  assert.deepEqual(r, { needs: { unlock: true, sign: { count: 1, thumbprint: T } } });
});

test('novoLote: pede assinatura mesmo com crédito, e não consome', async () => {
  await setup({ creditos: 2 });
  const r = await chamar({ novoLote: true, quantidade: 2 });
  assert.deepEqual(r, { needs: { sign: { count: 2, thumbprint: T } } });
  assert.equal(await credits.has(O, T), true);
});

test('sem crédito: pede assinatura', async () => {
  await setup();
  assert.deepEqual(await chamar(), { needs: { sign: { count: 1, thumbprint: T } } });
});

test('sign extra é mesclado em needs.sign', async () => {
  await setup();
  const r = await chamar({ sign: { motivo: 'peticionar', sistema: 'PJe' } });
  assert.deepEqual(r, {
    needs: { sign: { motivo: 'peticionar', sistema: 'PJe', count: 1, thumbprint: T } },
  });
});

test('com crédito: consome, decifra, chama fazer e devolve o valor', async () => {
  await setup({ creditos: 1 });
  let recebido;
  const r = await chamar({}, async (p) => {
    recebido = new Uint8Array(p);
    return 42;
  });
  assert.deepEqual(r, { valor: 42 });
  assert.deepEqual(recebido, pkcs8);
  assert.equal(await credits.has(O, T), false);
});

test('a chave passada a fazer é zerada depois', async () => {
  await setup({ creditos: 1 });
  let ref;
  await chamar({}, async (p) => { ref = p; return 1; });
  assert.ok(ref.length > 0);
  assert.ok(ref.every((b) => b === 0));
});

test('exceção dentro de fazer também zera a chave e se propaga', async () => {
  await setup({ creditos: 1 });
  let ref;
  await assert.rejects(
    chamar({}, async (p) => { ref = p; throw new Error('falhou'); }),
    /falhou/,
  );
  assert.ok(ref.every((b) => b === 0));
});

test('quantidade 3 com 3 créditos: consome os 3 e assina uma vez', async () => {
  await setup({ creditos: 3 });
  let vezes = 0;
  const r = await chamar({ quantidade: 3 }, async () => { vezes++; return 'x'; });
  assert.deepEqual(r, { valor: 'x' });
  assert.equal(vezes, 1);
  assert.equal(await credits.has(O, T), false);
});

test('crédito acaba no meio: devolve needs.sign e não assina', async () => {
  await setup({ creditos: 2 });
  let chamado = false;
  const r = await chamar({ quantidade: 3 }, async () => { chamado = true; });
  assert.deepEqual(r, { needs: { sign: { count: 3, thumbprint: T } } });
  assert.equal(chamado, false);
});

test('cofre trava entre a conferência e a decifragem: pede unlock', async () => {
  await setup({ creditos: 1 });
  const original = credits.consume.bind(credits);
  credits.consume = async (...a) => {
    const ok = await original(...a);
    await vault.lock();
    return ok;
  };
  const r = await chamar();
  assert.deepEqual(r, { needs: { unlock: true, sign: { count: 1, thumbprint: T } } });
});
