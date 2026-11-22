import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, FIX } from './harness.mjs';
import { gerar } from '../fix/gerar.mjs';
import { criarAjudas } from './ajudas.mjs';

const COFRE = 'cofre-forte-1';
const LIB = 'lacuna-2.20.0.js';
let h;
let a;
let gen;
let T;

const importarBase = () => h.importPfx(path.join(FIX, 'pf-moderno.pfx'), 'senha123', COFRE);

before(async () => {
  h = await launch(process.env.BROWSER || 'chrome');
  a = criarAjudas(h);
  gen = fs.mkdtempSync(path.join(os.tmpdir(), 'jamegao-fix-'));
  await gerar(gen);
  await importarBase();
  const page = await a.abrirPagina(h.origin, LIB);
  T = (await a.login(page))[0].thumbprint;
  await page.close();
});
after(async () => {
  if (h) await h.close();
  fs.rmSync(gen, { recursive: true, force: true });
});
// Cada teste parte de um cofre novo com o certificado de base e nada mais.
beforeEach(async () => { await a.limparTudo(); await importarBase(); await a.limparSessao(); });
afterEach(async () => { await a.fecharPaginasDeTeste(); });

const dados = (s) => Buffer.from(s).toString('base64');
const sel = (origin, resto) => `#sites li[data-origem="${origin}"] ${resto}`;

test('travar agora', async () => {
  const page = await a.abrirPagina(h.origin, LIB);
  await a.login(page);
  let r = a.chamar(page, (t) => window.preautorizar(t, 3), T);
  await a.responder(await a.janela(), '#confirmar', COFRE);
  assert.equal((await r).ok, null);

  const popup = await a.abrirPopup();
  assert.equal(await a.estadoDo(popup), 'destravado');
  await popup.click('#travar');
  await popup.waitForSelector('#estado[data-estado="travado"]');
  assert.equal(await popup.$eval('#travar', (e) => e.hidden), true);
  // Travar descarta os créditos que sobraram do lote.
  assert.equal((await popup.evaluate(() => chrome.storage.session.get('credits'))).credits, undefined);

  r = a.chamar(page, (t, d) => window.assinarDados(t, d, 'SHA-256'), T, dados('x'));
  const j = await a.janela();
  assert.equal(await j.$eval('#bloco-senha', (e) => e.hidden), false); // pede a senha
  assert.equal(await j.$eval('#assinatura', (e) => e.hidden), false); // e mostra o que será assinado
  await a.responder(j, '#recusar');
  assert.match((await r).err, /cancelad/);
});

test('revogar site faz o próximo pedido pedir autorização de novo', async () => {
  const page = await a.abrirPagina(h.origin, LIB);
  await a.login(page);
  const popup = await a.abrirPopup();
  const permitido = sel(h.origin, 'input.permitido');
  await popup.waitForSelector(permitido);
  assert.equal(await popup.$eval(permitido, (e) => e.checked), true);
  await popup.click(permitido);
  await popup.waitForFunction((s) => document.querySelector(s) && !document.querySelector(s).checked, {}, permitido);
  assert.equal((await a.lerStorage('sites')).sites?.[h.origin]?.allowed, undefined);

  const r = a.chamar(page, () => window.listar());
  const j = await a.janela(h.origin);
  assert.match(await a.texto(j), /Permitir que .* veja e use os certificados/);
  await a.responder(j, '#confirmar');
  assert.equal((await r).ok.length, 1);
});

test('bloquear site: pedido é recusado sem janela', async () => {
  const page = await a.abrirPagina(h.origin, LIB);
  await a.login(page);
  const popup = await a.abrirPopup();
  await popup.waitForSelector(sel(h.origin, 'button.bloquear'));
  await popup.click(sel(h.origin, 'button.bloquear'));
  await popup.waitForSelector(sel(h.origin, 'button.desbloquear'));
  assert.equal((await a.lerStorage('sites')).sites[h.origin].allowed, false);

  const r = await a.chamar(page, () => window.listar());
  assert.match(r.err, /bloqueado/);
  await a.semJanela(800);
});

test('remover certificado', async () => {
  const page = await a.abrirPagina(h.origin, LIB);
  await a.login(page);
  const popup = await a.abrirPopup();
  await popup.waitForSelector('#certs li button.remover');
  assert.equal((await popup.$$('#certs li')).length, 1);
  await popup.click('#certs li button.remover');
  await popup.waitForSelector('#estado[data-estado="sem-certificado"]');
  assert.equal((await popup.$$('#certs li')).length, 0);
  const r = await a.chamar(page, () => window.listar());
  assert.deepEqual(r.ok, []);
});

