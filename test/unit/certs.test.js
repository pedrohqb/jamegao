import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCerts } from '../../ext/lib/certs.js';

const entry = (thumbprint, nome = 'A') => ({
  thumbprint,
  model: { subjectName: nome, thumbprint },
  certB64: 'AAAA',
  key: { iv: new Uint8Array(12), data: new Uint8Array([1, 2, 3]) },
  importedAt: '2026-11-21T00:00:00.000Z',
});

test('put duas vezes com o mesmo thumbprint deixa um só', async () => {
  const c = createCerts();
  await c.put(entry('t1', 'primeiro'));
  await c.put(entry('t1', 'segundo'));
  assert.equal(await c.count(), 1);
  assert.equal((await c.get('t1')).model.subjectName, 'segundo');
});

test('list, get e remove', async () => {
  const c = createCerts();
  await c.put(entry('t2'));
  const all = await c.list();
  assert.deepEqual(all.map((e) => e.thumbprint).sort(), ['t1', 't2']);
  assert.deepEqual((await c.get('t2')).key.data, new Uint8Array([1, 2, 3]));
  await c.remove('t1');
  assert.equal(await c.get('t1'), undefined);
  assert.equal(await c.count(), 1);
});
