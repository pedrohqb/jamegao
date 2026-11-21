import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSites } from '../../ext/lib/sites.js';
import { memoryKv } from './helpers.js';

const O = 'https://esaj.tjsp.jus.br';
const setup = () => { const kv = memoryKv(); return { kv, s: createSites(kv) }; };

test('origem desconhecida: sem decisão e sem preferência', async () => {
  const { s } = setup();
  assert.deepEqual(await s.get(O), { allowed: undefined, preferOfficial: false });
});

test('anuncia só com certificado, sem bloqueio e sem preferência pela oficial', async () => {
  const { s } = setup();
  assert.equal(await s.shouldAnnounce(O, 0), false);
  assert.equal(await s.shouldAnnounce(O, 1), true);
  await s.setAllowed(O, false);
  assert.equal(await s.shouldAnnounce(O, 1), false);
  await s.setAllowed(O, true);
  await s.setPreferOfficial(O, true);
  assert.equal(await s.shouldAnnounce(O, 1), false);
});

test('setAllowed e setPreferOfficial preservam um ao outro; list e remove', async () => {
  const { s } = setup();
  await s.setAllowed(O, true);
  await s.setPreferOfficial(O, true);
  assert.deepEqual(await s.get(O), { allowed: true, preferOfficial: true });
  assert.deepEqual(await s.list(), [{ origin: O, allowed: true, preferOfficial: true }]);
  await s.remove(O);
  assert.deepEqual(await s.list(), []);
  assert.deepEqual(await s.get(O), { allowed: undefined, preferOfficial: false });
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
