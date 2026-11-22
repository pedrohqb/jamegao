import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, FIX, OFICIAL_FALSA } from './harness.mjs';
import { criarAjudas } from './ajudas.mjs';

// Marca Softplan: é a que a extensão oficial falsa atende.
const LIB = 'softplan-emulado-2.8.0.js';
const COFRE = 'cofre-forte-1';
let h;
let a;

before(async () => {
  h = await launch(process.env.BROWSER || 'chrome', { extras: [OFICIAL_FALSA] });
  a = criarAjudas(h);
});
after(async () => { if (h) await h.close(); });
beforeEach(async () => { await a.limparTudo(); });
afterEach(async () => { await a.fecharPaginasDeTeste(); });

const importar = () => h.importPfx(path.join(FIX, 'pf-moderno.pfx'), 'senha123', COFRE);
const marcadores = (page) => page.evaluate(() => document.querySelectorAll('meta[data-jamegao]').length);
const nomes = (lista) => lista.map((c) => c.subjectName);

test('sem certificado importado o Jamegão não se anuncia', async () => {
  const page = await a.abrirPagina(h.origin, LIB); // só a oficial falsa responde
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(await marcadores(page), 0);
  const lista = await a.chamar(page, () => window.listar());
  assert.deepEqual(nomes(lista.ok), ['TOKEN FALSO']);
  await a.semJanela(500);
});

test('com certificado, o Jamegão responde e o popup avisa da outra extensão', async () => {
  await importar();
  const page = await a.abrirPagina(h.origin, LIB);
  assert.ok((await marcadores(page)) > 0);
  const popup = await a.abrirPopup();
  await popup.waitForSelector('#aviso-oficial:not([hidden])');
  const origens = await popup.$$eval('#sites li', (els) => els.map((e) => e.dataset.origem));
  assert.ok(origens.includes(h.origin), origens.join());
});

test('interruptor "deixar a extensão oficial responder" cala o Jamegão no site', async () => {
  await importar();
  const visto = await a.abrirPagina(h.origin, LIB);
  assert.ok((await marcadores(visto)) > 0);
  const popup = await a.abrirPopup();
  await popup.waitForSelector(`#sites li[data-origem="${h.origin}"] input.oficial`);
  await popup.click(`#sites li[data-origem="${h.origin}"] input.oficial`);
  await popup.waitForFunction((o) => document.querySelector(`#sites li[data-origem="${o}"] input.oficial`)?.checked, {}, h.origin);

  const page = await a.abrirPagina(h.origin, LIB);
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(await marcadores(page), 0);
  const lista = await a.chamar(page, () => window.listar());
  assert.deepEqual(nomes(lista.ok), ['TOKEN FALSO']);
  await a.semJanela(500);
});

test('com as duas respondendo, a página termina o fluxo sem travar', { timeout: 90000 }, async () => {
  await importar();
  const page = await a.abrirPagina(h.origin, LIB);
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  const limite = (p, nome) => Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error('a página travou em ' + nome)), 20000)),
  ]);
  const lista = await limite(a.chamar(page, () => window.listar()), 'listar');
  const T = (lista.ok ?? [])[0]?.thumbprint ?? 'AAAA';
  const lido = await limite(a.chamar(page, (t) => window.ler(t), T), 'ler');
  const assinado = await limite(a.chamar(page, (t) => window.assinarDados(t, 'eA==', 'SHA-256'), T), 'assinar');
  // Cada etapa terminou (com resposta de uma das duas extensões).
  for (const r of [lista, lido, assinado]) assert.ok('ok' in r || 'err' in r);
  console.log('# convivência: listar=%s ler=%s assinar=%s pageerrors=%d',
    JSON.stringify(lista).slice(0, 80), JSON.stringify(lido).slice(0, 80), JSON.stringify(assinado).slice(0, 80), erros.length);
});
