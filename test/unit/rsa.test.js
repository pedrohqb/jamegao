import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { b64ToBytes, bytesToB64 } from '../../ext/lib/bytes.js';
import { signData, signHash, normalizeHash, HASH_LEN } from '../../ext/lib/rsa.js';

const pem = readFileSync(new URL('../fix/pf.key', import.meta.url));
const pkcs8 = new Uint8Array(crypto.createPrivateKey(pem).export({ type: 'pkcs8', format: 'der' }));
const ecPkcs8 = new Uint8Array(
  crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'der' }),
);
const data = new TextEncoder().encode('conteúdo a assinar');

for (const [alg, nodeAlg] of [['SHA-1', 'sha1'], ['SHA-256', 'sha256'], ['SHA-384', 'sha384'], ['SHA-512', 'sha512']]) {
  test(`signData ${alg} igual ao node:crypto`, async () => {
    assert.deepEqual(Buffer.from(await signData(pkcs8, data, alg)), crypto.sign(nodeAlg, data, pem));
  });
  test(`signHash ${alg} igual ao signData`, async () => {
    const h = crypto.createHash(nodeAlg).update(data).digest();
    assert.deepEqual(Buffer.from(await signHash(pkcs8, new Uint8Array(h), alg)), crypto.sign(nodeAlg, data, pem));
  });
}

test('resumo de tamanho errado', () =>
  assert.rejects(signHash(pkcs8, new Uint8Array(5), 'SHA-256'), { code: 'bad_request' }));
test('algoritmo herdado do protótipo de objeto', () =>
  assert.throws(() => normalizeHash('constructor'), { code: 'bad_request' }));
test('chave não RSA em signData', () =>
  assert.rejects(signData(ecPkcs8, data, 'SHA-256'), { code: 'bad_request' }));
test('chave não RSA em signHash', () =>
  assert.rejects(signHash(ecPkcs8, new Uint8Array(32), 'SHA-256'), { code: 'bad_request' }));

test('normalizeHash: apelidos, OIDs e padrão', () => {
  assert.equal(normalizeHash('sha256'), 'SHA-256');
  assert.equal(normalizeHash('2.16.840.1.101.3.4.2.3'), 'SHA-512');
  assert.equal(normalizeHash(undefined), 'SHA-256');
  assert.equal(HASH_LEN['SHA-384'], 48);
});

test('base64 ida e volta e erros', () => {
  const b = new Uint8Array([0, 1, 2, 250, 255]);
  assert.deepEqual(b64ToBytes(bytesToB64(b)), b);
  assert.throws(() => b64ToBytes('@@@'), { code: 'bad_request' });
  assert.throws(() => b64ToBytes(undefined), { code: 'bad_request' });
});
