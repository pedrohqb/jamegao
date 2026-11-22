// Gera as imagens cruas para as capturas das lojas (dados fictícios: o
// certificado de teste de test/fix). Uso: node scripts/capturas.mjs <pasta>
import path from 'node:path';
import { launch, FIX } from '../test/e2e/harness.mjs';
import { criarAjudas } from '../test/e2e/ajudas.mjs';

const out = process.argv[2];
const ESAJ = 'https://esaj.tjsp.jus.br';
const h = await launch('chrome');
const a = criarAjudas(h);
const trocarOrigem = (p, origem) => p.evaluate((o, n) => {
  for (const el of document.querySelectorAll('p, div, span, li')) {
    if (el.children.length === 0 && el.textContent.includes(o)) el.textContent = el.textContent.split(o).join(n);
  }
  for (const li of document.querySelectorAll('[data-origem]')) li.dataset.origem = n;
}, origem, ESAJ);
const foto = async (p, nome) => {
  const el = await p.$('body');
  await el.screenshot({ path: path.join(out, nome) });
};
try {
  await h.importPfx(path.join(FIX, 'pf-moderno.pfx'), 'senha123', 'cofre-forte-1');
  await a.limparSessao();
  const page = await a.abrirPagina(h.origin, 'lacuna-2.20.0.js');

  // 1. Autorização do site.
  let r = a.chamar(page, () => window.listar());
  let j = await a.janela();
  await j.setViewport({ width: 440, height: 300, deviceScaleFactor: 2 });
  await trocarOrigem(j, h.origin);
  await new Promise((res) => setTimeout(res, 700));
  await foto(j, 'cru-site.png');
  await a.responder(j, '#confirmar');
  const T = (await r).ok[0].thumbprint;

  // 2. Assinatura de um lote com o cofre travado.
  r = a.chamar(page, (t) => window.preautorizar(t, 3), T);
  j = await a.janela();
  await j.setViewport({ width: 440, height: 380, deviceScaleFactor: 2 });
  await trocarOrigem(j, h.origin);
  await new Promise((res) => setTimeout(res, 700));
  await foto(j, 'cru-assinatura.png');
  await a.responder(j, '#confirmar', 'cofre-forte-1');
  await r;

  // 3. Popup.
  const popup = await a.abrirPopup();
  await popup.setViewport({ width: 400, height: 420, deviceScaleFactor: 2 });
  await trocarOrigem(popup, h.origin);
  await foto(popup, 'cru-popup.png');

  // 4. Importação.
  const imp = await h.browser.newPage();
  await imp.setViewport({ width: 820, height: 760, deviceScaleFactor: 1.5 });
  await imp.goto(h.extUrl('pages/import.html'));
  await imp.waitForSelector('#importar');
  await new Promise((res) => setTimeout(res, 500));
  await foto(imp, 'cru-importar.png');
} finally {
  await h.close();
}
