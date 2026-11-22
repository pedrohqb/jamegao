import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, FIX } from './harness.mjs';

const FIREFOX_UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';
const SDKS = ['softplan-emulado-2.8.0.js', 'lacuna-2.14.8.js', 'lacuna-2.20.0.js'];
const CANAIS = [
  { nome: 'CustomEvent', ua: null },
  { nome: 'postMessage (UA de Firefox)', ua: FIREFOX_UA },
];

let h;
// Sem certificado importado o Jamegão não se anuncia.
before(async () => {
  h = await launch(process.env.BROWSER || 'chrome');
  await h.importPfx(path.join(FIX, 'pf-moderno.pfx'), 'senha123', 'cofre-forte-1');
});
after(async () => { if (h) await h.close(); });

for (const lib of SDKS) {
  for (const canal of CANAIS) {
    test(`${lib} / ${canal.nome}: init reconhece a extensão e comando fora do escopo é recusado`, async () => {
      const page = await h.browser.newPage();
      try {
        if (canal.ua) await page.setUserAgent(canal.ua);
        await page.goto(`${h.origin}/?lib=${lib}`);
        const init = await page.evaluate(() => window.initPki());
        assert.deepEqual(init, { ready: true });
        const pdf = await page.evaluate(() => window.assinarPdf('AAAA').then(() => 'assinou', (e) => e.message));
        assert.match(pdf, /não atende/);
        const marcados = await page.evaluate(() => document.querySelectorAll('meta[data-jamegao]').length);
        assert.ok(marcados > 0);
      } finally {
        await page.close();
      }
    });
  }
}

test('página fora dos domínios do manifesto não recebe o marcador', async () => {
  const page = await h.browser.newPage();
  try {
    await page.goto('data:text/html,<html><head></head><body>x</body></html>');
    assert.equal(await page.evaluate(() => document.querySelectorAll('meta[data-jamegao]').length), 0);
  } finally {
    await page.close();
  }
});
