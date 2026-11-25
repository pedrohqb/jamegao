// Ligar e desligar o PJe: permissão opcional de *.jus.br e registro dos
// scripts (protocolos/pje/registro.js), pelo popup e pela importação.
//
// A cópia de teste traz *.jus.br em host_permissions (harness, `pje: true`):
// a permissão vem concedida, mas o PJe só liga com a escolha do usuário
// (`pjeLigado`). No Chrome, permissions.request responde true sem perguntar e
// permissions.remove é recusado (a permissão é obrigatória na cópia): a
// escolha guardada é o que mantém o PJe desligado. No Firefox,
// permissions.request exige gesto do usuário de verdade (o clique pelo BiDi
// não conta) e permissions.remove devolve a permissão: lá o PJe é ligado por
// ligarPje (como o clique, menos o pedido), e os testes que ligam pelo
// clique são só do Chrome.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './harness.mjs';
import { abrirPje, ligarPje } from './ajudas-pje.mjs';
import { gerar } from '../fix/gerar.mjs';

const browserName = process.env.BROWSER || 'chrome';
const SEM_GESTO_FIREFOX = browserName === 'firefox'
  && 'no Firefox, permissions.request só aceita gesto do usuário de verdade, que o BiDi não produz em página de extensão';
const COFRE = 'cofre-forte-1';
const TJMA = 'https://pje.tjma.jus.br';
const ESAJ = 'https://esaj.tjsp.jus.br';
const RECARREGUE = 'Recarregue as páginas do PJe que estiverem abertas.';

let h;
let gen;
const abertas = [];

before(async () => {
  gen = fs.mkdtempSync(path.join(os.tmpdir(), 'jamegao-pje-ligar-'));
  await gerar(gen);
  h = await launch(browserName, { pje: true });
  await h.importPfx(path.join(gen, 'cadeia.pfx'), 'senha123', COFRE);
});
after(async () => {
  if (h) await h.close();
  if (gen) fs.rmSync(gen, { recursive: true, force: true });
});
afterEach(async () => {
  for (const p of abertas.splice(0)) await p.close().catch(() => {});
});

const nova = async (url) => {
  const page = await h.browser.newPage();
  abertas.push(page);
  await page.goto(url);
  return page;
};
const naExtensao = async (fn, ...args) => {
  const page = await h.browser.newPage();
  try {
    await page.goto(h.extUrl('pages/import.html'));
    return await page.evaluate(fn, ...args);
  } finally {
    await page.close();
  }
};
const registrados = () => naExtensao(async () => (await chrome.scripting.getRegisteredContentScripts())
  .map((s) => s.id).filter((id) => id.startsWith('jamegao-pje-')).sort());
