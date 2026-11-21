import 'fake-indexeddb/auto';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createCommands } from '../../ext/lib/commands.js';
import { createVault } from '../../ext/lib/vault.js';
import { createCerts } from '../../ext/lib/certs.js';
import { createSites } from '../../ext/lib/sites.js';
import { createCredits } from '../../ext/lib/credits.js';
import { parsePfx } from '../../ext/lib/pfx.js';
import { buildModel, thumbprintOf } from '../../ext/lib/certmodel.js';
import { bytesToB64 } from '../../ext/lib/bytes.js';
import { memoryKv, fakeClock } from './helpers.js';

const forge = createRequire(import.meta.url)('node-forge');
const O = 'https://exemplo.com.br';
let kv, clock, vault, certs, sites, credits, cmd, T, pkcs8, certB64, model;

const pfx = new Uint8Array(fs.readFileSync(new URL('../fix/pf-moderno.pfx', import.meta.url)));

before(async () => {
  const r = parsePfx(forge, pfx, 'senha123');
  pkcs8 = r.pkcs8;
  T = await thumbprintOf(r.certDer);
  model = buildModel(forge, r.cert, T);
  certB64 = bytesToB64(r.certDer);
});

// Estado novo a cada teste; o certificado fica gravado, cifrado pelo cofre.
async function setup({ unlocked = true } = {}) {
  kv = memoryKv();
  clock = fakeClock(1_000_000);
  vault = createVault({ ...kv, now: clock.now, iterations: 1000 });
  await vault.create('senha-do-cofre');
  certs = createCerts();
  for (const e of await certs.list()) await certs.remove(e.thumbprint);
  await certs.put({
    thumbprint: T, model, certB64, key: await vault.encrypt(pkcs8), importedAt: '2026-11-21T00:00:00.000Z',
  });
  if (!unlocked) await vault.lock();
  sites = createSites(kv);
  credits = createCredits({ session: kv.session, now: clock.now });
  cmd = createCommands({ vault, certs, sites, credits, platformOs: 'Linux' });
}
const run = (command, request, origin = O) => cmd.handle({ command, request }, origin);

test('comandos de inicialização não olham a origem', async () => {
  await setup();
  assert.deepEqual(await run('getVersion', {}, null), { success: true, response: '2.99.0' });
  assert.equal((await run('getExtensionVersion', {}, null)).response, '2.99.0');
  assert.equal((await run('pollNative', {}, null)).response, true);
  const i = (await run('initialize', {}, null)).response;
  assert.deepEqual(i, {
    isReady: true, status: 0, message: null,
    nativeInfo: { os: 'Linux', installedVersion: '2.99.0', essentialFeaturesOnly: false },
    platformInfo: { os: 'Linux' },
  });
});

test('site novo: listar pede autorização do site', async () => {
  await setup();
  assert.deepEqual(await run('listCertificates', {}), { needs: { site: true } });
});

test('site autorizado: lista os modelos', async () => {
  await setup();
  await sites.setAllowed(O, true);
  const r = await run('listCertificates', {});
  assert.equal(r.success, true);
  assert.deepEqual(r.response, [model]);
});

test('readCertificate: inexistente erra; site novo pede; autorizado devolve certB64', async () => {
  await setup();
  const nf = await run('readCertificate', { certificateThumbprint: 'AAAA' });
  assert.equal(nf.exception.code, 'certificate_not_found');
  assert.deepEqual(await run('readCertificate', { certificateThumbprint: T }), { needs: { site: true } });
  await sites.setAllowed(O, true);
  assert.equal((await run('readCertificate', { certificateThumbprint: T })).response, certB64);
});

test('pré-autorização sempre pede confirmação', async () => {
  await setup();
  await sites.setAllowed(O, true);
  assert.deepEqual(
    await run('preauthorizeSignatures', { certificateThumbprint: T, signatureCount: 3 }),
    { needs: { sign: { count: 3, thumbprint: T } } },
  );
  await credits.grant(O, T, 3);
  const r = await run('preauthorizeSignatures', { certificateThumbprint: T, signatureCount: 3 });
  assert.deepEqual(r, { needs: { sign: { count: 3, thumbprint: T } } });
});

test('pré-autorização inexistente é not_found', async () => {
  await setup();
  const r = await run('preauthorizeSignatures', { certificateThumbprint: 'AAAA', signatureCount: 1 });
  assert.equal(r.exception.code, 'certificate_not_found');
});

for (const n of [0, -1, 1.5, 501, 1e9, '3', null, undefined]) {
  test(`pré-autorização com quantidade ${String(n)} é bad_request`, async () => {
    await setup();
    const r = await run('preauthorizeSignatures', { certificateThumbprint: T, signatureCount: n });
    assert.equal(r.success, false);
    assert.equal(r.needs, undefined);
    assert.equal(r.exception.code, 'bad_request');
  });
}

test('assinar sem crédito pede confirmação de 1', async () => {
  await setup();
  await sites.setAllowed(O, true);
  const r = await run('signData', { certificateThumbprint: T, data: 'eA==' });
  assert.deepEqual(r, { needs: { sign: { count: 1, thumbprint: T } } });
});

test('cofre travado pede senha', async () => {
  await setup({ unlocked: false });
  await sites.setAllowed(O, true);
  await credits.grant(O, T, 1);
  assert.deepEqual(await run('signData', { certificateThumbprint: T, data: 'eA==' }), { needs: { unlock: true } });
});

test('faltando tudo, devolve todos os pedidos de uma vez', async () => {
  await setup({ unlocked: false });
  assert.deepEqual(
    await run('signData', { certificateThumbprint: T, data: 'eA==' }),
    { needs: { site: true, unlock: true, sign: { count: 1, thumbprint: T } } },
  );
});

