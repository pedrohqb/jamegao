import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parsePfx } from '../../ext/lib/pfx.js';
import { buildModel, thumbprintOf, parseDadosPessoa } from '../../ext/lib/certmodel.js';
import { signData } from '../../ext/lib/rsa.js';
import { gerar } from '../fix/gerar.mjs';

const forge = createRequire(import.meta.url)('node-forge');
const fix = (n) => new Uint8Array(fs.readFileSync(new URL(`../fix/${n}`, import.meta.url)));
let tmp;
const gen = (n) => new Uint8Array(fs.readFileSync(path.join(tmp, n)));
const model = async (r) => buildModel(forge, r.cert, await thumbprintOf(r.certDer));

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jamegao-fix-'));
  await gerar(tmp);
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('lê PFX moderno, 3DES e legado', () => {
  for (const [f, s] of [['pf-moderno.pfx', 'senha123'], ['pf-3des.pfx', 'senha123'], ['pj-legado.pfx', 'outra senha']]) {
    const r = parsePfx(forge, fix(f), s);
    assert.ok(r.pkcs8.length > 1000, f);
    assert.ok(r.certDer.length > 300, f);
  }
});

test('pessoa física', async () => {
  const m = await model(parsePfx(forge, fix('pf-moderno.pfx'), 'senha123'));
  assert.equal(m.pkiBrazil.cpf, '12345678909');
  assert.equal(m.pkiBrazil.oabNumero, '344323');
  assert.equal(m.pkiBrazil.oabUF, 'SP');
  assert.equal(m.pkiBrazil.rgEmissor, 'SSP');
  assert.equal(m.pkiBrazil.rgEmissorUF, 'SP');
  assert.equal(m.pkiBrazil.certificateType, 'A1');
  assert.equal(m.isRemote, false);
  assert.match(m.thumbprint, /^[A-Za-z0-9+/]{43}=$/);
});

test('pessoa jurídica com CNPJ alfanumérico', async () => {
  const m = await model(parsePfx(forge, fix('pj-legado.pfx'), 'outra senha'));
  assert.equal(m.pkiBrazil.cnpj, '12ABC34501DE35');
  assert.equal(m.pkiBrazil.responsavel, 'JOSÉ DA CONCEIÇÃO');
  assert.equal(m.pkiBrazil.companyName, 'EMPRESA: TESTE LTDA');
});

test('senha errada', () =>
  assert.throws(() => parsePfx(forge, fix('pf-moderno.pfx'), 'x'), { message: 'Senha incorreta ou arquivo corrompido.' }));

test('senha vazia', () => {
  const r = parsePfx(forge, gen('senha-vazia.pfx'), '');
  assert.ok(r.pkcs8.length > 1000);
});

test('chave EC', () =>
  assert.throws(() => parsePfx(forge, gen('ec.pfx'), 'senha123'), { message: /não é RSA/ }));

test('arquivo que não é PKCS#12', () => {
  assert.throws(() => parsePfx(forge, new TextEncoder().encode('oi'), ''), { message: /não é um certificado/ });
  assert.throws(() => parsePfx(forge, new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x05]), ''), { message: /não é um certificado/ });
});

test('PFX com cadeia escolhe o certificado da chave', async () => {
  const r = parsePfx(forge, gen('cadeia.pfx'), 'senha123');
  const m = await model(r);
  assert.equal(m.subjectName, 'TITULAR COM CADEIA');
  assert.equal(m.issuerName, 'AC DE TESTE');
});

test('vencido e quase vencendo mantêm a validade do certificado', async () => {
  const v = await model(parsePfx(forge, gen('vencido.pfx'), 'senha123'));
  assert.equal(v.validityEnd.slice(0, 4), '2020');
  const q = await model(parsePfx(forge, gen('quase.pfx'), 'senha123'));
  const dias = (Date.parse(q.validityEnd) - Date.now()) / 86400000;
  assert.ok(dias > 9 && dias < 11, String(dias));
});

test('pkcs8 lido assina igual ao node:crypto', async () => {
  const r = parsePfx(forge, fix('pf-moderno.pfx'), 'senha123');
  const data = new TextEncoder().encode('conteúdo a assinar');
  const esperado = crypto.sign('sha256', data, fs.readFileSync(new URL('../fix/pf.key', import.meta.url)));
  assert.deepEqual(Buffer.from(await signData(r.pkcs8, data, 'SHA-256')), esperado);
});

// ---- parsing do campo de dados e otherNames isolados ----
const dados = (emissor) => '01011990' + '12345678909' + '00000000000' + '000000012345678' + emissor;
for (const [emissor, org, uf] of [
  ['SSPSP', 'SSP', 'SP'], ['SSP/SP', 'SSP', 'SP'], ['SSP SP', 'SSP', 'SP'],
  ['SSP', 'SSP', null], ['SES', 'SES', null], ['DETRAN', 'DETRAN', null], ['PCSP', 'PC', 'SP'],
]) {
  test(`emissor do RG ${emissor}`, () => {
    const r = parseDadosPessoa(dados(emissor));
    assert.equal(r.rgEmissor, org);
    assert.equal(r.rgEmissorUF, uf);
  });
}

function fakeCert(cn, otherNames) {
  const { asn1 } = forge;
  return {
    subject: { getField: () => ({ value: cn, valueTagClass: asn1.Type.PRINTABLESTRING }), attributes: [] },
    issuer: { getField: () => ({ value: 'AC', valueTagClass: asn1.Type.PRINTABLESTRING }), attributes: [] },
    validity: { notBefore: new Date(0), notAfter: new Date(1e12) },
    getExtension: (n) => n === 'subjectAltName'
      ? { altNames: Object.entries(otherNames).map(([oid, v]) => ({
          type: 0, value: [{ value: asn1.oidToDer(oid).getBytes() }, { value: [{ value: v }] }] })) }
      : null,
  };
}

test('responsável da PJ só com 2.16.76.1.3.4 e CNPJ numérico', () => {
  const m = buildModel(forge, fakeCert('EMPRESA: X LTDA', {
    '2.16.76.1.3.3': '12345678000195',
    '2.16.76.1.3.2': 'MARIA SOUZA',
    '2.16.76.1.3.4': dados('SSPSP'),
  }), 't');
  assert.equal(m.pkiBrazil.cnpj, '12345678000195');
  assert.equal(m.pkiBrazil.isPessoaJuridica, true);
  assert.equal(m.pkiBrazil.responsavel, 'MARIA SOUZA');
  assert.equal(m.pkiBrazil.rgEmissor, 'SSP');
  assert.equal(m.pkiBrazil.rgEmissorUF, 'SP');
  assert.equal(m.pkiBrazil.companyName, 'EMPRESA');
});

test('dados do titular 2.16.76.1.3.1 isolado não traz CNPJ', () => {
  const m = buildModel(forge, fakeCert('FULANO', { '2.16.76.1.3.1': dados('SSP') }), 't');
  assert.equal(m.pkiBrazil.cpf, '12345678909');
  assert.equal(m.pkiBrazil.cnpj, null);
  assert.equal(m.pkiBrazil.rgEmissor, 'SSP');
  assert.equal(m.pkiBrazil.rgEmissorUF, null);
});
