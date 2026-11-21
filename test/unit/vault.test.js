import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVault, PBKDF2_ITERATIONS, IDLE_MS, BACKOFF_S, MIN_PASSWORD } from '../../ext/lib/vault.js';
import { browserKv } from '../../ext/lib/kv.js';
import { memoryKv, fakeClock } from './helpers.js';

const PW = 'senha-correta-123';

function setup() {
  const kv = memoryKv();
  const clock = fakeClock(1_000_000);
  const vault = createVault({ ...kv, now: clock.now, iterations: 1000 });
  return { kv, clock, vault };
}

test('constantes do brief', () => {
  assert.equal(PBKDF2_ITERATIONS, 600000);
  assert.equal(IDLE_MS, 1800000);
  assert.deepEqual(BACKOFF_S, [0, 0, 0, 5, 15, 30, 60, 300]);
  assert.equal(MIN_PASSWORD, 8);
});

test('o padrão de iterações (600000) é gravado em vaultMeta', async () => {
  const kv = memoryKv();
  const v = createVault({ ...kv, now: fakeClock(0).now });
  await v.create(PW);
  assert.equal((await kv.local.get('vaultMeta')).iterations, 600000);
});

test('cria, cifra, trava, destrava, decifra', async () => {
  const { vault } = setup();
  assert.equal(await vault.exists(), false);
  await vault.create(PW);
  assert.equal(await vault.exists(), true);
  assert.equal(await vault.isUnlocked(), true);
  const x = new Uint8Array([1, 2, 3, 250, 0, 7]);
  const enc = await vault.encrypt(x);
  assert.equal(typeof enc.iv, 'string');
  assert.equal(typeof enc.data, 'string');
  await vault.lock();
  assert.equal(await vault.isUnlocked(), false);
  await assert.rejects(() => vault.decrypt(enc), /travado/);
  await assert.rejects(() => vault.encrypt(x), /travado/);
  assert.deepEqual(await vault.unlock(PW), { ok: true });
  assert.deepEqual([...(await vault.decrypt(enc))], [...x]);
});

test('create recusa cofre existente', async () => {
  const { vault } = setup();
  await vault.create(PW);
  await assert.rejects(() => vault.create(PW), /ja-existe/);
});

test('senha errada não destrava', async () => {
  const { vault } = setup();
  await vault.create(PW);
  await vault.lock();
  const r = await vault.unlock('senha-errada-1');
  assert.equal(r.ok, false);
  assert.equal(await vault.isUnlocked(), false);
});

test('unlock simultâneos com senha errada contam todas as falhas', async () => {
  const { vault, kv } = setup();
  await vault.create(PW);
  await vault.lock();
  const rs = await Promise.all([1, 2].map(() => vault.unlock('errada-errada')));
  assert.deepEqual(rs.map((r) => r.ok), [false, false]);
  assert.equal((await kv.local.get('lockout')).failures, 2);
  const more = await Promise.all([1, 2, 3].map(() => vault.unlock('errada-errada')));
  // 3ª falha ainda sem espera; 4ª: 5 s; 5ª chamada cai na espera sem contar.
  assert.equal(more[1].waitMs, 5000);
  assert.equal(more[2].ok, false);
  assert.equal((await kv.local.get('lockout')).failures, 4);
});

test('senha é normalizada em NFC', async () => {
  const { vault } = setup();
  await vault.create('sen\u0068a-cafe\u0301-ok'); // e + acento combinante
  await vault.lock();
  assert.deepEqual(await vault.unlock('senha-caf\u00e9-ok'), { ok: true });
});

test('iterações gravadas fora da faixa: cofre corrompido', async () => {
  const kv = memoryKv();
  const v = createVault({ ...kv, now: fakeClock(0).now });
  await v.create(PW);
  const meta = await kv.local.get('vaultMeta');
  await kv.local.set('vaultMeta', { ...meta, iterations: 5 });
  await v.lock();
  await assert.rejects(() => v.unlock(PW), /cofre-corrompido/);
  assert.equal(await kv.local.get('lockout'), undefined);
});

test('espera crescente', async () => {
  const { vault, clock } = setup();
  await vault.create(PW);
  await vault.lock();
  const waits = [];
  for (let i = 1; i <= 9; i++) {
    const r = await vault.unlock('errada-errada');
    assert.equal(r.ok, false);
    waits.push(r.waitMs);
    clock.advance(r.waitMs + 1);
  }
  assert.deepEqual(BACKOFF_S, [0, 0, 0, 5, 15, 30, 60, 300]);
  assert.deepEqual(waits.slice(0, 3), [0, 0, 0]);
  assert.equal(waits[3], 5000); // 4ª falha
  assert.equal(waits[4], 15000);
  assert.equal(waits[7], 300000); // 8ª
  assert.equal(waits[8], 300000); // 9ª
});

test('durante a espera nem a senha certa destrava', async () => {
  const { vault, clock } = setup();
  await vault.create(PW);
  await vault.lock();
  for (let i = 0; i < 4; i++) await vault.unlock('errada-errada');
  clock.advance(1000);
  const r = await vault.unlock(PW);
  assert.equal(r.ok, false);
  assert.equal(r.waitMs, 4000);
  assert.equal(await vault.isUnlocked(), false);
  clock.advance(4000);
  assert.deepEqual(await vault.unlock(PW), { ok: true });
});

test('sucesso zera o bloqueio', async () => {
  const { vault, kv, clock } = setup();
  await vault.create(PW);
  await vault.lock();
  for (let i = 0; i < 4; i++) await vault.unlock('errada-errada');
  clock.advance(5001);
  assert.deepEqual(await vault.unlock(PW), { ok: true });
  assert.equal(await kv.local.get('lockout'), undefined);
});

test('trava após 30 minutos sem uso', async () => {
  const { vault, clock } = setup();
  await vault.create(PW);
  clock.advance(IDLE_MS);
  assert.equal(await vault.isUnlocked(), true);
  clock.advance(1);
  assert.equal(await vault.isUnlocked(), false);
  await assert.rejects(() => vault.encrypt(new Uint8Array(1)), /travado/);
});

test('touch adia o travamento', async () => {
  const { vault, clock } = setup();
  await vault.create(PW);
  clock.advance(IDLE_MS - 1000);
  await vault.touch();
  clock.advance(IDLE_MS - 1000);
  assert.equal(await vault.isUnlocked(), true);
});

test('vaultMeta e local nunca contêm a chave do cofre', async () => {
  const { vault, kv } = setup();
  await vault.create(PW);
  const key = await kv.session.get('vaultKey');
  assert.equal(typeof key, 'string');
  assert.equal(await kv.local.get('vaultKey'), undefined);
  assert.ok(!JSON.stringify(await kv.local.get('vaultMeta')).includes(key));
  assert.equal(Buffer.from(key, 'base64').length, 32);
  await vault.lock();
  assert.equal(await kv.session.get('vaultKey'), undefined);
});

test('senha com menos de 8 caracteres é recusada', async () => {
  const { vault } = setup();
  await assert.rejects(() => vault.create('1234567'), /senha-curta/);
  assert.equal(await vault.exists(), false);
});

test('destroy apaga cofre e estado', async () => {
  const { vault, kv } = setup();
  await vault.create(PW);
  await vault.destroy();
  assert.equal(await vault.exists(), false);
  assert.equal(await vault.isUnlocked(), false);
  assert.equal(await kv.local.get('lockout'), undefined);
});

test('browserKv é função importável sem chrome', () => {
  assert.equal(typeof browserKv, 'function');
});
