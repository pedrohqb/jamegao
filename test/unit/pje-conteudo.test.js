import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { pkiPath } from '../../ext/lib/pkipath.js';

const SRC = fs.readFileSync(new URL('../../ext/protocolos/pje/conteudo.js', import.meta.url), 'utf8');
const LIB = fs.readFileSync(new URL('../../ext/lib/pkipath.js', import.meta.url), 'utf8');

// Linhas de código, sem recuo nem linhas vazias.
const normalizar = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');

test('protocolos/pje/conteudo.js tem cópia literal de lib/pkipath.js', () => {
  const lib = LIB.slice(LIB.indexOf('const derLength')).replace('export function pkiPath', 'function pkiPath');
  const m = SRC.match(/confere que são idênticas\.\n([\s\S]*?)\n\s*\/\/ Fim da cópia\./);
  assert.ok(m, 'cópia de pkiPath não encontrada em protocolos/pje/conteudo.js');
  assert.equal(normalizar(m[1]), normalizar(lib));
});

// Mundo isolado falso: document com eventos e uma ponte que anota os pedidos.
function mundo(respostas) {
  const document = new EventTarget();
  const pedidos = [];
  const ctx = vm.createContext({
    document, CustomEvent, atob, btoa, Uint8Array, String, JSON, Promise,
    jamegaoPonte: {
      pedir: async (protocolo, comando, pedido, opcoes) => {
        pedidos.push({ protocolo, comando, pedido, opcoes });
        return respostas.shift();
      },
      // A ponte de verdade reconhece a recusa pelo objeto; aqui, pela marca
      // de teste.
      recusou: (r) => !!r && r.recusaDeTeste === true,
    },
  });
  vm.runInContext(SRC, ctx);
  const pedir = (msg) => new Promise((resolve) => {
    const ouvir = (ev) => {
      const r = JSON.parse(ev.detail);
      if (r.id !== msg.id) return;
      document.removeEventListener('jamegao-pje-resposta', ouvir);
      resolve(r.resposta);
    };
    document.addEventListener('jamegao-pje-resposta', ouvir);
    document.dispatchEvent(new CustomEvent('jamegao-pje-pedido', { detail: JSON.stringify(msg) }));
  });
  return { pedidos, pedir, document };
}

const b64 = (b) => Buffer.from(b).toString('base64');

test('assinar: a cadeia volta em PkiPath, em Base64', async () => {
  const titular = Uint8Array.of(0x30, 1, 0xaa);
  const raiz = Uint8Array.of(0x30, 1, 0xbb);
  const m = mundo([{ success: true, response: { assinaturas: ['QQ=='], cadeia: [b64(titular), b64(raiz)] } }]);
  const r = await m.pedir({ id: 'a', acao: 'assinar', pedido: { tipo: 'login', mensagem: 'oi' } });
  assert.deepEqual(r, { success: true, response: { assinaturas: ['QQ=='], cadeia: b64(pkiPath([titular, raiz])) } });
  assert.equal(m.pedidos[0].protocolo, 'pje');
  assert.equal(m.pedidos[0].comando, 'assinar');
});

test('documentos repetem sem novo; login repete igual', async () => {
  const m = mundo([{ success: false, exception: { message: 'x' } }, { success: false, exception: { message: 'x' } }]);
  await m.pedir({ id: 'd', acao: 'assinar', pedido: { tipo: 'documentos', resumos: ['a'], novo: true } });
  await m.pedir({ id: 'l', acao: 'assinar', pedido: { tipo: 'login', mensagem: 'oi' } });
  const [doc, login] = m.pedidos;
  assert.deepEqual(JSON.parse(JSON.stringify(doc.opcoes.repetir(doc.pedido))), { tipo: 'documentos', resumos: ['a'], novo: false });
  assert.equal(login.opcoes.repetir, undefined);
});

test('só os campos conhecidos de cada pedido seguem para o fundo', async () => {
  const m = mundo([{ success: true, response: { atender: true } }, { success: true, response: null }]);
  assert.deepEqual(await m.pedir({ id: 'e', acao: 'estado', pedido: { sessao: 'cookie' } }), { success: true, response: { atender: true } });
  await m.pedir({ id: 't', acao: 'registrarTarefa', pedido: { tarefa: 'cnj.assinador', codigoSeguranca: 'x' } });
  assert.deepEqual(JSON.parse(JSON.stringify(m.pedidos.map((p) => p.pedido))), [{}, { tarefa: 'cnj.assinador' }]);
});

