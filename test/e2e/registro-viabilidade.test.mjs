// Viabilidade: script registrado em tempo de execução (scripting.registerContentScripts)
// no mundo da página, em https://*.jus.br/* menos o e-SAJ. Descartável: usa a
// extensão mínima de test/viabilidade, servida por interceptação (sem rede).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, ROOT } from './harness.mjs';

let h;
before(async () => {
  h = await launch(process.env.BROWSER || 'chrome', { extras: [path.join(ROOT, 'test/viabilidade')] });
});
after(async () => { if (h) await h.close(); });

// Abre a URL numa aba nova, servida por interceptação, e devolve a página.
async function abrir(url) {
  const page = await h.browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url() === url) {
      req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><body>x' });
    } else {
      req.abort();
    }
  });
  await page.goto(url);
  return page;
}

const valor = async (url) => {
  const page = await abrir(url);
  try { return await page.evaluate(() => window.__viabilidade); } finally { await page.close(); }
};

test('script registrado em tempo de execução roda no mundo da página, menos no e-SAJ', async () => {
  // O registro é assíncrono no fundo: reabre a página até estar em vigor.
  let achado;
  for (const fim = Date.now() + 15000; Date.now() < fim;) {
    achado = await valor('https://pje.tjma.jus.br/x');
    if (achado === 'main') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(achado, 'main');
  assert.equal(await valor('https://esaj.tjsp.jus.br/x'), undefined);
});
