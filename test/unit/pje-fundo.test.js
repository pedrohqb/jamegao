import 'fake-indexeddb/auto';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { X509Certificate, createHash, createVerify, randomBytes } from 'node:crypto';
import { createPje } from '../../ext/protocolos/pje/fundo.js';
import { createDespacho } from '../../ext/lib/despacho.js';
import { createAssinar } from '../../ext/lib/assinar.js';
import { createVault } from '../../ext/lib/vault.js';
import { createCerts } from '../../ext/lib/certs.js';
import { createSites } from '../../ext/lib/sites.js';
import { createCredits } from '../../ext/lib/credits.js';
import { parsePfx } from '../../ext/lib/pfx.js';
import { buildModel, thumbprintOf } from '../../ext/lib/certmodel.js';
import { bytesToB64 } from '../../ext/lib/bytes.js';
import { memoryKv, fakeClock } from './helpers.js';

const forge = createRequire(import.meta.url)('node-forge');
const O = 'https://pje.tjma.jus.br';
const fix = (f) => new Uint8Array(fs.readFileSync(new URL(`../fix/${f}`, import.meta.url)));
let A, B; // dois certificados: { thumbprint, model, certDer, pkcs8, chainB64 }
let kv, clock, vault, certs, sites, credits, pje, despacho;

const carregar = async (f, senha) => {
  const r = parsePfx(forge, fix(f), senha);
  const thumbprint = await thumbprintOf(r.certDer);
  return {
    thumbprint, model: buildModel(forge, r.cert, thumbprint), certDer: r.certDer, pkcs8: r.pkcs8,
    chainB64: r.chainDer.map(bytesToB64),
  };
};

before(async () => {
  [A, B] = [await carregar('pf-moderno.pfx', 'senha123'), await carregar('pj-legado.pfx', 'outra senha')];
  if (A.thumbprint > B.thumbprint) [A, B] = [B, A]; // A é o primeiro da lista (ordem da chave)
});

const guardar = async (c, { semCadeia = false } = {}) => certs.put({
  thumbprint: c.thumbprint, model: c.model, certB64: bytesToB64(c.certDer), key: await vault.encrypt(c.pkcs8),
  importedAt: 'x', ...(semCadeia ? {} : { chainB64: c.chainB64 }),
});

async function setup({ unlocked = true, allowed = true, lista = [A], semCadeia = false, semCadeiaEm = [] } = {}) {
  kv = memoryKv();
  clock = fakeClock(1_000_000);
  vault = createVault({ ...kv, now: clock.now, iterations: 1000 });
  await vault.create('senha-do-cofre');
  certs = createCerts();
  for (const e of await certs.list()) await certs.remove(e.thumbprint);
  for (const c of lista) await guardar(c, { semCadeia: semCadeia || semCadeiaEm.includes(c) });
  if (!unlocked) await vault.lock();
  sites = createSites(kv);
  if (allowed) await sites.setAllowed(O, true);
  credits = createCredits({ session: kv.session, now: clock.now });
  pje = createPje({ session: kv.session });
  despacho = createDespacho({
    protocolos: [pje], certs, sites, assinar: createAssinar({ vault, sites, credits, certs }), platformOs: 'Linux',
  });
}
const pedir = (command, request, origin = O) => despacho.handle({ protocolo: 'pje', command, request }, origin);
const login = (extra = {}, origin = O) => pedir('assinar', { tipo: 'login', mensagem: 'Bem-vindo ao PJe ção', ...extra }, origin);
const docs = (resumos, extra = {}) => pedir('assinar', { tipo: 'documentos', resumos, ...extra });

const pub = (c) => new X509Certificate(Buffer.from(c.certDer)).publicKey;
const confere = (alg, dados, assinatura, c = A) =>
  createVerify(alg).update(dados).verify(pub(c), Buffer.from(assinatura, 'base64'));
const hex = (alg, d) => createHash(alg).update(d).digest('hex');

test('origens: só https em *.jus.br', async () => {
  await setup();
  for (const o of ['https://pje.tjma.jus.br', 'https://sso.cloud.pje.jus.br', 'https://pje.tjma.jus.br:8443']) {
    assert.equal(pje.aceitaOrigem(o), true, o);
  }
  for (const o of ['https://exemplo.com.br', 'http://pje.x.jus.br', 'https://jus.br', 'https://xjus.br',
    'https://pje.jus.br.exemplo.com', 'nao-url', null, undefined, 42]) {
    assert.equal(pje.aceitaOrigem(o), false, String(o));
  }
  assert.equal(pje.id, 'pje');
  assert.deepEqual(pje.abertos, {});
  for (const o of ['https://exemplo.com.br', 'http://pje.x.jus.br']) {
    assert.equal((await login({}, o)).exception.code, 'command_not_supported', o);
    assert.equal((await pedir('estado', {}, o)).exception.code, 'command_not_supported', o);
  }
});

