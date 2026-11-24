import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createVerify, generateKeyPairSync } from 'node:crypto';
import { md5 } from '../../ext/lib/md5.js';
import { signMd5Hash, signHash } from '../../ext/lib/rsa.js';
import { pkiPath } from '../../ext/lib/pkipath.js';

test('md5 confere com o Node em vários tamanhos', () => {
  for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000, 100000]) {
    const data = new Uint8Array(n).map((_, i) => (i * 31 + 7) & 0xff);
    assert.equal(Buffer.from(md5(data)).toString('hex'), createHash('md5').update(data).digest('hex'), `n=${n}`);
  }
});

test('signMd5Hash produz MD5withRSA verificável', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pkcs8 = new Uint8Array(privateKey.export({ type: 'pkcs8', format: 'der' }));
  const msg = new TextEncoder().encode('Mensagem de boas-vindas do PJe ção');
  const sig = await signMd5Hash(pkcs8, md5(msg));
  assert.ok(createVerify('RSA-MD5').update(msg).verify(publicKey, Buffer.from(sig)));
});

test('signMd5Hash rejeita resumo de tamanho errado', async () => {
  await assert.rejects(signMd5Hash(new Uint8Array(1), new Uint8Array(20)));
});

test('o e-SAJ continua sem poder pedir MD5', async () => {
  await assert.rejects(signHash(new Uint8Array(1), new Uint8Array(16), 'MD5'));
});

test('pkiPath é SEQUENCE OF Certificate na ordem do Java (raiz primeiro)', () => {
  const a = new Uint8Array(300).fill(1); // titular
  const b = new Uint8Array(5).fill(2); // raiz
  const p = pkiPath([a, b]);
  assert.deepEqual([...p.subarray(0, 4)], [0x30, 0x82, 0x01, 0x31]);
  assert.equal(p.length, 4 + 305);
  assert.equal(p[4], 2);
  assert.equal(p[4 + 5], 1);
});
