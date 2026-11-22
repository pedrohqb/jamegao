import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { launch } from './harness.mjs';

// Servidor próprio que registra todo pedido recebido (o do harness não loga).
let h;
let spy;
const hits = [];
before(async () => {
  spy = http.createServer((req, res) => {
    hits.push(req.url);
    res.writeHead(200, { 'access-control-allow-origin': '*' }).end('x');
  });
  await new Promise((r) => spy.listen(0, '127.0.0.1', r));
  h = await launch(process.env.BROWSER || 'chrome');
});
after(async () => {
  if (h) await h.close();
  if (spy) spy.close();
});

// Tenta fetch, WebSocket e (se houver janela) sendBeacon; devolve o resultado de cada um.
const tentativas = `async (base, tag, comBeacon) => {
  const out = {};
  const f = async (u) => { try { await fetch(u, { mode: 'no-cors' }); return 'passou'; } catch { return 'bloqueado'; } };
  out.fetchLocal = await f(base + '/fetch-' + tag);
  out.fetchExterno = await f('https://example.com/fetch-' + tag);
  out.ws = await new Promise((res) => {
    try {
      const w = new WebSocket(base.replace('http', 'ws') + '/ws-' + tag);
      w.onopen = () => { w.close(); res('passou'); };
      w.onerror = () => res('bloqueado');
      setTimeout(() => res('bloqueado'), 3000);
    } catch { res('bloqueado'); }
  });
  if (comBeacon) {
    let ok = false;
    try { ok = navigator.sendBeacon(base + '/beacon-' + tag, 'x'); } catch {}
    out.beacon = ok ? 'enfileirado' : 'bloqueado'; // true só enfileira: a prova é o servidor não receber nada
  }
  return out;
}`;

const paginas = ['pages/import.html', 'pages/confirm.html', 'pages/popup.html'];

test('fundo e páginas não conseguem abrir conexão', async () => {
  const base = `http://127.0.0.1:${spy.address().port}`;
  const resultados = {};

  const swTarget = h.browser.targets().find((t) => t.type() === 'service_worker' && t.url().includes('background.js'));
  const worker = await swTarget.worker();
  resultados.fundo = await worker.evaluate(`(${tentativas})(${JSON.stringify(base)}, 'fundo', false)`);

  for (const p of paginas) {
    const nome = p.split('/')[1].replace('.html', '');
    if (!fs.existsSync(new URL('../../ext/' + p, import.meta.url))) {
      console.log(`# ${p} ainda não existe: ignorada`);
      continue;
    }
    const page = await h.browser.newPage();
    try {
      await page.goto(h.extUrl(p));
      resultados[nome] = await page.evaluate(`(${tentativas})(${JSON.stringify(base)}, ${JSON.stringify(nome)}, true)`);
    } finally {
      await page.close().catch(() => {});
    }
  }

  await new Promise((r) => setTimeout(r, 1000));
  for (const [onde, r] of Object.entries(resultados)) {
    for (const [k, v] of Object.entries(r)) if (k !== 'beacon') assert.equal(v, 'bloqueado', `${onde}: ${k} ${v}`);
  }
  assert.deepEqual(hits, [], 'o servidor de teste recebeu pedidos: ' + hits.join(', '));
});
