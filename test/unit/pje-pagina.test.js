// protocolos/pje/pagina.js (mundo da página) num DOM falso mínimo: imagens,
// eventos no document, fetch e console anotados, e um mundo isolado falso que
// responde como protocolos/pje/conteudo.js. O caminho completo, com o
// navegador de verdade, está em test/e2e/pje.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../../ext/protocolos/pje/pagina.js', import.meta.url), 'utf8');
const ORIGEM = 'https://pje.tjma.jus.br';
const OK = 'R0lGODlhAQAB';
const ERRO = 'R0lGODlhAgAB';

// `mundoIsolado`: false = não há (nenhuma confirmação, nenhuma resposta);
// senão, respostas por ação (função do pedido). `respostas` responde aos
// envios ao servidor, na ordem.
function pagina({ mundoIsolado = {}, respostas = [] } = {}) {
  const document = new EventTarget();
  const envios = [];
  const avisos = [];
  const pedidos = [];

  class Element {
    setAttribute(name, value) { this.atributos = { ...this.atributos, [name]: String(value) }; }
  }
  class HTMLImageElement extends Element {}
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    enumerable: true,
    get() { return this.aplicado ?? ''; },
    set(v) { this.aplicado = String(v); this.quandoAplicar?.(this.aplicado); },
  });

  const fetch = async (url, opcoes) => {
    envios.push({ url, ...opcoes });
    const r = respostas.shift() ?? { status: 200, texto: 'Sucesso' };
    if (r.redirect) return { type: 'opaqueredirect', status: 0, ok: false, text: async () => '' };
    return { type: 'basic', status: r.status, ok: r.status >= 200 && r.status < 300, text: async () => r.texto ?? '' };
  };

  if (mundoIsolado) {
    const responder = {
      estado: () => ({ success: true, response: { atender: true } }),
      registrarTarefa: () => ({ success: true, response: null }),
      ...mundoIsolado,
    };
    document.addEventListener('jamegao-pje-pedido', (ev) => {
      const msg = JSON.parse(ev.detail);
      pedidos.push(msg);
      document.dispatchEvent(new CustomEvent('jamegao-pje-recebido', { detail: JSON.stringify({ id: msg.id }) }));
      Promise.resolve(responder[msg.acao](msg.pedido)).then((resposta) => {
        document.dispatchEvent(new CustomEvent('jamegao-pje-resposta', { detail: JSON.stringify({ id: msg.id, resposta }) }));
      });
    });
  }

  const ctx = vm.createContext({
    document,
    location: new URL(ORIGEM + '/pje/Processo/update.seam'),
    fetch,
    console: { warn: (...a) => avisos.push(a.join(' ')), log: () => {}, error: () => {} },
    CustomEvent, EventTarget, URL, URLSearchParams, Element, HTMLImageElement,
  });
  ctx.window = ctx;
  vm.runInContext(SRC, ctx);

  // Como a página do PJe: põe o endereço na imagem e espera o que for
  // aplicado de fato (a imagem de 1×1, a de 2×1 ou o endereço original).
  const chamar = (url) => new Promise((resolve) => {
    const img = new HTMLImageElement();
    img.quandoAplicar = (v) => resolve(v.includes(OK) ? 'ok' : v.includes(ERRO) ? 'erro' : v);
    img.src = url;
  });
  return { chamar, envios, avisos, pedidos };
}

const requisicao = (tarefaId, tarefa, servidor = ORIGEM + '/pje') =>
  'http://127.0.0.1:8800/pjeOffice/requisicao/?r=' + encodeURIComponent(JSON.stringify({
    aplicacao: 'PJe', servidor, sessao: 'JSESSIONID=x', codigoSeguranca: 'x', tarefaId, tarefa: JSON.stringify(tarefa),
  }));
const LOGIN = { enviarPara: '/pjeoffice-rest', mensagem: 'Bem-vindo', token: 'tok-1' };
const ARQUIVOS = [
  { id: '1', codIni: '11', hash: 'e8a8d6d38608c1aceb7d1b01ea238168' },
  { id: '2', codIni: '22', hash: '094d4af227008ccf5a5abf046feaa414' },
];
const LOTE = { algoritmoAssinatura: 'ASN1MD5withRSA', modoTeste: 'false', uploadUrl: '/upload.seam', arquivos: ARQUIVOS };
const assinou = (n) => () => ({ success: true, response: { assinaturas: Array.from({ length: n }, (_, i) => 'QS' + i + '=='), cadeia: 'MAA=' } });
const pedidosDe = (p, acao) => p.pedidos.filter((x) => x.acao === acao);

test('sem o mundo isolado (nenhuma confirmação), a chamada segue para o localhost na hora', async () => {
  const p = pagina({ mundoIsolado: false });
  const ping = 'http://localhost:8800/pjeOffice/?&u=1';
  assert.equal(await p.chamar(ping), ping);
  const url = requisicao('sso.autenticador', LOGIN);
  assert.equal(await p.chamar(url), url);
  assert.equal(p.envios.length, 0);
});

test('com o mundo isolado, a consulta responde 1×1', async () => {
  const p = pagina();
  assert.equal(await p.chamar('http://localhost:8800/pjeOffice/?&u=1'), 'ok');
});

