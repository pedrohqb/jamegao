import 'fake-indexeddb/auto';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createAssinar } from '../../ext/lib/assinar.js';
import { createVault } from '../../ext/lib/vault.js';
import { createCerts } from '../../ext/lib/certs.js';
import { createSites } from '../../ext/lib/sites.js';
import { createCredits } from '../../ext/lib/credits.js';
import { parsePfx } from '../../ext/lib/pfx.js';
import { buildModel, thumbprintOf } from '../../ext/lib/certmodel.js';
import { bytesToB64 } from '../../ext/lib/bytes.js';
import { memoryKv, fakeClock } from './helpers.js';

const forge = createRequire(import.meta.url)('node-forge');
const O = 'https://exemplo.com.br';
let kv, clock, vault, certs, sites, credits, assinar, T, pkcs8, certDer, model;

const pfx = new Uint8Array(fs.readFileSync(new URL('../fix/pf-moderno.pfx', import.meta.url)));

before(async () => {
  const r = parsePfx(forge, pfx, 'senha123');
  pkcs8 = r.pkcs8;
  certDer = r.certDer;
  T = await thumbprintOf(r.certDer);
  model = buildModel(forge, r.cert, T);
});

async function setup({ unlocked = true, allowed = true, creditos = 0 } = {}) {
  kv = memoryKv();
  clock = fakeClock(1_000_000);
  vault = createVault({ ...kv, now: clock.now, iterations: 1000 });
  await vault.create('senha-do-cofre');
  certs = createCerts();
  for (const e of await certs.list()) await certs.remove(e.thumbprint);
  await certs.put({
    thumbprint: T, model, certB64: bytesToB64(certDer), key: await vault.encrypt(pkcs8), importedAt: '2026-11-21T00:00:00.000Z',
  });
  if (!unlocked) await vault.lock();
  sites = createSites(kv);
  if (allowed) await sites.setAllowed(O, true);
  credits = createCredits({ session: kv.session, now: clock.now });
  if (creditos) await credits.grant(O, T, creditos);
  assinar = createAssinar({ vault, sites, credits, certs });
}
const chamar = (extra = {}, fazer = async () => 'ok') =>
  assinar({ origin: O, thumbprint: T, ...extra }, fazer);

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

test('certificado desconhecido: erra e não consome crédito', async () => {
  await setup({ creditos: 1 });
  await assert.rejects(
    assinar({ origin: O, thumbprint: 'AAAA' }, async () => 1),
    (e) => e.code === 'certificate_not_found',
  );
  assert.equal(await credits.has(O, T), true);
});

for (const n of [0, -1, 1.5, 501, '3', null, NaN]) {
  test(`quantidade ${String(n)} é bad_request, sem tocar nos créditos`, async () => {
    await setup({ creditos: 5 });
    await assert.rejects(chamar({ quantidade: n }), (e) => e.code === 'bad_request');
    assert.equal(await credits.has(O, T), true);
  });
}

test('motivo em sign: confere e consome o crédito daquele motivo', async () => {
  await setup();
  await credits.grant(O, T, 1, 'login');
  const r = await chamar({ sign: { motivo: 'documentos' } });
  assert.deepEqual(r, { needs: { sign: { motivo: 'documentos', count: 1, thumbprint: T } } });
  assert.equal(await credits.has(O, T, 'login'), true);
  assert.deepEqual(await chamar(), { needs: { sign: { count: 1, thumbprint: T } } }, 'nem o e-SAJ (sem motivo) gasta');
  assert.deepEqual(await chamar({ sign: { motivo: 'login' } }), { valor: 'ok' });
  assert.equal(await credits.has(O, T, 'login'), false);
});

test('crédito do e-SAJ (sem motivo) não serve a pedido com motivo', async () => {
  await setup({ creditos: 1 });
  assert.equal((await chamar({ sign: { motivo: 'login' } })).needs.sign.motivo, 'login');
  assert.deepEqual(await chamar(), { valor: 'ok' });
});
