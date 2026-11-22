import 'fake-indexeddb/auto';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { idbKv } from '../../ext/lib/kv.js';

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

test('browserKv persiste no IndexedDB e nunca lê storage.local', async () => {
  const lidas = [];
  globalThis.chrome = {
    storage: {
      local: { get: async (k) => { lidas.push(k); return { sites: { 'https://mau.com.br': { allowed: true } } }; }, set: async () => {}, remove: async () => {} },
      session: { get: async () => ({}), set: async () => {}, remove: async () => {} },
    },
  };
  try {
    const { browserKv } = await import('../../ext/lib/kv.js');
    const kv = browserKv();
    assert.equal(await kv.local.get('sites'), undefined);
    await kv.local.set('sites', { a: 1 });
    assert.deepEqual(await kv.local.get('sites'), { a: 1 });
    assert.deepEqual(lidas, []);
  } finally {
    delete globalThis.chrome;
  }
});
