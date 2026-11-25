// PJe, no mundo isolado: ponte entre o script da página (pagina.js) e o fundo.
//
// Recebe os pedidos da página pelo evento jamegao-pje-pedido, repassa ao fundo
// pela ponte comum (conteudo/ponte.js, carregada antes deste script) e devolve
// a resposta pelo evento jamegao-pje-resposta, os dois com o detalhe em texto
// JSON. Na assinatura, a cadeia (do titular para a raiz) vai à página já em
// PkiPath, em Base64.
(() => {
  'use strict';

  // Cópia literal de lib/pkipath.js (este script não é módulo); o teste de
  // unidade confere que são idênticas.
  const derLength = (n) => {
    if (n < 0x80) return [n];
    const out = [];
    while (n > 0) { out.unshift(n & 0xff); n = Math.floor(n / 256); }
    return [0x80 | out.length, ...out];
  };

  function pkiPath(cadeiaDoTitularParaARaiz) {
    const certs = [...cadeiaDoTitularParaARaiz].reverse();
    const body = certs.reduce((n, c) => n + c.length, 0);
    const head = [0x30, ...derLength(body)];
    const out = new Uint8Array(head.length + body);
    out.set(head);
    let off = head.length;
    for (const c of certs) { out.set(c, off); off += c.length; }
    return out;
  }
  // Fim da cópia.

  const b64ToBytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const bytesToB64 = (b) => {
    let bin = '';
    for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(bin);
  };

  const failure = (message) => ({
    success: false,
    exception: { message, complete: message, origin: 'extension', code: 'undefined' },
  });

  // Só estes campos de cada pedido seguem para o fundo.
  const CAMPOS = {
    estado: [],
    assinar: ['tipo', 'mensagem', 'resumos', 'algoritmo'],
    registrarTarefa: ['tarefa'],
  };
  const filtrar = (acao, pedido) => {
    const out = {};
    if (!pedido || typeof pedido !== 'object') return out;
    for (const k of CAMPOS[acao]) if (pedido[k] !== undefined) out[k] = pedido[k];
    // Todo lote vindo da página abre janela nova, com a quantidade; a página
    // não escolhe. Só a repetição da ponte, depois dela, vai sem (repetir).
    if (acao === 'assinar' && out.tipo === 'documentos') out.novo = true;
    return out;
  };

  // Ao repetir o lote depois da confirmação, a janela já foi mostrada: o
  // pedido repetido usa o crédito dado por ela.
  const repetir = (p) => ({ ...p, novo: false });

  async function atender(acao, pedido) {
    if (!Object.prototype.hasOwnProperty.call(CAMPOS, acao)) return failure('Jamegão: pedido do PJe desconhecido');
    const request = filtrar(acao, pedido);
    const opcoes = acao === 'assinar' && request.tipo === 'documentos' ? { repetir } : {};
    const r = await globalThis.jamegaoPonte.pedir('pje', acao, request, opcoes);
    // A recusa do usuário na janela vai marcada: a página não a registra no
    // console, mas registra as outras falhas.
    if (globalThis.jamegaoPonte.recusou(r)) return { ...r, recusa: true };
    if (acao !== 'assinar' || !r || r.success !== true) return r;
    try {
      const { assinaturas, cadeia } = r.response;
      return { success: true, response: { assinaturas, cadeia: bytesToB64(pkiPath(cadeia.map(b64ToBytes))) } };
    } catch {
      return failure('Jamegão: cadeia de certificados ilegível');
    }
  }

  document.addEventListener('jamegao-pje-pedido', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.detail); } catch { return; }
    if (!msg || typeof msg !== 'object' || typeof msg.id !== 'string') return;
    // Confirmação na hora (dispatchEvent é síncrono): sem ela, a página sabe
    // que o mundo isolado não está aqui (extensão desativada, por exemplo) e
    // deixa a chamada seguir.
    document.dispatchEvent(new CustomEvent('jamegao-pje-recebido', { detail: JSON.stringify({ id: msg.id }) }));
    atender(msg.acao, msg.pedido)
      .catch((e) => failure('Jamegão: ' + String((e && e.message) || e)))
      .then((resposta) => {
        document.dispatchEvent(new CustomEvent('jamegao-pje-resposta', { detail: JSON.stringify({ id: msg.id, resposta }) }));
      });
  });
})();
