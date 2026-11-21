// Gera, em uma pasta, os PFX de teste que não ficam versionados:
// ec.pfx, senha-vazia.pfx, cadeia.pfx, vencido.pfx, quase.pfx.
// RSA e cadeia: node-forge. EC: node:crypto + `openssl pkcs12`, porque o
// node-forge não empacota chave EC em PKCS#12.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const forge = createRequire(import.meta.url)('node-forge');
const DAY = 86400000;

const rsaKey = () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return forge.pki.privateKeyFromPem(privateKey.export({ type: 'pkcs1', format: 'pem' }));
};

function makeCert({ key, cn, issuerCert, issuerKey, notBefore, notAfter, ca = false }) {
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.setRsaPublicKey(key.n, key.e);
  cert.serialNumber = '0' + crypto.randomBytes(8).toString('hex');
  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;
  const attrs = [{ name: 'commonName', value: cn }];
  cert.setSubject(attrs);
  cert.setIssuer(issuerCert ? issuerCert.subject.attributes : attrs);
  cert.setExtensions([{ name: 'basicConstraints', cA: ca }]);
  cert.sign(issuerKey || key, forge.md.sha256.create());
  return cert;
}

function writePfx(file, key, certs, password) {
  const asn1 = forge.pkcs12.toPkcs12Asn1(key, certs, password, { algorithm: '3des' });
  fs.writeFileSync(file, Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary'));
}

export async function gerar(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const now = Date.now();
  const valid = [new Date(now - DAY), new Date(now + 365 * DAY)];

  const k = rsaKey();
  writePfx(path.join(dir, 'senha-vazia.pfx'), k, [makeCert({ key: k, cn: 'SENHA VAZIA', notBefore: valid[0], notAfter: valid[1] })], '');

  const caKey = rsaKey();
  const ca = makeCert({ key: caKey, cn: 'AC DE TESTE', notBefore: valid[0], notAfter: valid[1], ca: true });
  const leafKey = rsaKey();
  const leaf = makeCert({ key: leafKey, cn: 'TITULAR COM CADEIA', issuerCert: ca, issuerKey: caKey, notBefore: valid[0], notAfter: valid[1] });
  writePfx(path.join(dir, 'cadeia.pfx'), leafKey, [ca, leaf], 'senha123');

  const vk = rsaKey();
  writePfx(path.join(dir, 'vencido.pfx'), vk,
    [makeCert({ key: vk, cn: 'VENCIDO', notBefore: new Date('2019-01-01T00:00:00Z'), notAfter: new Date('2020-01-01T00:00:00Z') })], 'senha123');

  const qk = rsaKey();
  writePfx(path.join(dir, 'quase.pfx'), qk,
    [makeCert({ key: qk, cn: 'QUASE VENCIDO', notBefore: valid[0], notAfter: new Date(now + 10 * DAY) })], 'senha123');

  // EC: chave e certificado autoassinado pelo openssl.
  const ecKey = path.join(dir, 'ec.key');
  const ecCrt = path.join(dir, 'ec.crt');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
    '-keyout', ecKey, '-out', ecCrt, '-days', '365', '-subj', '/CN=CHAVE EC'], { stdio: 'ignore' });
  execFileSync('openssl', ['pkcs12', '-export', '-inkey', ecKey, '-in', ecCrt, '-out', path.join(dir, 'ec.pfx'),
    '-passout', 'pass:senha123'], { stdio: 'ignore' });
  fs.rmSync(ecKey);
  fs.rmSync(ecCrt);
}
