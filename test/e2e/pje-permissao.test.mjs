// Permissão de *.jus.br retirada por fora do Jamegão (como nas configurações
// de extensões do navegador): o fundo, por permissions.onRemoved, desliga o PJe.
//
// Só no Firefox: lá a cópia de teste pode perder a permissão. No Chrome ela é
// obrigatória na cópia (permissions.remove é recusado) e já vem concedida, de
// modo que nem onRemoved nem onAdded chegam a disparar; os dois eventos são
// cobertos por test/unit/pje-registro.test.js. Arquivo à parte porque, no
// Firefox, a permissão retirada não volta sem gesto do usuário.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './harness.mjs';
import { ligarPje, abrirPje } from './ajudas-pje.mjs';

const browserName = process.env.BROWSER || 'chrome';
const SO_FIREFOX = browserName !== 'firefox'
  && 'no Chrome a permissão é obrigatória na cópia de teste e não sai; os eventos são cobertos por test/unit/pje-registro.test.js';

let h;
before(async () => {
  if (SO_FIREFOX) return;
  h = await launch(browserName, { pje: true });
});
after(async () => {
  if (h) await h.close();
});

const naExtensao = async (fn) => {
  const page = await h.browser.newPage();
  try {
    await page.goto(h.extUrl('pages/import.html'));
    return await page.evaluate(fn);
  } finally {
    await page.close();
  }
};
const estado = () => naExtensao(async () => {
  const { idbKv } = await import('/lib/kv.js');
  const ids = (await browser.scripting.getRegisteredContentScripts()).map((s) => s.id).sort();
  const concedida = await browser.permissions.contains({ origins: ['https://*.jus.br/*'] });
  return { ids, concedida, escolha: await idbKv().get('pjeLigado') };
});

test('permissão retirada por fora: o fundo desfaz a escolha e retira o registro', { skip: SO_FIREFOX }, async () => {
  await ligarPje(h);
  assert.deepEqual(await estado(), { ids: ['jamegao-pje-conteudo', 'jamegao-pje-pagina'], concedida: true, escolha: true });
  await naExtensao(() => browser.permissions.remove({ origins: ['https://*.jus.br/*'] }));
  let agora;
  for (const fim = Date.now() + 10000; Date.now() < fim;) {
    agora = await estado();
    if (agora.ids.length === 0 && agora.escolha === false) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.deepEqual(agora, { ids: [], concedida: false, escolha: false });
  const { page, localhost } = await abrirPje(h, 'https://pje.tjma.jus.br/pje/x.seam', { jamegao: false });
  assert.equal(await page.evaluate(() => window.chamar(window.ping())), 'indisponivel');
  assert.equal(localhost.length, 1);
  await page.close();
});
