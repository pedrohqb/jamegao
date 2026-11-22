import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, FIX } from './harness.mjs';

const COFRE = 'cofre-forte-1';
let h;
before(async () => {
  h = await launch(process.env.BROWSER || 'chrome');
  await h.importPfx(path.join(FIX, 'pf-moderno.pfx'), 'senha123', COFRE);
});
after(async () => { if (h) await h.close(); });

const naExtensao = async (fn, ...args) => {
  const page = await h.browser.newPage();
  try {
    await page.goto(h.extUrl('pages/import.html'));
    return await page.evaluate(fn, ...args);
  } finally { await page.close(); }
};

test('alarme de travamento existe', async () => {
  const alarme = await naExtensao(() => chrome.alarms.get('travamento'));
  assert.ok(alarme, 'alarme ausente');
  assert.equal(alarme.periodInMinutes, 1);
});

test('30 minutos sem uso travam o cofre', async () => {
  // A importação deixa o cofre destravado.
  const page = await h.browser.newPage();
  await page.goto(`${h.origin}/?lib=lacuna-2.20.0.js`);
  await page.evaluate(() => window.initPki());
  const fechada = (p) => new Promise((r) => p.once('close', r));
  const janela = async () => {
    const fim = Date.now() + 15000;
    while (Date.now() < fim) {
      for (const p of await h.browser.pages()) {
        if (!p.url().includes('pages/confirm.html')) continue;
        const t = await p.$eval('#origem', (e) => e.textContent).catch(() => '');
        if (t) return p;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('janela não apareceu');
  };
  const lista = page.evaluate(() => window.listar());
  let j = await janela();
  let f = fechada(j); await j.click('#confirmar'); await f;
  const T = (await lista)[0].thumbprint;

  const assinar = () => page.evaluate((t) => window.assinarDados(t, 'eA==', 'SHA-256'), T).then((ok) => ({ ok }), (e) => ({ err: e.message }));
  let r;
  // Cofre aberto: a janela de confirmação não pede senha.
  r = assinar();
  j = await janela();
  assert.equal(await j.$eval('#bloco-senha', (e) => e.hidden), true, 'cofre deveria estar destravado');
  f = fechada(j); await j.click('#recusar'); await f;
  await r;

  // 31 minutos sem uso.
  await naExtensao(() => chrome.storage.session.set({ lastUse: Date.now() - 31 * 60000 }));
  r = assinar();
  j = await janela();
  assert.equal(await j.$eval('#bloco-senha', (e) => e.hidden), false, 'deveria pedir a senha');
  f = fechada(j); await j.click('#recusar'); await f;
  await r;
  await page.close();
});
