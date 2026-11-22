import 'fake-indexeddb/auto';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createPrompts, REFUSAL_PAUSE_MS } from '../../ext/lib/prompts.js';
import { CODES } from '../../ext/lib/protocol.js';
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
const PW = 'senha-do-cofre';
let T, model, certB64, pkcs8, kv, clock, vault, sites, credits, prompts, sent, closed;

before(async () => {
  const r = parsePfx(forge, new Uint8Array(fs.readFileSync(new URL('../fix/pf-moderno.pfx', import.meta.url))), 'senha123');
  pkcs8 = r.pkcs8;
  T = await thumbprintOf(r.certDer);
  model = buildModel(forge, r.cert, T);
  certB64 = bytesToB64(r.certDer);
});

async function setup({ unlocked = false } = {}) {
  kv = memoryKv();
  clock = fakeClock(1_000_000);
  vault = createVault({ ...kv, now: clock.now, iterations: 1000 });
  await vault.create(PW);
  const certs = createCerts();
  for (const e of await certs.list()) await certs.remove(e.thumbprint);
  await certs.put({ thumbprint: T, model, certB64, key: await vault.encrypt(pkcs8), importedAt: 'x' });
  if (!unlocked) await vault.lock();
  sites = createSites(kv);
  credits = createCredits({ session: kv.session, now: clock.now });
  sent = [];
  closed = [];
  prompts = createPrompts({
    session: kv.session, vault, certs, sites, credits, now: clock.now,
    notify: async (tabId, frameId, msg) => { sent.push({ tabId, frameId, msg }); },
    closeWindow: async (w) => { closed.push(w); },
  });
}
const ctx = (over = {}) => ({ origin: O, tabId: 7, frameId: 0, command: 'signData', ...over });
const full = () => ({ site: true, unlock: true, sign: { count: 3, thumbprint: T } });

test('aceite com site, senha e assinatura: autoriza, destrava, concede e pede nova tentativa', async () => {
  await setup();
  const { id } = await prompts.open(full(), ctx());
  assert.deepEqual(await prompts.answer(id, { allow: true, password: PW }), { done: true });
  assert.equal((await sites.get(O)).allowed, true);
  assert.equal(await vault.isUnlocked(), true);
  assert.equal(await credits.has(O, T), true);
  assert.equal(await credits.consume(O, T), true);
  assert.equal(await credits.consume(O, T), true);
  assert.equal(await credits.consume(O, T), true);
  assert.equal(await credits.consume(O, T), false);
  assert.deepEqual(sent, [{ tabId: 7, frameId: 0, msg: { type: 'prompt-resolved', id, outcome: 'retry' } }]);
  assert.equal(await prompts.describe(id), null);
});

test('preauthorizeSignatures responde ok(null) em vez de nova tentativa', async () => {
  await setup({ unlocked: true });
  const { id } = await prompts.open({ site: true, sign: { count: 2, thumbprint: T } }, ctx({ command: 'preauthorizeSignatures' }));
  await prompts.answer(id, { allow: true });
  assert.deepEqual(sent[0].msg.outcome, { success: true, response: null });
  assert.equal((await sites.get(O)).allowed, true);
});

test('só o site (listCertificates): não mexe em cofre nem créditos', async () => {
  await setup();
  const { id } = await prompts.open({ site: true }, ctx({ command: 'listCertificates' }));
  await prompts.answer(id, { allow: true });
  assert.equal((await sites.get(O)).allowed, true);
  assert.equal(await vault.isUnlocked(), false);
  assert.equal(await credits.has(O, T), false);
  assert.equal(sent[0].msg.outcome, 'retry');
});

test('só confirmação de assinatura com cofre aberto e site liberado', async () => {
  await setup({ unlocked: true });
  await sites.setAllowed(O, true);
  const { id } = await prompts.open({ sign: { count: 1, thumbprint: T } }, ctx());
  await prompts.answer(id, { allow: true });
  assert.equal(await credits.has(O, T), true);
});

test('senha errada não concede nada e mantém o pedido', async () => {
  await setup();
  const { id } = await prompts.open(full(), ctx());
  const r = await prompts.answer(id, { allow: true, password: 'errada-errada' });
  assert.equal(r.error, 'senha');
  assert.equal(typeof r.waitMs, 'number');
  assert.equal((await sites.get(O)).allowed, undefined);
  assert.equal(await credits.has(O, T), false);
  assert.equal(await vault.isUnlocked(), false);
  assert.equal(sent.length, 0);
  assert.notEqual(await prompts.describe(id), null);
  assert.deepEqual(await prompts.answer(id, { allow: true, password: PW }), { done: true });
  assert.equal(await credits.has(O, T), true);
});