test('login e documentos sem destino em texto: 2×1, sem pedir assinatura nem enviar', async () => {
  for (const enviarPara of [undefined, '', null, 7, ['/x'], { a: 1 }]) {
    const p = pagina({ mundoIsolado: { assinar: assinou(1) } });
    assert.equal(await p.chamar(requisicao('sso.autenticador', { ...LOGIN, enviarPara })), 'erro', String(enviarPara));
    assert.equal(pedidosDe(p, 'assinar').length, 0);
    assert.equal(p.envios.length, 0);
  }
  for (const uploadUrl of [undefined, '', null, 7, ['/x']]) {
    const p = pagina({ mundoIsolado: { assinar: assinou(2) } });
    assert.equal(await p.chamar(requisicao('cnj.assinadorHash', { ...LOTE, uploadUrl })), 'erro', String(uploadUrl));
    assert.equal(pedidosDe(p, 'assinar').length, 0);
    assert.equal(p.envios.length, 0);
  }
});

test('envios não seguem redirecionamento (redirect: manual)', async () => {
  const p = pagina({ mundoIsolado: { assinar: (q) => assinou(q.tipo === 'login' ? 1 : 2)() } });
  assert.equal(await p.chamar(requisicao('sso.autenticador', LOGIN)), 'ok');
  assert.equal(await p.chamar(requisicao('cnj.assinadorHash', LOTE)), 'ok');
  assert.equal(p.envios.length, 3);
  for (const e of p.envios) {
    assert.equal(e.redirect, 'manual');
    assert.equal(e.credentials, 'same-origin');
  }
});

test('login redirecionado (opaqueredirect) é o 302 de sucesso', async () => {
  const p = pagina({ mundoIsolado: { assinar: assinou(1) }, respostas: [{ redirect: true }] });
  assert.equal(await p.chamar(requisicao('sso.autenticador', LOGIN)), 'ok');
  assert.equal(p.envios.length, 1);
});

test('documento redirecionado é falha dele; os seguintes vão', async () => {
  const p = pagina({ mundoIsolado: { assinar: assinou(2) }, respostas: [{ redirect: true }, { status: 200, texto: 'Sucesso' }] });
  assert.equal(await p.chamar(requisicao('cnj.assinadorHash', LOTE)), 'erro');
  assert.equal(p.envios.length, 2);
  assert.ok(p.avisos.some((a) => a.startsWith('[Jamegão]') && a.includes('documento 1')), p.avisos.join('\n'));
});

test('número de assinaturas diferente do de documentos: 2×1, nada enviado', async () => {
  for (const n of [0, 1, 3]) {
    const p = pagina({ mundoIsolado: { assinar: assinou(n) } });
    assert.equal(await p.chamar(requisicao('cnj.assinadorHash', LOTE)), 'erro', `${n} assinaturas`);
    assert.equal(p.envios.length, 0);
  }
  const semLista = pagina({ mundoIsolado: { assinar: () => ({ success: true, response: { assinaturas: 'QQ==', cadeia: 'MAA=' } }) } });
  assert.equal(await semLista.chamar(requisicao('cnj.assinadorHash', LOTE)), 'erro');
  assert.equal(semLista.envios.length, 0);
});

test('login com outra quantidade de assinaturas: 2×1, nada enviado', async () => {
  for (const n of [0, 2]) {
    const p = pagina({ mundoIsolado: { assinar: assinou(n) } });
    assert.equal(await p.chamar(requisicao('sso.autenticador', LOGIN)), 'erro');
    assert.equal(p.envios.length, 0);
  }
});

const falha = (code, message) => () => ({ success: false, exception: { message, complete: message, origin: 'extension', code } });

test('recusa do usuário na janela não vai ao console; outra falha vai, com [Jamegão]', async () => {
  const recusa = () => ({ ...falha('user_cancelled', 'Operação cancelada.')(), recusa: true });
  const cancelou = pagina({ mundoIsolado: { assinar: recusa } });
  assert.equal(await cancelou.chamar(requisicao('sso.autenticador', LOGIN)), 'erro');
  assert.deepEqual(cancelou.avisos, []);

  // user_cancelled sem a marca não é recusa do usuário: pausa, outra
  // confirmação pendente, prazo de 120 s, site bloqueado...
  for (const msg of [
    'Há uma confirmação pendente nesta aba.',
    'Pedido recusado há pouco. Tente de novo em alguns segundos.',
    'Operação cancelada: a confirmação não foi respondida em 120 s.',
    'Este site está bloqueado no Jamegão.',
  ]) {
    const p = pagina({ mundoIsolado: { assinar: falha('user_cancelled', msg) } });
    assert.equal(await p.chamar(requisicao('cnj.assinadorHash', LOTE)), 'erro');
    assert.equal(p.avisos.length, 1, msg);
    assert.ok(p.avisos[0].startsWith('[Jamegão] ') && p.avisos[0].includes(msg), p.avisos[0]);
    assert.equal(p.envios.length, 0);
  }

  const falhou = pagina({ mundoIsolado: { assinar: falha('bad_request', 'Algoritmo não suportado: X') } });
  assert.equal(await falhou.chamar(requisicao('sso.autenticador', LOGIN)), 'erro');
  assert.equal(falhou.avisos.length, 1);
  assert.match(falhou.avisos[0], /^\[Jamegão\] .*Algoritmo não suportado: X/);
});
