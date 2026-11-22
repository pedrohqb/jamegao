import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { launch, FIX } from './harness.mjs';

const browserName = process.env.BROWSER || 'chrome';
const COFRE = 'cofre-forte-1';
const LIB = 'lacuna-2.20.0.js';
let h;
let T; // thumbprint do certificado importado
let subjectName;
const publicKey = crypto.createPublicKey(fs.readFileSync(path.join(FIX, 'pf.crt')));

const hoje = () => h.browser.pages();
const confirmPages = async () => (await hoje()).filter((p) => p.url().includes('pages/confirm.html'));

before(async () => {
  h = await launch(browserName);
  await h.importPfx(path.join(FIX, 'pf-moderno.pfx'), 'senha123', COFRE);
  // Descobre o thumbprint pelo fluxo real (também exercita o login).
  const page = await abrir(h.origin);
  const lista = comJanela(page, () => page.evaluate(() => window.listar()));
  const j = await janela();
  await responder(j, '#confirmar');
  const certs = (await lista).ok;
  T = certs[0].thumbprint;
  subjectName = certs[0].subjectName;
  await page.close();
});
after(async () => { if (h) await h.close(); });

// Cofre travado, sem sites nem créditos entre os testes; o certificado fica.
const zerar = async () => {
  const page = await h.browser.newPage();
  await page.goto(h.extUrl('pages/import.html'));
  await page.evaluate(async () => {
    await chrome.storage.local.remove(['sites', 'lockout']);
    await chrome.storage.session.clear();
  });
  await page.close();
};
beforeEach(zerar);
afterEach(async () => {
  for (const p of await hoje()) {
    if (p.url().includes('pages/confirm.html') || p.url().includes('lib=')) await p.close().catch(() => {});
  }
});

async function abrir(origin) {
  const page = await h.browser.newPage();
  await page.goto(`${origin}/?lib=${LIB}`);
  assert.deepEqual(await page.evaluate(() => window.initPki()), { ready: true });
  return page;
}

// Inicia uma chamada da página sem esperar; devolve {ok}|{err} quando terminar.
const comJanela = (page, fn) => fn().then((ok) => ({ ok }), (e) => ({ err: String(e.message) }));

