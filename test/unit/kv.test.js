import 'fake-indexeddb/auto';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { idbKv } from '../../ext/lib/kv.js';
import { memoryKv } from './helpers.js';

beforeEach(async () => {
  await new Promise((res) => { const r = indexedDB.deleteDatabase('jamegao'); r.onsuccess = r.onerror = r.onblocked = res; });
});

test('grava, lê com valor padrão e apaga', async () => {
  const kv = idbKv();
  assert.equal(await kv.get('x', 7), 7);
  await kv.set('x', { a: [1, 2] });
  assert.deepEqual(await kv.get('x'), { a: [1, 2] });
  await kv.remove('x');
  assert.equal(await kv.get('x'), undefined);
});

test('guarda cópia: mudar o objeto depois não muda o gravado', async () => {
  const kv = idbKv();
  const v = { n: 1 };
  await kv.set('v', v);
  v.n = 2;
  assert.deepEqual(await kv.get('v'), { n: 1 });
});

test('migra cofre, tentativas e sites de storage.local uma vez e apaga de lá', async () => {
  const legado = memoryKv().local;
  await legado.set('vaultMeta', { salt: 's', iterations: 600000, check: {} });
  await legado.set('lockout', { failures: 3, until: 0 });
  await legado.set('sites', { 'https://esaj.tjsp.jus.br': { allowed: true } });
  await legado.set('outra', 1);
  const kv = idbKv({ legado });
  assert.equal((await kv.get('vaultMeta')).salt, 's');
  assert.equal((await kv.get('lockout')).failures, 3);
  assert.equal((await kv.get('sites'))['https://esaj.tjsp.jus.br'].allowed, true);
  for (const k of ['vaultMeta', 'lockout', 'sites']) assert.equal(await legado.get(k), undefined, k);
  assert.equal(await legado.get('outra'), 1); // não é nosso: fica
});

test('depois da migração, o que aparecer em storage.local é ignorado', async () => {
  const legado = memoryKv().local;
  await idbKv({ legado }).get('qualquer');
  // Um script de conteúdo comprometido grava ali depois:
  await legado.set('sites', { 'https://mau.com.br': { allowed: true } });
  await legado.set('lockout', { failures: 0, until: 0 });
  const kv = idbKv({ legado });
  assert.equal(await kv.get('sites'), undefined);
  assert.equal(await kv.get('lockout'), undefined);
});

test('migração não sobrescreve o que já está no IndexedDB', async () => {
  await idbKv().set('lockout', { failures: 5, until: 9 });
  const legado = memoryKv().local;
  await legado.set('lockout', { failures: 0, until: 0 });
  assert.deepEqual(await idbKv({ legado }).get('lockout'), { failures: 5, until: 9 });
});