test('assinar com crédito e cofre aberto assina e consome', async () => {
  await setup();
  await sites.setAllowed(O, true);
  await credits.grant(O, T, 1);
  const data = Buffer.from('conteúdo a assinar');
  const r = await run('signData', { certificateThumbprint: T, data: data.toString('base64'), digestAlgorithm: 'SHA-256' });
  assert.equal(r.success, true);
  const esperado = crypto.sign('sha256', data, crypto.createPrivateKey({ key: Buffer.from(pkcs8), format: 'der', type: 'pkcs8' }));
  assert.equal(r.response, esperado.toString('base64'));
  // o crédito acabou: o segundo pedido volta a pedir
  assert.deepEqual(await run('signData', { certificateThumbprint: T, data: data.toString('base64') }), {
    needs: { sign: { count: 1, thumbprint: T } },
  });
});

test('signHash assina o resumo e consome o crédito', async () => {
  await setup();
  await sites.setAllowed(O, true);
  await credits.grant(O, T, 1);
  const data = Buffer.from('outro conteúdo');
  const hash = crypto.createHash('sha256').update(data).digest();
  const r = await run('signHash', { certificateThumbprint: T, hash: hash.toString('base64'), digestAlgorithm: 'SHA-256' });
  assert.equal(r.success, true);
  const esperado = crypto.sign('sha256', data, crypto.createPrivateKey({ key: Buffer.from(pkcs8), format: 'der', type: 'pkcs8' }));
  assert.equal(r.response, esperado.toString('base64'));
  assert.equal(await credits.has(O, T), false);
});

for (const [nome, req] of [
  ['certificado inexistente', { certificateThumbprint: 'AAAA', data: 'eA==' }],
  ['Base64 inválido', () => ({ certificateThumbprint: T, data: '***' })],
  ['dados ausentes', () => ({ certificateThumbprint: T })],
  ['algoritmo constructor', () => ({ certificateThumbprint: T, data: 'eA==', digestAlgorithm: 'constructor' })],
]) {
  test(`signData: ${nome} erra sem pedir confirmação`, async () => {
    await setup({ unlocked: false });
    const r = await run('signData', typeof req === 'function' ? req() : req);
    assert.equal(r.success, false);
    assert.equal(r.needs, undefined);
  });
}

test('resumo de tamanho errado erra sem pedir confirmação', async () => {
  await setup({ unlocked: false });
  const r = await run('signHash', { certificateThumbprint: T, hash: 'eA==', digestAlgorithm: 'SHA-256' });
  assert.equal(r.success, false);
  assert.equal(r.needs, undefined);
  assert.equal(r.exception.code, 'bad_request');
});

test('site bloqueado é recusado sem confirmação', async () => {
  await setup();
  await sites.setAllowed(O, false);
  for (const c of ['listCertificates', 'readCertificate', 'preauthorizeSignatures', 'signData', 'signHash', 'xyz']) {
    const r = await run(c, { certificateThumbprint: T, signatureCount: 1, data: 'eA==', hash: 'eA==' });
    assert.equal(r.success, false);
    assert.equal(r.needs, undefined);
    assert.equal(r.exception.code, 'user_cancelled');
    assert.equal(r.exception.message, 'Este site está bloqueado no Jamegão.');
  }
});

test('origem nula é recusada', async () => {
  await setup();
  const r = await run('listCertificates', {}, null);
  assert.equal(r.success, false);
  assert.equal(r.exception.code, 'user_cancelled');
});

test('comando desconhecido e nomes como __proto__', async () => {
  await setup();
  for (const c of ['naoExiste', '__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    const r = await run(c, {});
    assert.equal(r.success, false);
    assert.equal(r.exception.code, 'command_not_supported');
    assert.equal(r.exception.message, `O Jamegão não atende o comando "${c}".`);
  }
});

test('três assinaturas simultâneas com 1 crédito: só uma assina', async () => {
  await setup();
  await sites.setAllowed(O, true);
  await credits.grant(O, T, 1);
  const req = { certificateThumbprint: T, data: 'eA==' };
  const rs = await Promise.all([run('signData', req), run('signData', req), run('signData', req)]);
  assert.equal(rs.filter((r) => r.success === true).length, 1);
  for (const r of rs.filter((r) => r.success !== true)) {
    assert.deepEqual(r, { needs: { sign: { count: 1, thumbprint: T } } });
  }
});

test('erro interno não vaza o texto para a página', async () => {
  await setup();
  await sites.setAllowed(O, true);
  const boom = createCommands({
    vault, sites, credits, platformOs: 'Linux',
    certs: { get: async () => { throw new Error('segredo /home/x stack'); } },
  });
  const r = await boom.handle({ command: 'readCertificate', request: { certificateThumbprint: T } }, O);
  assert.equal(r.success, false);
  assert.equal(r.exception.code, 'undefined');
  assert.equal(r.exception.message, 'Erro interno do Jamegão.');
  assert.ok(!JSON.stringify(r).includes('segredo'));
});

test('cofre trava entre a conferência e a decifragem: pede senha', async () => {
  await setup();
  await sites.setAllowed(O, true);
  await credits.grant(O, T, 1);
  let n = 0;
  const racing = {
    ...vault,
    isUnlocked: async () => (n++ === 0 ? true : false),
    decrypt: async () => { throw new Error('travado'); },
  };
  const c = createCommands({ vault: racing, certs, sites, credits, platformOs: 'Linux' });
  const r = await c.handle({ command: 'signData', request: { certificateThumbprint: T, data: 'eA==' } }, O);
  assert.deepEqual(r, { needs: { unlock: true, sign: { count: 1, thumbprint: T } } });
});