// Espera a janela de confirmação (da origem indicada, se houver) já preenchida.
async function janela(originEsperada) {
  const fim = Date.now() + 15000;
  while (Date.now() < fim) {
    for (const p of await confirmPages()) {
      const txt = await p.$eval('#origem', (e) => e.textContent).catch(() => '');
      if (txt && (!originEsperada || txt.includes(originEsperada))) return p;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('janela de confirmação não apareceu');
}
const texto = (p) => p.$eval('body', (b) => b.innerText);
const semJanela = async (ms = 1000) => {
  await new Promise((r) => setTimeout(r, ms));
  assert.equal((await confirmPages()).length, 0, 'não deveria haver janela de confirmação');
};
// Clica e espera a janela se fechar sozinha.
async function responder(p, seletor, senha) {
  if (senha !== undefined) await p.$eval('#senha', (el, v) => { el.value = v; }, senha);
  if (seletor === '#confirmar') await p.waitForSelector('#confirmar:not([disabled])');
  const fechou = new Promise((r) => p.once('close', r));
  await p.click(seletor);
  await fechou;
}
const dadosB64 = (s) => Buffer.from(s).toString('base64');
const verifica = (dados, sigB64) =>
  crypto.verify('sha256', Buffer.from(dados), publicKey, Buffer.from(sigB64, 'base64'));
const sitesGravados = async () => {
  const page = await h.browser.newPage();
  try {
    await page.goto(h.extUrl('pages/import.html'));
    return (await page.evaluate(() => chrome.storage.local.get('sites'))).sites ?? {};
  } finally { await page.close(); }
};

async function login(page, origin = h.origin) {
  const r = comJanela(page, () => page.evaluate(() => window.listar()));
  const j = await janela(origin);
  await responder(j, '#confirmar');
  assert.equal((await r).ok.length, 1);
}

test('login: listar pede o site, assinar pede senha e confirmação', async () => {
  const page = await abrir(h.origin);
  let r = comJanela(page, () => page.evaluate(() => window.listar()));
  let j = await janela();
  let t = await texto(j);
  assert.ok(t.includes(h.origin), t);
  assert.match(t, /Permitir que .* veja e use os certificados/);
  assert.equal(await j.$eval('#bloco-senha', (e) => e.hidden), true);
  await responder(j, '#confirmar');
  const lista = (await r).ok;
  assert.equal(lista.length, 1);

  const dados = 'conteudo para assinar';
  r = comJanela(page, () => page.evaluate((t, d) => window.assinarDados(t, d, 'SHA-256'), T, dadosB64(dados)));
  j = await janela();
  t = await texto(j);
  assert.ok(t.includes(h.origin));
  assert.ok(t.includes(subjectName), t);
  assert.match(t, /Assinar 1 documento/);
  assert.equal(await j.$eval('#bloco-senha', (e) => e.hidden), false);
  assert.doesNotMatch(t, /Permitir que/); // o site já foi liberado
  await responder(j, '#confirmar', COFRE);
  const sig = (await r).ok;
  assert.ok(verifica(dados, sig), 'assinatura inválida');
});

test('lote: uma confirmação para 3 documentos, 4º pede de novo', async () => {
  const page = await abrir(h.origin);
  await login(page);
  let r = comJanela(page, () => page.evaluate((t) => window.preautorizar(t, 3), T));
  let j = await janela();
  assert.match(await texto(j), /Assinar 3 documentos/);
  await responder(j, '#confirmar', COFRE);
  assert.equal((await r).ok, null);
  for (const n of [1, 2, 3]) {
    const dados = 'doc ' + n;
    const sig = await page.evaluate((t, d) => window.assinarDados(t, d, 'SHA-256'), T, dadosB64(dados));
    assert.ok(verifica(dados, sig));
    await semJanela(0);
  }
  r = comJanela(page, () => page.evaluate((t) => window.assinarDados(t, 'eA==', 'SHA-256'), T));
  j = await janela();
  assert.match(await texto(j), /Assinar 1 documento/);
  await responder(j, '#recusar');
  assert.match((await r).err, /cancelad/);
});

test('recusar devolve cancelamento e não bloqueia o site', async () => {
  const page = await abrir(h.origin);
  let r = comJanela(page, () => page.evaluate(() => window.listar()));
  let j = await janela();
  await responder(j, '#recusar');
  assert.match((await r).err, /cancelad/);
  assert.deepEqual(await sitesGravados(), {});
  r = comJanela(page, () => page.evaluate(() => window.listar()));
  j = await janela(); // abre de novo
  await responder(j, '#confirmar');
  assert.equal((await r).ok.length, 1);
});

test('fechar a janela equivale a recusar', async () => {
  const page = await abrir(h.origin);
  let r = comJanela(page, () => page.evaluate(() => window.listar()));
  const j = await janela();
  await j.close();
  assert.match((await r).err, /cancelad/);
  assert.deepEqual(await sitesGravados(), {});
  r = comJanela(page, () => page.evaluate(() => window.listar()));
  await responder(await janela(), '#confirmar');
  assert.equal((await r).ok.length, 1);
});

test('sem resposta em 120 s o pedido é cancelado', { timeout: 180000 }, async () => {
  const page = await abrir(h.origin);
  const t0 = Date.now();
  const r = comJanela(page, () => page.evaluate(() => window.listar()));
  const j = await janela();
  const fechou = new Promise((res) => j.once('close', res));
  const res = await r;
  const dt = Date.now() - t0;
  assert.match(res.err, /cancelad/);
  assert.ok(dt >= 115000 && dt < 140000, `esperava ~120 s, levou ${dt} ms`);
  await fechou; // a janela é fechada junto
  assert.deepEqual(await sitesGravados(), {});
});

test('senha errada mantém a janela e mostra a espera', { timeout: 60000 }, async () => {
  const page = await abrir(h.origin);
  await login(page);
  const r = comJanela(page, () => page.evaluate((t) => window.assinarDados(t, 'eA==', 'SHA-256'), T));
  const j = await janela();
  let ultimo = '';
  for (let i = 0; i < 4; i++) {
    await j.$eval('#senha', (el) => { el.value = 'errada-errada'; });
    await j.$eval('#status', (el) => { el.className = ''; el.textContent = ''; });
    await j.waitForSelector('#confirmar:not([disabled])');
    await j.click('#confirmar');
    await j.waitForSelector('#status.erro');
    await j.waitForSelector('#confirmar:not([disabled])');
    ultimo = await j.$eval('#status', (e) => e.textContent);
  }
  assert.match(ultimo, /Senha do cofre incorreta/);
  assert.match(ultimo, /Aguarde \d+ s/);
  assert.equal(j.isClosed(), false);
  await new Promise((res) => setTimeout(res, 5500));
  await responder(j, '#confirmar', COFRE);
  assert.ok(verifica('x', (await r).ok));
});

// Review Focus 1
test('pedido malformado não abre janela', async () => {
  const page = await abrir(h.origin);
  const falha = (fn, ...a) => page.evaluate(fn, ...a).then(() => 'passou', (e) => e.message);
  const resultados = await Promise.all([
    falha((t) => window.assinarDados(t, '***não é base64***', 'SHA-256'), T),
    falha((t) => window.assinarDados(t, 'eA==', 'MD99'), T),
    falha((t) => window.assinarHash(t, 'eA==', 'SHA-256'), T),
    falha((t) => window.assinarDados('AAAA', 'eA==', 'SHA-256'), T),
    falha((t) => window.preautorizar(t, 0), T),
    falha((t) => window.preautorizar(t, 501), T),
    falha((t) => window.preautorizar('AAAA', 2), T),
    falha(() => window.ler('AAAA')),
  ]);
  for (const r of resultados) assert.notEqual(r, 'passou');
  await semJanela(1000);
});

// Review Focus 2 (só Chrome)
test('fundo encerrado no meio do lote', { skip: browserName !== 'chrome' }, async () => {
  const page = await abrir(h.origin);
  await login(page);
  const r = comJanela(page, () => page.evaluate((t) => window.preautorizar(t, 3), T));
  await responder(await janela(), '#confirmar', COFRE);
  assert.equal((await r).ok, null);
  const assina = (n) => page.evaluate((t, d) => window.assinarDados(t, d, 'SHA-256'), T, dadosB64('doc ' + n));
  assert.ok(verifica('doc 1', await assina(1)));

  // ServiceWorker.stopAllWorkers só existe numa sessão CDP de página (não na
  // do navegador nem na do alvo do worker).
  const cdp = await page.createCDPSession();
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  const vivo = () => h.browser.targets().some((t) => t.type() === 'service_worker' && t.url().includes('background.js'));
  for (let i = 0; i < 50 && vivo(); i++) await new Promise((res) => setTimeout(res, 100));
  assert.equal(vivo(), false, 'o service worker deveria ter parado');
  // O próximo pedido acorda um worker novo, que recupera cofre e créditos do storage.
  assert.ok(verifica('doc 2', await assina(2)));
  await semJanela(0);
  assert.ok(verifica('doc 3', await assina(3)));
});

// Review Focus 4
test('duas abas, dois sites: cada janela mostra a própria origem', async () => {
  const porta = new URL(h.origin).port;
  const a = h.origin; // http://localhost:porta
  const b = `http://127.0.0.1:${porta}`;
  const p1 = await abrir(a);
  const p2 = await abrir(b);
  const r1 = comJanela(p1, () => p1.evaluate(() => window.listar()));
  const r2 = comJanela(p2, () => p2.evaluate(() => window.listar()));
  const j1 = await janela('localhost');
  const j2 = await janela('127.0.0.1');
  assert.notEqual(j1, j2);
  assert.ok((await texto(j1)).includes(a));
  assert.ok((await texto(j2)).includes(b));
  await responder(j1, '#confirmar');
  assert.equal((await r1).ok.length, 1);
  assert.deepEqual(Object.keys(await sitesGravados()), [a]);
  await responder(j2, '#recusar');
  assert.match((await r2).err, /cancelad/);
  assert.deepEqual(Object.keys(await sitesGravados()), [a]);
});
