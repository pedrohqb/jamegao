import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { launch, FIX } from './harness.mjs';
import { criarAjudas } from './ajudas.mjs';

// Servidor próprio que registra todo pedido recebido (o do harness não loga).
let h;
let spy;
let spy2;
const hits = [];
const novoEspiao = async () => {
  const srv = http.createServer((req, res) => {
    hits.push(`${srv.address().port}${req.url}`);
    res.writeHead(200, { 'access-control-allow-origin': '*' }).end('x');
  });
  // Sem listener de 'upgrade' o Node não registra WebSocket: loga e derruba.
  srv.on('upgrade', (req, socket) => {
    hits.push(`${srv.address().port}${req.url}`);
    socket.destroy();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return srv;
};
before(async () => {
  spy = await novoEspiao();
  spy2 = await novoEspiao(); // outra origem local, no lugar de um site externo
  h = await launch(process.env.BROWSER || 'chrome');
});
after(async () => {
  if (h) await h.close();
  if (spy) spy.close();
  if (spy2) spy2.close();
});

// Tenta fetch (nas duas origens locais), WebSocket e (se houver janela) sendBeacon.
// Conta também os eventos securitypolicyviolation (só onde existem: páginas).
const tentativas = `async (bases, tag, comBeacon) => {
  const out = {};
  const violacoes = [];
  if (typeof document !== 'undefined') {
    document.addEventListener('securitypolicyviolation', (e) => violacoes.push(e.violatedDirective));
  }
  const f = async (u) => { try { await fetch(u, { mode: 'no-cors' }); return 'passou'; } catch (e) { return 'bloqueado'; } };
  out.fetchA = await f(bases[0] + '/fetch-' + tag);
  out.fetchB = await f(bases[1] + '/fetch-' + tag);
  out.ws = await new Promise((res) => {
    try {
      const w = new WebSocket(bases[0].replace('http', 'ws') + '/ws-' + tag);
      w.onopen = () => { w.close(); res('passou'); };
      w.onerror = () => res('bloqueado');
      setTimeout(() => res('bloqueado'), 3000);
    } catch { res('bloqueado'); }
  });
  if (comBeacon) {
    let ok = false;
    try { ok = navigator.sendBeacon(bases[0] + '/beacon-' + tag, 'x'); } catch {}
    out.beacon = ok ? 'enfileirado' : 'bloqueado'; // true só enfileira: a prova é o servidor não receber nada
  }
  await new Promise((r) => setTimeout(r, 300));
  out.violacoes = violacoes;
  return out;
}`;

const paginas = ['pages/import.html', 'pages/confirm.html', 'pages/popup.html'];

test('fundo e páginas não conseguem abrir conexão', async () => {
  const bases = [spy, spy2].map((s) => `http://127.0.0.1:${s.address().port}`);
  const resultados = {};

  // Controle positivo: uma página comum (fora da extensão) alcança os dois
  // espiões, que registram o pedido. Sem isto, "zero pedidos" não prova nada.
  const comum = await h.browser.newPage();
  try {
    await comum.goto(`${h.origin}/`);
    for (const [i, b] of bases.entries()) {
      await comum.evaluate((u) => fetch(u, { mode: 'no-cors' }), `${b}/controle-${i}`);
      await comum.evaluate((u) => { new WebSocket(u).onerror = () => {}; }, `${b.replace('http', 'ws')}/ws-controle-${i}`);
      assert.equal(await comum.evaluate((u) => navigator.sendBeacon(u, 'x'), `${b}/beacon-controle-${i}`), true);
    }
  } finally {
    await comum.close().catch(() => {});
  }
  await new Promise((r) => setTimeout(r, 1000));
  for (const [i, b] of bases.entries()) {
    for (const c of ['controle', 'ws-controle', 'beacon-controle']) {
      assert.ok(hits.includes(`${new URL(b).port}/${c}-${i}`), `espião ${i} não registrou ${c}: ${hits}`);
    }
  }
  hits.length = 0;

  // Só Chrome: o fundo do Firefox é uma página de fundo, sem alvo de worker
  // para o puppeteer avaliar código nele. A CSP (connect-src 'none') vale
  // igualmente para as páginas da extensão, testadas abaixo.
  if (h.name === 'chrome') {
    const swTarget = h.browser.targets().find((t) => t.type() === 'service_worker' && t.url().includes('background.js'));
    const worker = await swTarget.worker();
    resultados.fundo = await worker.evaluate(`(${tentativas})(${JSON.stringify(bases)}, 'fundo', false)`);
  } else {
    console.log('# fundo não testado no Firefox (sem alvo de worker); só as páginas da extensão');
  }

  for (const p of paginas) {
    const nome = p.split('/')[1].replace('.html', '');
    assert.ok(fs.existsSync(new URL('../../ext/' + p, import.meta.url)), `${p} deveria existir`);
    const page = await h.browser.newPage();
    try {
      // confirm.html fecha a si mesma sem um pedido válido; a página tem de ficar aberta.
      if (h.name === 'firefox' && nome === 'confirm') {
        // O BiDi do Firefox não aplica evaluateOnNewDocument em páginas de
        // extensão, e a confirm.html fecha a si mesma sem um pedido válido.
        // Aqui o pedido é real: a janela que a extensão abre fica de pé
        // enquanto o teste a exercita.
        const a = criarAjudas(h);
        await h.importPfx(path.join(FIX, 'pf-moderno.pfx'), 'senha123', 'cofre-forte-1');
        const site = await a.abrirPagina(h.origin, 'softplan-emulado-2.8.0.js');
        a.chamar(site, () => window.listar());
        const janela = await a.janela(h.origin);
        try {
          resultados[nome] = await janela.evaluate(`(${tentativas})(${JSON.stringify(bases)}, ${JSON.stringify(nome)}, true)`);
        } finally {
          await janela.close().catch(() => {});
          await site.close().catch(() => {});
        }
      } else {
        await page.evaluateOnNewDocument(() => { window.close = () => {}; });
        await page.goto(h.extUrl(p));
        resultados[nome] = await page.evaluate(`(${tentativas})(${JSON.stringify(bases)}, ${JSON.stringify(nome)}, true)`);
      }
    } finally {
      await page.close().catch(() => {});
    }
  }

  await new Promise((r) => setTimeout(r, 1000));
  for (const nome of ['import', 'confirm', 'popup']) assert.ok(resultados[nome], `${nome} não foi exercitada`);
  if (h.name === 'chrome') assert.ok(resultados.fundo, 'fundo não foi exercitado');
  for (const [onde, { violacoes, ...r }] of Object.entries(resultados)) {
    for (const [k, v] of Object.entries(r)) if (k !== 'beacon') assert.equal(v, 'bloqueado', `${onde}: ${k} ${v}`);
    if (onde !== 'fundo') {
      // bloqueio pela CSP, não por outra falha: o navegador emite a violação de connect-src
      assert.ok(violacoes.some((d) => d.startsWith('connect-src')), `${onde}: sem violação de connect-src (${violacoes})`);
    }
  }
  assert.deepEqual(hits, [], 'um espião recebeu pedidos: ' + hits.join(', '));
});