test('estado: atende com certificado e sem bloqueio; não abre janela', async () => {
  await setup({ lista: [], allowed: false });
  assert.deepEqual(await pedir('estado', {}), { success: true, response: { atender: false } });
  await setup({ allowed: false }); // site novo (sem decisão) é atendido: a janela pergunta
  assert.deepEqual(await pedir('estado', {}), { success: true, response: { atender: true } });
  await setup({ unlocked: false });
  assert.deepEqual(await pedir('estado', {}), { success: true, response: { atender: true } });
  await sites.setAllowed(O, false);
  const ctx = { origin: O, certs, sites };
  assert.deepEqual(await pje.comandos.estado({}, ctx), { success: true, response: { atender: false } });
  // Pelo despacho, o site bloqueado nem chega ao comando.
  assert.equal((await pedir('estado', {})).exception.code, 'user_cancelled');
});

test('login MD5withRSA (padrão): assina a mensagem em UTF-8 e devolve a cadeia', async () => {
  await setup();
  await credits.grant(O, A.thumbprint, 1, 'login');
  const msg = 'Bem-vindo ao PJe ção';
  const r = await login();
  assert.equal(r.success, true);
  assert.equal(r.response.assinaturas.length, 1);
  assert.ok(confere('RSA-MD5', Buffer.from(msg, 'utf8'), r.response.assinaturas[0]));
  assert.deepEqual(r.response.cadeia, A.chainB64);
  assert.equal(await credits.has(O, A.thumbprint, 'login'), false);
});

test('login SHA1withRSA e SHA256withRSA', async () => {
  for (const [algoritmo, alg] of [['SHA1withRSA', 'RSA-SHA1'], ['SHA256withRSA', 'RSA-SHA256'], ['MD5withRSA', 'RSA-MD5']]) {
    await setup();
    await credits.grant(O, A.thumbprint, 1, 'login');
    const r = await login({ mensagem: 'x', algoritmo });
    assert.equal(r.success, true, algoritmo);
    assert.ok(confere(alg, Buffer.from('x'), r.response.assinaturas[0]), algoritmo);
  }
});

test('pedido inválido é bad_request, antes de qualquer janela', async () => {
  await setup({ allowed: false, unlocked: false });
  const ruins = [
    { tipo: 'outro', mensagem: 'x' },
    { mensagem: 'x' },
    { tipo: 'login', mensagem: 'x', algoritmo: 'ASN1MD5withRSA' },
    { tipo: 'login', mensagem: 'x', algoritmo: 'SHA512withRSA' },
    { tipo: 'login', mensagem: 'x', algoritmo: 'toString' },
    { tipo: 'login', mensagem: '' },
    { tipo: 'login', mensagem: 'a'.repeat(8193) },
    { tipo: 'login', mensagem: 42 },
    { tipo: 'login' },
    { tipo: 'documentos', resumos: [hex('md5', 'a')], algoritmo: 'MD5withRSA' },
    { tipo: 'documentos', resumos: [] },
    { tipo: 'documentos', resumos: '[]' },
    { tipo: 'documentos', resumos: 'nao-json' },
    { tipo: 'documentos', resumos: hex('md5', 'a') },
    { tipo: 'documentos' },
    { tipo: 'documentos', resumos: Array(501).fill(hex('md5', 'a')) },
    { tipo: 'documentos', resumos: [hex('sha256', 'a')] }, // 32 bytes com MD5
    { tipo: 'documentos', resumos: [hex('md5', 'a')], algoritmo: 'ASN1SHA256withRSA' },
    { tipo: 'documentos', resumos: ['zz'.repeat(16)] },
    { tipo: 'documentos', resumos: [42] },
    { tipo: 'documentos', resumos: [hex('md5', 'a'), 'curto'] },
  ];
  for (const req of ruins) {
    const r = await pedir('assinar', req);
    assert.equal(r.success, false, JSON.stringify(req).slice(0, 80));
    assert.equal(r.exception.code, 'bad_request', JSON.stringify(req).slice(0, 80));
  }
  assert.equal((await pedir('assinar', { tipo: 'login', mensagem: 'a'.repeat(8192) })).needs?.sign?.count, 1);
});