test('recusa cancela e não grava bloqueio do site', async () => {
  await setup();
  const { id } = await prompts.open(full(), ctx());
  assert.deepEqual(await prompts.answer(id, { allow: false }), { done: true });
  assert.deepEqual(await sites.list(), []);
  assert.equal((await sites.get(O)).allowed, undefined);
  assert.equal(await credits.has(O, T), false);
  const out = sent[0].msg.outcome;
  assert.equal(out.success, false);
  assert.equal(out.exception.code, 'user_cancelled');
  assert.match(out.exception.message, /cancelad/);
});

test('segunda abertura na mesma aba devolve busy; outra aba abre', async () => {
  await setup();
  const a = await prompts.open(full(), ctx());
  assert.ok(a.id);
  assert.deepEqual(await prompts.open(full(), ctx({ frameId: 3 })), { busy: true });
  assert.ok((await prompts.open(full(), ctx({ tabId: 8 }))).id);
  await prompts.answer(a.id, { allow: false });
  clock.advance(REFUSAL_PAUSE_MS); // a recusa pausa o site
  assert.ok((await prompts.open(full(), ctx())).id);
});

test('closedWindow e abandon equivalem a recusar', async () => {
  await setup();
  const a = await prompts.open(full(), ctx());
  await prompts.setWindow(a.id, 42);
  await prompts.closedWindow(42);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].msg.outcome.exception.code, 'user_cancelled');
  assert.equal(await prompts.describe(a.id), null);
  clock.advance(REFUSAL_PAUSE_MS);
  const b = await prompts.open(full(), ctx());
  await prompts.abandon(b.id);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].msg.id, b.id);
  assert.deepEqual(await sites.list(), []);
});

test('abandon com tabId de outra aba é ignorado', async () => {
  await setup();
  const a = await prompts.open(full(), ctx());
  await prompts.abandon(a.id, { tabId: 99 });
  assert.notEqual(await prompts.describe(a.id), null);
  await prompts.abandon(a.id, { tabId: 7 });
  assert.equal(await prompts.describe(a.id), null);
});

test('describe vem do certificado guardado e não vaza tabId nem senha', async () => {
  await setup();
  const { id } = await prompts.open(full(), ctx());
  const d = await prompts.describe(id);
  assert.deepEqual(Object.keys(d).sort(), ['needs', 'origin', 'subject', 'validityEnd']);
  assert.equal(d.origin, O);
  assert.equal(d.subject, model.subjectName);
  assert.equal(d.validityEnd, model.validityEnd);
  assert.doesNotMatch(JSON.stringify(d), /tabId|frameId|password/);
  assert.equal(await prompts.describe('nao-existe'), null);
});

test('resolver fecha a janela registrada; responder pedido inexistente é inofensivo', async () => {
  await setup({ unlocked: true });
  const { id } = await prompts.open({ site: true }, ctx());
  await prompts.setWindow(id, 5);
  await prompts.answer(id, { allow: true });
  assert.deepEqual(closed, [5]);
  assert.deepEqual(await prompts.answer(id, { allow: true }), { done: true });
  assert.equal(sent.length, 1);
});

test('registro órfão expira e não prende a aba', async () => {
  const { PROMPT_TIMEOUT_MS } = await import('../../ext/lib/prompts.js');
  await setup();
  const a = await prompts.open(full(), ctx());
  clock.advance(PROMPT_TIMEOUT_MS + 5000);
  assert.deepEqual(await prompts.open(full(), ctx()), { busy: true }); // ainda dentro da folga
  clock.advance(6000);
  const b = await prompts.open(full(), ctx());
  assert.ok(b.id && b.id !== a.id);
  assert.equal(await prompts.describe(a.id), null);
  assert.equal(sent[0].msg.id, a.id);
  assert.equal(sent[0].msg.outcome.exception.code, 'user_cancelled');
});

test('tabClosed recusa só o pedido daquela aba', async () => {
  await setup();
  const a = await prompts.open(full(), ctx());
  const b = await prompts.open(full(), ctx({ tabId: 8 }));
  await prompts.tabClosed(7);
  assert.equal(await prompts.describe(a.id), null);
  assert.notEqual(await prompts.describe(b.id), null);
  assert.ok((await prompts.open(full(), ctx())).id);
});