test('esqueci a senha apaga cofre e certificados após confirmação', async () => {
  const page = await a.abrirPagina(h.origin, LIB);
  await a.login(page);
  const popup = await a.abrirPopup();
  assert.equal(await popup.$eval('#esqueci-aviso', (e) => e.hidden), true);
  await popup.click('#esqueci');
  assert.equal(await popup.$eval('#esqueci-aviso', (e) => e.hidden), false);
  // Só o primeiro clique: nada foi apagado.
  assert.notEqual(await a.estadoDo(popup), 'sem-certificado');
  assert.ok((await a.lerStorage('vaultMeta')).vaultMeta);

  await popup.evaluate(() => import('/lib/kv.js').then(({ browserKv }) => browserKv().local.set('lockout', { failures: 4, until: Date.now() + 5000 })));
  await popup.evaluate(() => chrome.storage.session.set({ credits: { x: { origin: 'o', thumbprint: 't', remaining: 2, expires: Date.now() + 100000 } } }));
  await popup.click('#apagar-tudo');
  await popup.waitForSelector('#estado[data-estado="sem-certificado"]');
  const s = await a.lerStorage(['vaultMeta', 'sites', 'lockout']);
  assert.equal(s.lockout, undefined);
  const sess = await popup.evaluate(() => chrome.storage.session.get(['credits', 'vaultKey']));
  assert.equal(sess.credits, undefined);
  assert.equal(sess.vaultKey, undefined);
  assert.equal(s.vaultMeta, undefined);
  assert.equal(s.sites === undefined || Object.keys(s.sites).length === 0, true);
  assert.equal((await popup.$$('#certs li')).length, 0);
  assert.equal((await popup.$$('#sites li')).length, 0);
});

// Review Focus 5
test('certificado vencido e a 10 dias do vencimento', { timeout: 90000 }, async () => {
  await h.importPfx(path.join(gen, 'vencido.pfx'), 'senha123', COFRE);
  await h.importPfx(path.join(gen, 'quase.pfx'), 'senha123', COFRE);
  await a.limparSessao();
  const page = await a.abrirPagina(h.origin, LIB);
  const lista = await a.login(page);
  const porNome = Object.fromEntries(lista.map((c) => [c.subjectName, c]));
  assert.ok(porNome['VENCIDO'] && porNome['QUASE VENCIDO'], Object.keys(porNome).join());

  const popup = await a.abrirPopup();
  assert.equal((await popup.$$('#certs li.vencido')).length, 1);
  assert.equal((await popup.$$('#certs li.vence-logo')).length, 1);
  assert.match(await popup.$eval('#certs li.vence-logo', (e) => e.textContent), /vence em 10 dias/);

  for (const [nome, esperado] of [['VENCIDO', /vencido/], ['QUASE VENCIDO', /vence em 10 dias/]]) {
    const r = a.chamar(page, (t, d) => window.assinarDados(t, d, 'SHA-256'), porNome[nome].thumbprint, dados('x'));
    const j = await a.janela();
    assert.match(await j.$eval('#vencimento', (e) => (e.hidden ? '' : e.textContent)), esperado, nome);
    await a.responder(j, '#recusar');
    assert.match((await r).err, /cancelad/);
    await a.fimDaPausa();
  }
});

test('"Bloquear este site" na janela bloqueia o site, e recusar pausa novas janelas', async () => {
  const page = await a.abrirPagina(h.origin, LIB);
  await a.login(page);
  let r = a.chamar(page, (t) => window.preautorizar(t, 2), T);
  await a.responder(await a.janela(), '#recusar');
  assert.match((await r).err, /cancelad/);
  // Logo depois da recusa, o site não consegue reabrir a janela.
  r = await a.chamar(page, (t) => window.preautorizar(t, 2), T);
  assert.match(r.err, /recusado há pouco/);
  await a.semJanela(300);

  await a.limparSessao(); // fim da pausa
  r = a.chamar(page, (t) => window.preautorizar(t, 2), T);
  await a.responder(await a.janela(), '#bloquear');
  assert.match((await r).err, /cancelad/);
  await a.limparSessao();
  r = await a.chamar(page, () => window.listar());
  assert.match(r.err, /bloqueado/);
  await a.semJanela(300);
});