test('documentos ASN1MD5withRSA (padrão): hexadecimal em qualquer caixa, Base64 e lista em texto', async () => {
  await setup();
  const d1 = randomBytes(100);
  const d2 = randomBytes(50);
  const d3 = randomBytes(10);
  const resumos = [
    hex('md5', d1),
    `  ${hex('md5', d2).toUpperCase()} `,
    createHash('md5').update(d3).digest('base64'),
  ];
  for (const forma of [resumos, JSON.stringify(resumos)]) {
    await credits.grant(O, A.thumbprint, 3, 'documentos');
    const r = await docs(forma);
    assert.equal(r.success, true);
    assert.equal(r.response.assinaturas.length, 3);
    [d1, d2, d3].forEach((d, i) => assert.ok(confere('RSA-MD5', d, r.response.assinaturas[i]), `resumo ${i}`));
    assert.deepEqual(r.response.cadeia, A.chainB64);
  }
});

test('documentos ASN1SHA256withRSA: 32 bytes', async () => {
  await setup();
  await credits.grant(O, A.thumbprint, 2, 'documentos');
  const d1 = randomBytes(30);
  const d2 = randomBytes(31);
  const r = await docs([hex('sha256', d1), createHash('sha256').update(d2).digest('base64')], { algoritmo: 'ASN1SHA256withRSA' });
  assert.equal(r.success, true);
  assert.ok(confere('RSA-SHA256', d1, r.response.assinaturas[0]));
  assert.ok(confere('RSA-SHA256', d2, r.response.assinaturas[1]));
});

test('needs leva motivo, sistema PJe e o programa instalado; um certificado não abre escolha', async () => {
  await setup({ allowed: false, unlocked: false });
  assert.deepEqual(await login(), {
    needs: {
      site: true, unlock: true, programa: true,
      sign: { motivo: 'login', sistema: 'PJe', count: 1, thumbprint: A.thumbprint },
    },
  });
  await setup();
  assert.deepEqual(await docs([hex('md5', 'a'), hex('md5', 'b')]), {
    needs: { programa: true, sign: { motivo: 'documentos', sistema: 'PJe', count: 2, thumbprint: A.thumbprint } },
  });
});

test('lote novo: documentos com novo abre janela mesmo com crédito; login não', async () => {
  await setup();
  await credits.grant(O, A.thumbprint, 5, 'documentos');
  await credits.grant(O, A.thumbprint, 1, 'login');
  const r = await docs([hex('md5', 'a')], { novo: true });
  assert.equal(r.needs.sign.count, 1);
  assert.equal(await credits.has(O, A.thumbprint, 'documentos'), true, 'nada foi gasto');
  assert.equal((await docs([hex('md5', 'a')], { novo: 'sim' })).success, true);
  assert.equal((await login({ novo: true })).success, true);
});

test('sem cadeia: aviso antes de site, cofre e crédito', async () => {
  await setup({ semCadeia: true, allowed: false, unlocked: false });
  assert.deepEqual(await login(), {
    needs: { aviso: 'semCadeia', programa: true, sign: { motivo: 'login', sistema: 'PJe', count: 1, thumbprint: A.thumbprint } },
  });
  await setup({ semCadeia: true });
  await credits.grant(O, A.thumbprint, 2, 'documentos');
  const r = await docs([hex('md5', 'a'), hex('md5', 'b')]);
  assert.deepEqual(r.needs, {
    aviso: 'semCadeia', programa: true, sign: { motivo: 'documentos', sistema: 'PJe', count: 2, thumbprint: A.thumbprint },
  });
  assert.equal(await credits.has(O, A.thumbprint, 'documentos'), true, 'nada foi gasto');
});

test('nenhum certificado: certificate_not_found', async () => {
  await setup({ lista: [] });
  assert.equal((await login()).exception.code, 'certificate_not_found');
});

test('mais de um certificado sem preferência: escolha com o primeiro marcado, mesmo com crédito', async () => {
  await setup({ lista: [A, B] });
  await credits.grant(O, A.thumbprint, 1, 'login');
  const r = await login();
  assert.deepEqual(r.needs.escolher, { opcoes: [A.thumbprint, B.thumbprint], marcado: A.thumbprint });
  assert.equal(r.needs.sign.thumbprint, A.thumbprint);
  assert.equal(r.needs.programa, true);
  assert.equal(await credits.has(O, A.thumbprint, 'login'), true);
});

test('mais de um certificado com preferência: login com crédito assina direto com o preferido', async () => {
  await setup({ lista: [A, B] });
  await sites.setCertificado(O, B.thumbprint);
  await credits.grant(O, B.thumbprint, 1, 'login');
  const r = await login({ mensagem: 'y' });
  assert.equal(r.success, true);
  assert.ok(confere('RSA-MD5', Buffer.from('y'), r.response.assinaturas[0], B));
  assert.deepEqual(r.response.cadeia, B.chainB64);
  // Sem crédito: janela com o preferido marcado.
  const s = await login();
  assert.deepEqual(s.needs.escolher, { opcoes: [A.thumbprint, B.thumbprint], marcado: B.thumbprint });
  assert.equal(s.needs.sign.thumbprint, B.thumbprint);
});

