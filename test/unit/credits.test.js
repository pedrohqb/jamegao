import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCredits, CREDIT_TTL_MS, MAX_SIGNATURES } from '../../ext/lib/credits.js';
import { memoryKv, fakeClock } from './helpers.js';

const O = 'https://esaj.tjsp.jus.br';
const T = 'AA11';
function setup() {
  const kv = memoryKv();
  const clock = fakeClock(1000);
  return { kv, clock, c: createCredits({ session: kv.session, now: clock.now }) };
}

test('constantes', () => {
  assert.equal(CREDIT_TTL_MS, 300000);
  assert.equal(MAX_SIGNATURES, 500);
});

test('crédito é por origem e por certificado', async () => {
  const { c } = setup();
  await c.grant(O, T, 1);
  assert.equal(await c.has(O, T), true);
  assert.equal(await c.consume('https://outra.example', T), false);
  assert.equal(await c.consume(O, 'BB22'), false);
  assert.equal(await c.consume(O, T), true);
});

test('crédito acaba na contagem', async () => {
  const { c } = setup();
  await c.grant(O, T, 2);
  assert.equal(await c.consume(O, T), true);
  assert.equal(await c.consume(O, T), true);
  assert.equal(await c.consume(O, T), false);
  assert.equal(await c.has(O, T), false);
});

test('crédito expira em 5 minutos', async () => {
  const { c, clock } = setup();
  await c.grant(O, T, 3);
  clock.advance(CREDIT_TTL_MS);
  assert.equal(await c.has(O, T), true);
  clock.advance(1);
  assert.equal(await c.has(O, T), false);
  assert.equal(await c.consume(O, T), false);
});

test('nova concessão substitui a anterior', async () => {
  const { c, clock } = setup();
  await c.grant(O, T, 1);
  clock.advance(CREDIT_TTL_MS - 1);
  await c.grant(O, T, 2);
  clock.advance(10);
  assert.equal(await c.consume(O, T), true);
  assert.equal(await c.consume(O, T), true);
  assert.equal(await c.consume(O, T), false);
});

test('grant valida a contagem', async () => {
  const { c } = setup();
  for (const bad of [0, -1, 1.5, MAX_SIGNATURES + 1, '3', NaN, undefined]) {
    await assert.rejects(() => c.grant(O, T, bad), `count ${String(bad)}`);
  }
  await c.grant(O, T, MAX_SIGNATURES);
  assert.equal(await c.has(O, T), true);
});

test('clear zera tudo', async () => {
  const { c } = setup();
  await c.grant(O, T, 2);
  await c.clear();
  assert.equal(await c.has(O, T), false);
});
