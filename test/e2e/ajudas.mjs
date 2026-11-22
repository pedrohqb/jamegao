// Ajudas comuns aos testes de popup e convivência (não é um teste).
import assert from 'node:assert/strict';

export function criarAjudas(h) {
  const confirmPages = async () => (await h.browser.pages()).filter((p) => p.url().includes('pages/confirm.html'));

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
  async function responder(p, seletor, senha) {
    if (senha !== undefined) await p.$eval('#senha', (el, v) => { el.value = v; }, senha);
    if (seletor === '#confirmar') await p.waitForSelector('#confirmar:not([disabled])');
    const fechou = new Promise((r) => p.once('close', r));
    await p.click(seletor);
    await fechou;
  }
  // Chamada da página: {ok} ou {err}, sem lançar.
  const chamar = (page, fn, ...args) =>
    page.evaluate(fn, ...args).then((ok) => ({ ok }), (e) => ({ err: String(e.message) }));

  async function abrirPagina(origin, lib) {
    const page = await h.browser.newPage();
    await page.goto(`${origin}/?lib=${lib}`);
    assert.deepEqual(await page.evaluate(() => window.initPki()), { ready: true });
    return page;
  }

  // Libera o site pela janela de confirmação, listando os certificados.
  async function login(page, origin = h.origin) {
    const r = chamar(page, () => window.listar());
    await responder(await janela(origin), '#confirmar');
    const res = await r;
    assert.ok(Array.isArray(res.ok), JSON.stringify(res));
    return res.ok;
  }

  async function abrirPopup() {
    const page = await h.browser.newPage();
    await page.goto(h.extUrl('pages/popup.html'));
    await page.waitForSelector('#estado[data-estado]');
    return page;
  }
  const estadoDo = (popup) => popup.$eval('#estado', (e) => e.dataset.estado);

  async function lerStorage(chaves) {
    const page = await h.browser.newPage();
    try {
      await page.goto(h.extUrl('pages/import.html'));
      return await page.evaluate((k) => chrome.storage.local.get(k), chaves);
    } finally { await page.close(); }
  }

  // Apaga tudo (storage, sessão, IndexedDB) das extensões.
  async function limparTudo() {
    const page = await h.browser.newPage();
    await page.goto(h.extUrl('pages/import.html'));
    await page.evaluate(async () => {
      await chrome.storage.local.clear();
      await chrome.storage.session.clear();
      await new Promise((res) => { const r = indexedDB.deleteDatabase('jamegao'); r.onsuccess = r.onerror = r.onblocked = res; });
    });
    await page.close();
  }

  // Só a sessão (cofre travado, sem créditos); o resto fica.
  async function limparSessao() {
    const page = await h.browser.newPage();
    await page.goto(h.extUrl('pages/import.html'));
    await page.evaluate(async () => { await chrome.storage.session.clear(); });
    await page.close();
  }

  async function fecharPaginasDeTeste() {
    for (const p of await h.browser.pages()) {
      if (p.url().includes('pages/confirm.html') || p.url().includes('pages/popup.html') || p.url().includes('lib=')) {
        await p.close().catch(() => {});
      }
    }
  }

  return { confirmPages, janela, texto, semJanela, responder, chamar, abrirPagina, login, abrirPopup, estadoDo, lerStorage, limparTudo, limparSessao, fecharPaginasDeTeste };
}