test('preferência que não existe mais: volta ao primeiro e abre a escolha', async () => {
  await setup({ lista: [A, B] });
  await sites.setCertificado(O, 'f'.repeat(40));
  await credits.grant(O, A.thumbprint, 1, 'login');
  const r = await login();
  assert.deepEqual(r.needs.escolher, { opcoes: [A.thumbprint, B.thumbprint], marcado: A.thumbprint });
});

test('registrarTarefa guarda na sessão sem repetir, até 20', async () => {
  await setup();
  assert.deepEqual(await pedir('registrarTarefa', { tarefa: 'pje.assinadorPdf' }), { success: true, response: null });
  await pedir('registrarTarefa', { tarefa: 'pje.assinadorPdf' });
  await pedir('registrarTarefa', { tarefa: 'pje.assinadorPdf' }, 'https://pje2.tjma.jus.br');
  assert.deepEqual(await kv.session.get('pjeRecusadas'), [
    { origin: O, tarefa: 'pje.assinadorPdf' },
    { origin: 'https://pje2.tjma.jus.br', tarefa: 'pje.assinadorPdf' },
  ]);
  for (let i = 0; i < 25; i++) await pedir('registrarTarefa', { tarefa: `t${i}` });
  const l = await kv.session.get('pjeRecusadas');
  assert.equal(l.length, 20);
  assert.deepEqual(l.at(-1), { origin: O, tarefa: 't24' });
  assert.deepEqual(l[0], { origin: O, tarefa: 't5' });
  for (const tarefa of [undefined, '', 42, 'x'.repeat(201)]) {
    assert.equal((await pedir('registrarTarefa', { tarefa })).exception.code, 'bad_request');
  }
});

test('só contam certificados com cadeia: um com e um sem assina com o que tem, sem escolha', async () => {
  for (const [com, sem] of [[A, B], [B, A]]) {
    await setup({ lista: [A, B], semCadeiaEm: [sem] });
    await credits.grant(O, com.thumbprint, 1, 'login');
    const r = await login({ mensagem: 'z' });
    assert.equal(r.success, true);
    assert.ok(confere('RSA-MD5', Buffer.from('z'), r.response.assinaturas[0], com));
    assert.deepEqual(r.response.cadeia, com.chainB64);
    // Sem crédito: janela sem escolha, com o certificado que tem cadeia.
    const s = await login();
    assert.equal(s.needs.escolher, undefined);
    assert.equal(s.needs.aviso, undefined);
    assert.equal(s.needs.sign.thumbprint, com.thumbprint);
  }
});

test('preferência gravada num certificado sem cadeia é ignorada', async () => {
  await setup({ lista: [A, B], semCadeiaEm: [A] });
  await sites.setCertificado(O, A.thumbprint);
  await credits.grant(O, B.thumbprint, 1, 'login');
  const r = await login({ mensagem: 'w' });
  assert.equal(r.success, true);
  assert.ok(confere('RSA-MD5', Buffer.from('w'), r.response.assinaturas[0], B));
});

test('vários certificados, nenhum com cadeia: aviso; estado continua atendendo', async () => {
  await setup({ lista: [A, B], semCadeia: true });
  assert.deepEqual(await login(), {
    needs: { aviso: 'semCadeia', programa: true, sign: { motivo: 'login', sistema: 'PJe', count: 1, thumbprint: A.thumbprint } },
  });
  assert.deepEqual(await pedir('estado', {}), { success: true, response: { atender: true } });
});

test('crédito do login não serve para documentos, e o de documentos não serve para login', async () => {
  await setup();
  await credits.grant(O, A.thumbprint, 1, 'login');
  const r = await docs([hex('md5', 'a')], { novo: false });
  assert.deepEqual(r.needs.sign, { motivo: 'documentos', sistema: 'PJe', count: 1, thumbprint: A.thumbprint });
  assert.equal(await credits.has(O, A.thumbprint, 'login'), true, 'o crédito do login não foi gasto');
  assert.equal((await login()).success, true);

  await setup();
  await credits.grant(O, A.thumbprint, 1, 'documentos');
  const s = await login();
  assert.deepEqual(s.needs.sign, { motivo: 'login', sistema: 'PJe', count: 1, thumbprint: A.thumbprint });
  assert.equal(await credits.has(O, A.thumbprint, 'documentos'), true);
  assert.equal((await docs([hex('md5', 'a')])).success, true);

  await setup();
  await credits.grant(O, A.thumbprint, 1); // crédito do e-SAJ (sem motivo)
  assert.ok((await login()).needs);
  assert.ok((await docs([hex('md5', 'a')])).needs);
  assert.equal(await credits.has(O, A.thumbprint), true);
});