test('confirmação vencida (120 s) não pode mais ser aprovada nem descrita', async () => {
  const { PROMPT_TIMEOUT_MS } = await import('../../ext/lib/prompts.js');
  await setup();
  const a = await prompts.open(full(), ctx());
  clock.advance(PROMPT_TIMEOUT_MS + 1);
  assert.deepEqual(await prompts.answer(a.id, { allow: true, password: PW }), { done: true, expired: true });
  assert.equal((await sites.get(O)).allowed, undefined);
  assert.equal(await credits.has(O, T), false);
  assert.equal(await vault.isUnlocked(), false);
  assert.equal(sent[0].msg.outcome.exception.code, 'user_cancelled');

  const b = await prompts.open(full(), ctx());
  clock.advance(PROMPT_TIMEOUT_MS + 1);
  assert.equal(await prompts.describe(b.id), null);
  assert.equal((await prompts.answer(b.id, { allow: true, password: PW })).done, true);
  assert.equal(await credits.has(O, T), false);
});

test('depois de uma recusa, o mesmo site espera a pausa para abrir outra janela', async () => {
  await setup();
  const a = await prompts.open(full(), ctx());
  await prompts.answer(a.id, { allow: false });
  assert.deepEqual(await prompts.open(full(), ctx()), { paused: true });
  assert.ok((await prompts.open(full(), ctx({ origin: 'https://outro.jus.br', tabId: 9 }))).id); // outro site, não
  clock.advance(REFUSAL_PAUSE_MS);
  assert.ok((await prompts.open(full(), ctx())).id);
});

test('fechar a janela também pausa; a aba sair ou o prazo vencer, não', async () => {
  await setup();
  const a = await prompts.open(full(), ctx());
  await prompts.setWindow(a.id, 33);
  await prompts.closedWindow(33);
  assert.deepEqual(await prompts.open(full(), ctx()), { paused: true });

  await setup();
  const b = await prompts.open(full(), ctx());
  await prompts.abandon(b.id, { tabId: 7 }); // a página saiu
  const c = await prompts.open(full(), ctx());
  assert.ok(c.id);
  await prompts.tabClosed(7);
  assert.ok((await prompts.open(full(), ctx())).id);
});

test('"Bloquear este site" recusa, bloqueia o site e apaga créditos', async () => {
  await setup({ unlocked: true });
  await credits.grant(O, T, 4);
  const { id } = await prompts.open(full(), ctx());
  assert.deepEqual(await prompts.answer(id, { allow: true, block: true, password: PW }), { done: true });
  assert.equal((await sites.get(O)).allowed, false);
  assert.equal(await credits.has(O, T), false);
  assert.equal(sent[0].msg.outcome.exception.code, 'user_cancelled');
});

test('aceite que falha no meio avisa a aba na hora e não deixa o site liberado', async () => {
  await setup({ unlocked: true });
  credits.grant = async () => { throw new Error('quota'); };
  const { id } = await prompts.open(full(), ctx());
  assert.deepEqual(await prompts.answer(id, { allow: true }), { done: true, error: 'interno' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].msg.outcome.exception.code, CODES.internal);
  assert.equal((await sites.get(O)).allowed, undefined);
  assert.equal(await prompts.describe(id), null);
});

test('a aba é avisada mesmo se a gravação do desfecho falhar', async () => {
  await setup({ unlocked: true });
  const { id } = await prompts.open(full(), ctx());
  const set = kv.session.set;
  kv.session.set = async (k, v) => { if (k === 'prompts') throw new Error('falhou'); return set(k, v); };
  await prompts.answer(id, { allow: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].msg.outcome, 'retry');
});

test('prazo vencido na aba pausa o site (o e-SAJ repete a listagem na hora)', async () => {
  const { PROMPT_TIMEOUT_MS } = await import('../../ext/lib/prompts.js');
  await setup();
  const a = await prompts.open({ site: true }, ctx({ command: 'listCertificates' }));
  clock.advance(PROMPT_TIMEOUT_MS);
  await prompts.abandon(a.id, { tabId: 7 }); // a aba desistiu aos 120 s
  assert.equal(sent[0].msg.outcome.exception.code, 'user_cancelled');
  // As três repetições do e-SAJ falham sem abrir janela.
  for (let i = 0; i < 3; i++) assert.deepEqual(await prompts.open({ site: true }, ctx()), { paused: true });
  clock.advance(REFUSAL_PAUSE_MS);
  assert.ok((await prompts.open({ site: true }, ctx())).id);
});
