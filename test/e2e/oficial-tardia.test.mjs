// A oficial que só se revela pela resposta (sem o elemento de marca, ou com
// ele criado tarde): a primeira resposta que não é do Jamegão o desliga.
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, FIX } from './harness.mjs';
import { criarAjudas } from './ajudas.mjs';

const LIB = 'softplan-emulado-2.8.0.js';
let h;
let a;

before(async () => {
  h = await launch(process.env.BROWSER || 'chrome');
  a = criarAjudas(h);
});
after(async () => { if (h) await h.close(); });
beforeEach(async () => {
  await a.limparTudo();
  await h.importPfx(path.join(FIX, 'pf-moderno.pfx'), 'senha123', 'cofre-forte-1');
});
afterEach(async () => { await a.fecharPaginasDeTeste(); });

const marcadores = (page) => page.evaluate(() => document.querySelectorAll('meta[data-jamegao]').length);

// Uma resposta "de outra extensão", no canal que o SDK desta página usa.
const respostaAlheia = (page) =>
  page.evaluate(() => {
    const port = 'br.com.softplan.WebPKI.ResponseEvent';
    const message = { requestId: 'alheio-' + Math.random(), success: true, response: [] };
    if (navigator.userAgent.includes('Firefox')) window.postMessage({ port, message }, location.origin);
    else document.dispatchEvent(new CustomEvent(port, { detail: message }));
  });

test('resposta alheia: o Jamegão some da página e fecha a janela pendente', async () => {
  const page = await a.abrirPagina(h.origin, LIB);
  assert.ok((await marcadores(page)) > 0, 'sem a oficial, o Jamegão se anuncia');

  // Um pedido que espera o usuário: a janela de autorização do site abre.
  let respondeu = false;
  a.chamar(page, () => window.listar()).then(() => { respondeu = true; });
  await a.janela(h.origin);

  await respostaAlheia(page);
  // A janela fecha sozinha e o Jamegão não responde mais nada.
  const fim = Date.now() + 5000;
  while ((await a.confirmPages()).length && Date.now() < fim) await new Promise((r) => setTimeout(r, 100));
  await a.semJanela(0);
  assert.equal(await marcadores(page), 0);
  await new Promise((r) => setTimeout(r, 800));
  assert.equal(respondeu, false, 'o Jamegão não deveria responder depois de se desligar');
});

test('sem resposta alheia, o Jamegão segue respondendo (as próprias respostas não o desligam)', async () => {
  const page = await a.abrirPagina(h.origin, LIB);
  await a.login(page);
  const lista = await a.chamar(page, () => window.listar()); // já sem janela
  assert.equal(lista.ok.length, 1);
  assert.ok((await marcadores(page)) > 0);
});
