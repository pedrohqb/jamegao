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

test('com as duas respondendo, a página termina o fluxo sem travar', { timeout: 60000 }, async () => {
  await importar();
  const page = await a.abrirPagina(h.origin, LIB);
  // As respostas duplicadas do init já chegaram; só contamos o que vem depois.
  await new Promise((r) => setTimeout(r, 500));
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));

  // A oficial responde em 20 ms; o Jamegão antes precisa pedir o site ao usuário.
  const r = a.chamar(page, () => window.listar());
  const j = await a.janela(h.origin);
  const lista = await r; // a página termina o fluxo sem esperar o usuário
  assert.deepEqual(lista.ok.map((c) => c.subjectName), ['TOKEN FALSO']);
  // O usuário autoriza: o Jamegão responde ao pedido já encerrado. O SDK da
  // página não tem mais o requestId e lança um TypeError - exatamente um.
  await a.responder(j, '#confirmar');
  await new Promise((res) => setTimeout(res, 800));
  assert.equal(erros.length, 1, erros.join(' | '));
  assert.match(erros[0], /undefined|null/);
  // A página continua funcional: novo pedido é atendido sem janela. Quem
  // responde primeiro (o Jamegão, local e imediato, ou a oficial, 20 ms) não é
  // determinístico, então só se exige uma lista de um certificado.
  const outra = await a.chamar(page, () => window.listar());
  assert.equal(outra.ok.length, 1);
  assert.ok(['TOKEN FALSO', 'FULANO DE TAL TESTE:12345678909'].includes(outra.ok[0].subjectName));
  await a.semJanela(0);
});

test('página já aberta: escolher a oficial cala o Jamegão na mesma página', async () => {
  await importar();
  const page = await a.abrirPagina(h.origin, LIB);
  assert.ok((await marcadores(page)) > 0);
  await new Promise((r) => setTimeout(r, 500));
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));

  const popup = await a.abrirPopup();
  const sw = `#sites li[data-origem="${h.origin}"] input.oficial`;
  await popup.waitForSelector(sw);
  const antes = Number(await popup.$eval('body', (b) => b.dataset.render));
  await popup.click(sw);
  // Espera a gravação terminar (o popup redesenha depois de gravar), não só
  // a caixa marcar, que acontece antes.
  await popup.waitForFunction((s, n) => Number(document.body.dataset.render) > n && document.querySelector(s)?.checked, {}, sw, antes);

  const lista = await a.chamar(page, () => window.listar());
  assert.deepEqual(lista.ok.map((c) => c.subjectName), ['TOKEN FALSO']);
  await a.semJanela(800);
  assert.equal(await marcadores(page), 0, 'o Jamegão deveria ter retirado os próprios marcadores');
  assert.deepEqual(erros, [], 'nenhuma segunda resposta deveria chegar à página');
});
