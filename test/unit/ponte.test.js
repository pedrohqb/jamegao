import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../../ext/conteudo/ponte.js', import.meta.url), 'utf8');

// Mundo isolado falso: chrome.runtime com sendMessage/onMessage, window com
// pagehide e relógio falso (setTimeout/clearTimeout).
const plain = (x) => JSON.parse(JSON.stringify(x));
function mundo() {
  const enviados = [];
  const respostas = []; // fila de respostas (valor ou função) para sendMessage
  const ouvintes = [];
  const pagehide = [];
  const timers = new Map();
  let proximo = 1;
  let agora = 0;
  const ctx = vm.createContext({
    chrome: {
      runtime: {
        sendMessage: async (msg) => {
          enviados.push(plain(msg));
          if (msg.type === 'prompt-abandon') return undefined;
          const r = respostas.shift();
          return typeof r === 'function' ? r(msg) : r;
        },
        onMessage: { addListener: (fn) => ouvintes.push(fn) },
      },
    },
    window: { addEventListener: (t, fn) => { if (t === 'pagehide') pagehide.push(fn); } },
    setTimeout: (fn, ms) => { const id = proximo++; timers.set(id, { fn, em: agora + ms }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    Promise,
  });
  const carregar = () => vm.runInContext(SRC, ctx);
  return {
    ctx, enviados, respostas, carregar, pagehide,
    ponte: () => ctx.globalThis?.jamegaoPonte ?? vm.runInContext('globalThis.jamegaoPonte', ctx),
    resolver: (id, outcome) => { for (const fn of ouvintes) fn({ type: 'prompt-resolved', id, outcome }); },
    avancar(ms) {
      agora += ms;
      for (const [id, t] of [...timers]) if (t.em <= agora) { timers.delete(id); t.fn(); }
    },
    ouvintes,
  };
}
const tick = () => new Promise((r) => setImmediate(r));
const ok = { success: true, response: 1 };

test('carregar duas vezes deixa uma ponte e uma fila só', async () => {
  const m = mundo();
  m.carregar();
  const primeira = m.ponte();
  m.carregar();
  assert.equal(m.ponte(), primeira);
  assert.equal(m.ouvintes.length, 1);
  assert.equal(m.pagehide.length, 1);
});

test('pedir envia protocolo, comando e pedido', async () => {
  const m = mundo();
  m.carregar();
  m.respostas.push(ok);
  const r = await m.ponte().pedir('esaj', 'listCertificates', { a: 1 });
  assert.deepEqual(plain(r), ok);
  assert.deepEqual(m.enviados[0], { type: 'jamegao-pedido', protocolo: 'esaj', command: 'listCertificates', request: { a: 1 } });
});

test('resposta sem success vira falha de resposta inválida', async () => {
  const m = mundo();
  m.carregar();
  m.respostas.push({ foo: 1 });
  const r = await m.ponte().pedir('esaj', 'x', null);
  assert.equal(r.success, false);
  assert.equal(r.exception.message, 'Jamegão: resposta inválida da extensão');
});

test('falha do sendMessage vira falha com a mensagem', async () => {
  const m = mundo();
  m.carregar();
  m.respostas.push(() => { throw new Error('boom'); });
  const r = await m.ponte().pedir('esaj', 'x', null);
  assert.equal(r.exception.message, 'Jamegão: falha ao falar com a extensão (boom)');
});

test('retry repete o pedido uma vez e devolve o novo resultado', async () => {
  const m = mundo();
  m.carregar();
  m.respostas.push({ pending: true, promptId: 'p1' }, ok);
  const p = m.ponte().pedir('esaj', 'x', null);
  await tick();
  m.resolver('p1', 'retry');
  const r = await p;
  assert.deepEqual(plain(r), ok);
  assert.equal(m.enviados.filter((e) => e.type === 'jamegao-pedido').length, 2);
});

test('retry que pende de novo abandona e cancela', async () => {
  const m = mundo();
  m.carregar();
  m.respostas.push({ pending: true, promptId: 'p1' }, { pending: true, promptId: 'p2' });
  const p = m.ponte().pedir('esaj', 'x', null);
  await tick();
  m.resolver('p1', 'retry');
  const r = await p;
  assert.equal(r.exception.code, 'user_cancelled');
  assert.equal(r.exception.message, 'Operação cancelada: a confirmação não foi concluída.');
  assert.deepEqual(m.enviados.at(-1), { type: 'prompt-abandon', id: 'p2' });
});

test("desfecho 'programa' devolve { programa: true }", async () => {
  const m = mundo();
  m.carregar();
  m.respostas.push({ pending: true, promptId: 'p1' });
  const p = m.ponte().pedir('pje', 'x', null);
  await tick();
  m.resolver('p1', 'programa');
  assert.deepEqual(plain(await p), { programa: true });
});

test('desfecho que chega antes da espera fica guardado', async () => {
  const m = mundo();
  m.carregar();
  m.respostas.push(() => { m.resolver('p1', ok); return { pending: true, promptId: 'p1' }; });
  assert.deepEqual(plain(await m.ponte().pedir('esaj', 'x', null)), ok);
});

test('sem resposta em 120 s: abandona e cancela', async () => {
  const m = mundo();
  m.carregar();
  m.respostas.push({ pending: true, promptId: 'p1' });
  const p = m.ponte().pedir('esaj', 'x', null);
  await tick();
  m.avancar(119999);
  await tick();
  assert.ok(!m.enviados.some((e) => e.type === 'prompt-abandon'));
  m.avancar(1);
  const r = await p;
  assert.equal(r.exception.code, 'user_cancelled');
  assert.equal(r.exception.message, 'Operação cancelada: a confirmação não foi respondida em 120 s.');
  assert.deepEqual(m.enviados.at(-1), { type: 'prompt-abandon', id: 'p1' });
});

test('abandonarPendentes e pagehide abandonam as confirmações pendentes', async () => {
  const m = mundo();
  m.carregar();
  m.respostas.push({ pending: true, promptId: 'p1' });
  m.ponte().pedir('esaj', 'x', null);
  await tick();
  m.pagehide[0]();
  await tick();
  assert.deepEqual(m.enviados.at(-1), { type: 'prompt-abandon', id: 'p1' });
  m.ponte().abandonarPendentes(); // já vazio: nada a mais
  await tick();
  assert.equal(m.enviados.filter((e) => e.type === 'prompt-abandon').length, 1);
});

test('a fila serializa: o segundo pedido só sai quando o primeiro termina', async () => {
  const m = mundo();
  m.carregar();
  m.respostas.push({ pending: true, promptId: 'p1' }, ok);
  const a = m.ponte().pedir('esaj', 'a', null);
  const b = m.ponte().pedir('esaj', 'b', null);
  await tick();
  assert.deepEqual(m.enviados.map((e) => e.command), ['a']);
  m.resolver('p1', ok);
  await a;
  await b;
  assert.deepEqual(m.enviados.map((e) => e.command), ['a', 'b']);
});

test('um elemento da página com id jamegaoPonte não impede a ponte', async () => {
  const m = mundo();
  // Nos navegadores, um elemento com id vira propriedade global da página.
  vm.runInContext('globalThis.jamegaoPonte = { nodeName: "DIV" };', m.ctx);
  m.carregar();
  assert.equal(typeof m.ponte().pedir, 'function');
  assert.equal(m.ouvintes.length, 1);
});

test('retry repete o pedido transformado por repetir', async () => {
  const m = mundo();
  m.carregar();
  m.respostas.push({ pending: true, promptId: 'p1' }, ok);
  const p = m.ponte().pedir('pje', 'assinar', { tipo: 'documentos', novo: true }, { repetir: (q) => ({ ...q, novo: false }) });
  await tick();
  m.resolver('p1', 'retry');
  assert.deepEqual(plain(await p), ok);
  const pedidos = m.enviados.filter((e) => e.type === 'jamegao-pedido').map((e) => e.request);
  assert.deepEqual(pedidos, [{ tipo: 'documentos', novo: true }, { tipo: 'documentos', novo: false }]);
});

test('sem repetir, o retry repete o mesmo pedido', async () => {
  const m = mundo();
  m.carregar();
  m.respostas.push({ pending: true, promptId: 'p1' }, ok);
  const p = m.ponte().pedir('pje', 'assinar', { novo: true });
  await tick();
  m.resolver('p1', 'retry');
  await p;
  const pedidos = m.enviados.filter((e) => e.type === 'jamegao-pedido').map((e) => e.request);
  assert.deepEqual(pedidos, [{ novo: true }, { novo: true }]);
});

// Recusa na janela de confirmação: prompts.js marca o desfecho (`recusa`). A
// ponte tira a marca, para a página receber o formato de sempre, e responde
// por recusou(r). As outras falhas user_cancelled não são recusa.
const RECUSA = {
  success: false,
  exception: { message: 'Operação cancelada.', complete: 'Operação cancelada.', origin: 'extension', code: 'user_cancelled' },
};

test('recusa na janela: resposta sem a marca, e recusou(r) é verdadeiro', async () => {
  const m = mundo();
  m.carregar();
  m.respostas.push({ pending: true, promptId: 'p1' });
  const p = m.ponte().pedir('esaj', 'x', null);
  await tick();
  m.resolver('p1', { ...RECUSA, recusa: true });
  const r = await p;
  assert.deepEqual(plain(r), RECUSA);
  assert.equal(Object.prototype.hasOwnProperty.call(r, 'recusa'), false);
  assert.equal(m.ponte().recusou(r), true);
});

test('as outras falhas user_cancelled não são recusa', async () => {
  const m = mundo();
  m.carregar();
  // Do fundo, sem janela (confirmação pendente, pausa, site bloqueado...).
  const doFundo = { success: false, exception: { ...RECUSA.exception, message: 'Há uma confirmação pendente nesta aba.' } };
  m.respostas.push(doFundo);
  const r1 = await m.ponte().pedir('pje', 'x', null);
  assert.deepEqual(plain(r1), doFundo);
  assert.equal(m.ponte().recusou(r1), false);
  // Prazo de 120 s vencido.
  m.respostas.push({ pending: true, promptId: 'p2' });
  const p2 = m.ponte().pedir('pje', 'x', null);
  await tick();
  m.avancar(120000);
  const r2 = await p2;
  assert.equal(r2.exception.code, 'user_cancelled');
  assert.equal(m.ponte().recusou(r2), false);
  // Repetição que pende de novo.
  m.respostas.push({ pending: true, promptId: 'p3' }, { pending: true, promptId: 'p4' });
  const p3 = m.ponte().pedir('pje', 'x', null);
  await tick();
  m.resolver('p3', 'retry');
  const r3 = await p3;
  assert.equal(r3.exception.code, 'user_cancelled');
  assert.equal(m.ponte().recusou(r3), false);
  // Valores quaisquer.
  for (const v of [undefined, null, 'retry', { programa: true }]) assert.equal(m.ponte().recusou(v), false);
});
