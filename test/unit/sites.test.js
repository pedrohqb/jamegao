import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSites } from '../../ext/lib/sites.js';
import { memoryKv } from './helpers.js';

const O = 'https://esaj.tjsp.jus.br';
const setup = () => { const kv = memoryKv(); return { kv, s: createSites(kv) }; };

test('origem desconhecida: sem decisão', async () => {
  const { s } = setup();
  assert.deepEqual(await s.get(O), { allowed: undefined });
});

test('anuncia só com certificado e sem bloqueio', async () => {
  const { s } = setup();
  assert.equal(await s.shouldAnnounce(O, 0), false);
  assert.equal(await s.shouldAnnounce(O, 1), true);
  await s.setAllowed(O, false);
  assert.equal(await s.shouldAnnounce(O, 1), false);
  await s.setAllowed(O, true);
  assert.equal(await s.shouldAnnounce(O, 1), true);
});

test('setAllowed, list e remove', async () => {
  const { s } = setup();
  await s.setAllowed(O, true);
  assert.deepEqual(await s.get(O), { allowed: true });
  assert.deepEqual(await s.list(), [{ origin: O, allowed: true }]);
  await s.remove(O);
  assert.deepEqual(await s.list(), []);
  assert.deepEqual(await s.get(O), { allowed: undefined });
});

test('preferência antiga pela oficial, gravada pela 0.1.0, é ignorada', async () => {
  const { kv, s } = setup();
  await kv.local.set('sites', { [O]: { allowed: true, preferOfficial: true } });
  assert.deepEqual(await s.get(O), { allowed: true });
  assert.equal(await s.shouldAnnounce(O, 1), true);
});

test('noteOfficial vai para a sessão e não entra em list', async () => {
  const { kv, s } = setup();
  assert.equal(await s.officialSeen(O), false);
  await s.noteOfficial(O);
  await s.noteOfficial(O);
  assert.equal(await s.officialSeen(O), true);
  assert.equal(await s.officialSeen('https://outro.example'), false);
  assert.deepEqual(await kv.session.get('officialSeen'), [O]);
  assert.deepEqual(await s.list(), []);
});

test('certCount inválido não anuncia', async () => {
  const { s } = setup();
  for (const bad of [undefined, NaN, null, '1x']) assert.equal(await s.shouldAnnounce(O, bad), false);
});

test('gravações concorrentes não se perdem', async () => {
  const { s } = setup();
  const O2 = 'https://outra.example';
  await Promise.all([s.setAllowed(O, true), s.setAllowed(O2, true), s.setAllowed(O, false)]);
  assert.deepEqual(await s.get(O), { allowed: false });
  assert.equal((await s.get(O2)).allowed, true);
  await Promise.all([s.noteOfficial(O), s.noteOfficial(O2)]);
  assert.equal(await s.officialSeen(O), true);
  assert.equal(await s.officialSeen(O2), true);
  await Promise.all([s.remove(O), s.setAllowed(O2, false)]);
  assert.deepEqual((await s.list()).map((x) => x.origin), [O2]);
});