test('ação desconhecida responde falha sem falar com o fundo', async () => {
  const m = mundo([]);
  const r = await m.pedir({ id: 'x', acao: 'apagarTudo', pedido: {} });
  assert.equal(r.success, false);
  assert.equal(m.pedidos.length, 0);
});

test("desfecho 'programa' e falhas passam como vieram", async () => {
  const m = mundo([{ programa: true }]);
  assert.deepEqual(await m.pedir({ id: 'p', acao: 'assinar', pedido: { tipo: 'login', mensagem: 'oi' } }), { programa: true });
});

test('documentos vindos da página sempre pedem janela nova (novo: true)', async () => {
  const falha = { success: false, exception: { message: 'x', code: 'undefined' } };
  const m = mundo([falha, falha, falha]);
  for (const novo of [false, 'false', undefined]) {
    await m.pedir({ id: 'n' + novo, acao: 'assinar', pedido: { tipo: 'documentos', resumos: ['a'], novo } });
  }
  assert.deepEqual(m.pedidos.map((p) => p.pedido.novo), [true, true, true]);
  // Só a repetição feita pela ponte, depois da confirmação, vai sem.
  assert.equal(m.pedidos[0].opcoes.repetir(m.pedidos[0].pedido).novo, false);
});

test('login não leva novo, mesmo que a página mande', async () => {
  const m = mundo([{ success: false, exception: { message: 'x', code: 'undefined' } }]);
  await m.pedir({ id: 'l', acao: 'assinar', pedido: { tipo: 'login', mensagem: 'oi', novo: true } });
  assert.equal(m.pedidos[0].pedido.novo, undefined);
});

test('falha do fundo chega à página como veio', async () => {
  const falhas = [
    { success: false, exception: { message: 'Operação cancelada.', complete: 'Operação cancelada.', origin: 'extension', code: 'user_cancelled' } },
    { success: false, exception: { message: 'Algoritmo não suportado: X', complete: 'Algoritmo não suportado: X', origin: 'extension', code: 'bad_request' } },
  ];
  const m = mundo(structuredClone(falhas));
  assert.deepEqual(await m.pedir({ id: 'c', acao: 'assinar', pedido: { tipo: 'login', mensagem: 'oi' } }), falhas[0]);
  assert.deepEqual(await m.pedir({ id: 'b', acao: 'assinar', pedido: { tipo: 'documentos', resumos: ['a'] } }), falhas[1]);
});

test('o pedido recebido é confirmado na hora, antes de qualquer resposta', () => {
  const m = mundo([new Promise(() => {})]);
  const recebidos = [];
  m.document.addEventListener('jamegao-pje-recebido', (ev) => recebidos.push(JSON.parse(ev.detail).id));
  m.document.dispatchEvent(new CustomEvent('jamegao-pje-pedido', { detail: JSON.stringify({ id: 'r1', acao: 'estado', pedido: {} }) }));
  assert.deepEqual(recebidos, ['r1']);
  // Pedido ilegível não é confirmado.
  m.document.dispatchEvent(new CustomEvent('jamegao-pje-pedido', { detail: '{' }));
  assert.deepEqual(recebidos, ['r1']);
});

test('recusa do usuário chega à página marcada (recusa: true); as outras falhas, sem marca', async () => {
  const exception = { message: 'Operação cancelada.', complete: 'Operação cancelada.', origin: 'extension', code: 'user_cancelled' };
  const m = mundo([{ success: false, exception, recusaDeTeste: true }, { success: false, exception }]);
  const recusa = await m.pedir({ id: 'r', acao: 'assinar', pedido: { tipo: 'login', mensagem: 'oi' } });
  assert.equal(recusa.recusa, true);
  assert.deepEqual(recusa.exception, exception);
  const outra = await m.pedir({ id: 'o', acao: 'assinar', pedido: { tipo: 'login', mensagem: 'oi' } });
  assert.equal(outra.recusa, undefined);
});
