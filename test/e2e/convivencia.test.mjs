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

test('com a oficial na página, o Jamegão se desliga mesmo com certificado', async () => {
  await importar();
  const page = await a.abrirPagina(h.origin, LIB);
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(await marcadores(page), 0, 'o Jamegão não deveria ficar anunciado');
  // Só a oficial responde: sem janela do Jamegão, sem resposta duplicada.
  const lista = await a.chamar(page, () => window.listar());
  assert.deepEqual(nomes(lista.ok), ['TOKEN FALSO']);
  const ler = await a.chamar(page, () => window.preautorizar('B9MJNfYfktv998Lx3nOytLeg+6kR+kc6gZvxPCIYQAs=', 2));
  assert.ok(ler.err, 'quem responde ao pedido desconhecido é a oficial');
  await a.semJanela(800);
  assert.deepEqual(erros, [], 'nenhuma segunda resposta deveria chegar à página');
});

test('o ícone avisa em que site o Jamegão se desligou', async () => {
  await importar();
  await a.abrirPagina(h.origin, LIB);
  const popup = await a.abrirPopup();
  await popup.waitForSelector('#aviso-oficial:not([hidden])');
  assert.match(await popup.$eval('#aviso-oficial', (e) => e.textContent), new RegExp(h.origin.replace(/[.:/]/g, '\\$&')));
  assert.equal(await popup.$('#sites input.oficial'), null, 'o interruptor antigo não existe mais');
});