const concedida = () => naExtensao(() => chrome.permissions.contains({ origins: ['https://*.jus.br/*'] }));
const LIGADOS = ['jamegao-pje-conteudo', 'jamegao-pje-pagina'];
async function esperarRegistro(esperados) {
  let ultimo;
  for (const fim = Date.now() + 10000; Date.now() < fim;) {
    ultimo = await registrados();
    if (JSON.stringify(ultimo) === JSON.stringify(esperados)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.deepEqual(ultimo, esperados);
}

// O PJe atende a página do TJMA: a consulta ao assinador responde 1×1 sem ir a :8800.
async function tjmaAtendido() {
  const { page, localhost } = await abrirPje(h, TJMA + '/pje/x.seam');
  abertas.push(page);
  assert.equal(await page.evaluate(() => window.chamar(window.ping())), 'ok');
  assert.deepEqual(localhost, []);
}
// Sem os scripts do PJe, a imagem segue para :8800 (abortada pelo teste).
async function tjmaNaoAtendido() {
  const { page, localhost } = await abrirPje(h, TJMA + '/pje/x.seam', { jamegao: false });
  abertas.push(page);
  assert.equal(await page.evaluate(() => window.chamar(window.ping())), 'indisponivel');
  assert.equal(localhost.length, 1);
  assert.match(localhost[0], /^http:\/\/localhost:8800\/pjeOffice\//);
}

const abrirPopup = async () => {
  const popup = await nova(h.extUrl('pages/popup.html'));
  await popup.waitForSelector('body[data-render]');
  return popup;
};
const marcado = (popup) => popup.$eval('#pje-ligar', (i) => i.checked);

// Importa pela página e a deixa aberta (para ver o botão do PJe).
async function importar(arquivo, senhaPfx) {
  const page = await nova(h.extUrl('pages/import.html'));
  await page.waitForSelector('#importar');
  await (await page.$('#arquivo')).uploadFile(path.join(gen, arquivo));
  await page.$eval('#senha-pfx', (el, v) => { el.value = v; }, senhaPfx);
  await page.$eval('#senha-cofre', (el, v) => { el.value = v; }, COFRE);
  await page.click('#importar');
  await page.waitForSelector('#status.ok, #status.erro');
  assert.equal(await page.$eval('#status', (el) => el.className), 'ok');
  return page;
}

const escolha = () => naExtensao(() => import('/lib/kv.js').then(({ idbKv }) => idbKv().get('pjeLigado')));

// Chrome: encerra o service worker (como em assinar.test.mjs,
// ServiceWorker.stopAllWorkers numa sessão CDP de página) e acorda um novo com
// uma mensagem qualquer; o fundo novo acerta o registro ao iniciar.
async function reiniciarFundo() {
  const page = await nova('about:blank');
  const cdp = await page.createCDPSession();
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  const vivo = () => h.browser.targets().some((t) => t.type() === 'service_worker' && t.url().includes('background.js'));
  for (let i = 0; i < 50 && vivo(); i++) await new Promise((res) => setTimeout(res, 100));
  assert.equal(vivo(), false, 'o service worker deveria ter parado');
  await naExtensao(() => chrome.runtime.sendMessage({ type: 'acordar' }).catch(() => null));
  for (let i = 0; i < 50 && !vivo(); i++) await new Promise((res) => setTimeout(res, 100));
  assert.equal(vivo(), true, 'o service worker deveria ter voltado');
}

// Ligado para os testes seguintes: no Chrome pelo clique (teste anterior); no
// Firefox, onde o clique não liga, por ligarPje.
async function garantirLigado() {
  if (JSON.stringify(await registrados()) !== JSON.stringify(LIGADOS)) await ligarPje(h);
  assert.deepEqual(await registrados(), LIGADOS);
  assert.equal(await escolha(), true);
}

test('com a permissão, mas sem a escolha do usuário, o PJe vem desligado', async () => {
  await new Promise((r) => setTimeout(r, 500)); // tempo para o acerto do fundo ao iniciar
  assert.equal(await concedida(), true);
  assert.equal(await escolha(), undefined);
  assert.deepEqual(await registrados(), []);
  const popup = await abrirPopup();
  assert.equal(await marcado(popup), false);
  await tjmaNaoAtendido();
});

// O que o Firefox faz com o clique do BiDi: recusa o pedido de permissão, e o
// popup avisa e segue desligado (com usuário de verdade, o clique é gesto).
test('Firefox: clique sem gesto de verdade, o pedido é recusado e o PJe segue desligado', { skip: browserName !== 'firefox' && 'só no Firefox' }, async () => {
  const popup = await abrirPopup();
  assert.equal(await marcado(popup), false);
  const render = await popup.$eval('body', (b) => Number(b.dataset.render));
  await popup.click('#pje-ligar');
  await popup.waitForSelector(`body:not([data-render="${render}"])`);
  assert.equal(await marcado(popup), false);
  assert.equal(await popup.$eval('#status', (e) => `${e.className}|${e.textContent}`), 'erro|Não foi possível concluir a ação.');
  assert.equal(await popup.$eval('#pje-aviso', (e) => e.hidden), true);
  assert.deepEqual(await registrados(), []);
  assert.equal(await escolha(), undefined);
});

test('ligar pelo popup: o TJMA passa a ser atendido', { skip: SEM_GESTO_FIREFOX }, async () => {
  const popup = await abrirPopup();
  assert.equal(await marcado(popup), false);
  await popup.click('#pje-ligar');
  await popup.waitForSelector('#pje-ligar:checked');
  // A caixa fica marcada no clique; o aviso só aparece quando o ligar termina.
  await popup.waitForSelector('#pje-aviso:not([hidden])');
  assert.equal(await popup.$eval('#pje-aviso', (e) => (e.hidden ? '' : e.textContent.trim())), RECARREGUE);
  assert.deepEqual(await registrados(), LIGADOS);
  assert.equal(await escolha(), true);
  await tjmaAtendido();
});

test('página do e-SAJ não recebe os scripts do PJe', async () => {
  await garantirLigado();
  const page = await h.browser.newPage();
  abertas.push(page);
  await page.setRequestInterception(true);
  page.on('request', (req) => (req.url().startsWith(ESAJ)
    ? req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><body>e-SAJ</body>' })
    : req.abort()));
  await page.goto(ESAJ + '/esaj/portal.do');
  // O script do e-SAJ está lá (marcadores das marcas); os do PJe, não.
  await page.waitForFunction(() => document.querySelectorAll('meta[data-jamegao]').length > 0);
  assert.equal(await page.evaluate(() => window.__jamegaoPje), undefined);
});

test('importação com o PJe ligado: sem o botão do PJe', async () => {
  await garantirLigado();
  const popup = await abrirPopup();
  assert.equal(await marcado(popup), true);
  const page = await importar('quase.pfx', 'senha123');
  assert.equal(await page.$eval('#pje-ligar', (b) => b.hidden), true);
});

test('popup: marcas de certificado para o PJe e tarefas recusadas', async () => {
  // senha-vazia.pfx e quase.pfx não trazem autoridades (a cadeia é só o
  // titular); o vencido.pfx vira um certificado importado antes de a
  // importação guardar a cadeia.
  await h.importPfx(path.join(gen, 'senha-vazia.pfx'), '', COFRE);
  await h.importPfx(path.join(gen, 'vencido.pfx'), 'senha123', COFRE);
  await naExtensao(async (recusadas) => {
    const { createCerts } = await import('/lib/certs.js');
    const certs = createCerts();
    const vencido = (await certs.list()).find((c) => c.model.subjectName.startsWith('VENCIDO'));
    delete vencido.chainB64;
    await certs.put(vencido);
    await chrome.storage.session.set({ pjeRecusadas: recusadas });
  }, [{ origin: TJMA, tarefa: 'cnj.assinador' }, { origin: 'https://pje2g.tjma.jus.br', tarefa: 'pje.assinadorPdf' }]);

  const popup = await abrirPopup();
  const itens = await popup.$$eval('#certs li', (lis) => lis.map((li) => li.textContent));
  const de = (nome) => itens.find((t) => t.startsWith(nome + ' ('));
  const SEM_AUTORIDADES = 'O arquivo deste certificado não trouxe as autoridades certificadoras; o PJe pode recusá-lo.';
  const REIMPORTE = 'Importe de novo para usar no PJe.';
  assert.ok(de('VENCIDO').includes(REIMPORTE), de('VENCIDO'));
  assert.ok(!de('VENCIDO').includes(SEM_AUTORIDADES));
  for (const nome of ['SENHA VAZIA', 'QUASE VENCIDO']) {
    assert.ok(de(nome).includes(SEM_AUTORIDADES) && !de(nome).includes(REIMPORTE), de(nome));
  }
  const titular = de('TITULAR COM CADEIA');
  assert.ok(!titular.includes(REIMPORTE) && !titular.includes(SEM_AUTORIDADES), titular);
  assert.deepEqual(await popup.$$eval('#pje-recusadas li', (lis) => lis.map((li) => li.textContent)), [
    'O PJe pediu uma operação que o Jamegão ainda não faz: cnj.assinador em https://pje.tjma.jus.br.',
    'O PJe pediu uma operação que o Jamegão ainda não faz: pje.assinadorPdf em https://pje2g.tjma.jus.br.',
  ]);
  await naExtensao(() => chrome.storage.session.remove('pjeRecusadas'));
});

// No Firefox não há como encerrar o fundo pelo BiDi: o acerto da
// inicialização é coberto por test/unit/pje-registro.test.js (acertar).
const SEM_REINICIO = browserName === 'firefox' && 'no Firefox não há como encerrar o fundo pelo BiDi; acertar é coberto por test/unit/pje-registro.test.js';

test('registro apagado à mão: o fundo, ao reiniciar, registra de novo', { skip: SEM_REINICIO }, async () => {
  await garantirLigado();
  await naExtensao(() => chrome.scripting.unregisterContentScripts({ ids: ['jamegao-pje-pagina', 'jamegao-pje-conteudo'] }));
  assert.deepEqual(await registrados(), []);
  await reiniciarFundo();
  await esperarRegistro(LIGADOS);
  await tjmaAtendido();
});

test('desligar pelo popup: os scripts saem e a imagem segue para :8800', async () => {
  await garantirLigado();
  const popup = await abrirPopup();
  assert.equal(await marcado(popup), true);
  await popup.click('#pje-ligar');
  await popup.waitForSelector('#pje-ligar:not(:checked)');
  assert.deepEqual(await registrados(), []);
  assert.equal(await escolha(), false);
  // A cópia de teste tem a permissão como obrigatória: o Chrome recusa
  // devolvê-la (e o Jamegão ignora a recusa); o Firefox a devolve.
  assert.equal(await concedida(), browserName === 'chrome');
  await tjmaNaoAtendido();
  // Fechado e aberto de novo, o popup segue desligado.
  await popup.close();
  assert.equal(await marcado(await abrirPopup()), false);
});

test('desligado com a permissão que o navegador não devolveu: o fundo, ao reiniciar, não religa', { skip: SEM_REINICIO }, async () => {
  assert.equal(await concedida(), true);
  assert.equal(await escolha(), false);
  await reiniciarFundo();
  await new Promise((r) => setTimeout(r, 1000)); // tempo para o acerto do fundo novo
  assert.deepEqual(await registrados(), []);
  await tjmaNaoAtendido();
});

test('importação com o PJe desligado: botão "Usar também no PJe"', async () => {
  const popup = await abrirPopup();
  assert.equal(await marcado(popup), false);
  await popup.close();
  const page = await importar('quase.pfx', 'senha123');
  assert.equal(await page.$eval('#pje-ligar', (b) => (b.hidden ? '' : b.textContent.trim())), 'Usar também no PJe');
  if (SEM_GESTO_FIREFOX) {
    // No Firefox o clique do BiDi não é gesto: o pedido é recusado.
    await page.click('#pje-ligar');
    await page.waitForSelector('#status.erro');
    assert.equal(await page.$eval('#pje-ligar', (b) => b.hidden), false);
    assert.deepEqual(await registrados(), []);
    return;
  }
  await page.click('#pje-ligar');
  await page.waitForSelector('#pje-ligar[hidden]');
  assert.equal(await page.$eval('#pje-aviso', (e) => (e.hidden ? '' : e.textContent.trim())), RECARREGUE);
  assert.deepEqual(await registrados(), LIGADOS);
  assert.equal(await escolha(), true);
  await tjmaAtendido();
});
