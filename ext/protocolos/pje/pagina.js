// PJe, no mundo da própria página (world MAIN).
//
// A página do PJe chama o assinador local carregando uma "imagem" de
// http://localhost:8800/pjeOffice/... (ou 127.0.0.1). A resposta é lida pelas
// dimensões da imagem: 1×1 deu certo, 2×1 deu erro, falha de carga =
// assinador indisponível.
//
// Este script segura essas imagens antes que saiam do navegador e pergunta à
// extensão (por conteudo.js, no mundo isolado) se o Jamegão atende este site.
// Se não atende (site bloqueado, nenhum certificado), aplica o endereço
// original e a chamada segue para o localhost como se o Jamegão não existisse.
// Se atende, pede a assinatura à extensão e faz, a partir da própria página,
// o mesmo envio que o assinador local faria ao servidor do PJe, só para a
// mesma origem da página. Qualquer outra imagem passa intacta.
(() => {
  'use strict';
  if (Object.prototype.hasOwnProperty.call(window, '__jamegaoPje')) return;
  Object.defineProperty(window, '__jamegaoPje', { value: true });

  const TAG = '[Jamegão]';
  const GIF_OK = 'data:image/gif;base64,R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';
  const GIF_ERRO = 'data:image/gif;base64,R0lGODlhAgABAPAAAP///wAAACH5BAAAAAAALAAAAAACAAEAAAICRAEAOw==';
  const VERSAO = '2.5.16';
  const SUCESSO = new Set([200, 201, 202, 204, 302, 304]);

  // O que este script usa, guardado antes de qualquer código da página.
  const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  const setAttr = Element.prototype.setAttribute;
  const fetchOriginal = window.fetch.bind(window);
  const stringify = JSON.stringify;
  const parse = JSON.parse;
  const temProprio = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // O PJe carrega o Prototype.js, que põe Array.prototype.toJSON e faz o
  // JSON.stringify transformar listas em texto. Converte sem ele.
  const paraJson = (v) => {
    const tinha = temProprio(Array.prototype, 'toJSON');
    const salvo = tinha ? Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON') : null;
    if (tinha) delete Array.prototype.toJSON;
    try {
      return stringify(v);
    } finally {
      if (tinha) Object.defineProperty(Array.prototype, 'toJSON', salvo);
    }
  };

  const ehAssinadorLocal = (v) => {
    try {
      const u = new URL(String(v), location.href);
      return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
        && u.port === '8800' && u.pathname.startsWith('/pjeOffice/');
    } catch {
      return false;
    }
  };

  // Cada atribuição de src a uma imagem invalida a resposta que ainda estava
  // a caminho para a anterior (a página pode reaproveitar a mesma imagem).
  const vez = new WeakMap();
  const novaVez = (img) => {
    const n = (vez.get(img) ?? 0) + 1;
    vez.set(img, n);
    return n;
  };
  const aplicar = (img, n, endereco) => {
    if (vez.get(img) === n) desc.set.call(img, endereco);
  };

  // Pedido à extensão por evento, com o detalhe em texto JSON (o texto
  // atravessa os mundos sem cópia de objetos). O mundo isolado confirma o
  // recebimento durante o próprio dispatchEvent, que é síncrono; sem a
  // confirmação, ele não está aqui (extensão desativada, por exemplo), e a
  // resposta é SEM_PONTE: a chamada segue para o localhost.
  const SEM_PONTE = Symbol('sem ponte');
  const mesmoId = (ev, id) => {
    try { return parse(ev.detail)?.id === id; } catch { return false; }
  };
  let seq = 0;
  const pedir = (acao, pedido) =>
    new Promise((resolve) => {
      const id = 'pje-' + (++seq) + '-' + Math.random().toString(36).slice(2);
      let recebido = false;
      const confirmar = (ev) => { if (mesmoId(ev, id)) recebido = true; };
      const ouvir = (ev) => {
        let r;
        try { r = parse(ev.detail); } catch { return; }
        if (!r || r.id !== id) return;
        document.removeEventListener('jamegao-pje-resposta', ouvir);
        resolve(r.resposta);
      };
      document.addEventListener('jamegao-pje-recebido', confirmar);
      document.addEventListener('jamegao-pje-resposta', ouvir);
      document.dispatchEvent(new CustomEvent('jamegao-pje-pedido', { detail: paraJson({ id, acao, pedido }) }));
      document.removeEventListener('jamegao-pje-recebido', confirmar);
      if (!recebido) {
        document.removeEventListener('jamegao-pje-resposta', ouvir);
        resolve(SEM_PONTE);
      }
    });

  // Destino em texto não vazio; sem ele, `servidor + caminho` daria um
  // endereço da própria origem que o PJe não pediu.
  const temDestino = (caminho, nome) => {
    if (typeof caminho === 'string' && caminho) return true;
    console.warn(TAG, `Pedido do PJe sem ${nome}.`);
    return false;
  };

  // O envio leva a assinatura: não segue redirecionamento (que poderia
  // reenviá-la a outra origem). O redirecionamento chega como resposta
  // "opaqueredirect".
  const enviar = (alvo, headers, body) => fetchOriginal(alvo, {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'manual',
    headers,
    body,
  });

  // Destino do envio: só a mesma origem da página.
  const destino = (servidor, caminho) => {
    const alvo = String(servidor) + String(caminho);
    let url = null;
    try { url = new URL(alvo); } catch { /* inválido */ }
    if (url && url.origin === location.origin) return url.href;
    console.warn(TAG, 'Envio do PJe para outra origem recusado:', url ? url.origin : '(endereço inválido)');
    return null;
  };

  // Resultado de uma tarefa: true (1×1), false (2×1) ou ORIGINAL (a chamada
  // segue para o localhost).
  const ORIGINAL = Symbol('original');
  // Cancelamento pelo usuário não é erro: não vai ao console.
  const desfecho = (r, depois) => {
    if (r === SEM_PONTE || (r && r.programa === true)) return ORIGINAL;
    if (!r || r.success !== true) {
      const e = r && r.exception;
      if (!e || e.code !== 'user_cancelled') console.warn(TAG, 'Assinatura não feita:', (e && e.message) || 'falha');
      return false;
    }
    return depois(r.response);
  };

  // Uma assinatura por item pedido, nem mais nem menos.
  const assinaturasDe = (resposta, n) => {
    const a = resposta && resposta.assinaturas;
    if (Array.isArray(a) && a.length === n) return a;
    console.warn(TAG, 'Resposta da extensão com número de assinaturas inesperado.');
    return null;
  };

  async function login(r, tarefa) {
    if (!temDestino(tarefa.enviarPara, 'destino do login')) return false;
    const alvo = destino(r.servidor, tarefa.enviarPara);
    if (!alvo) return false;
    const res = await pedir('assinar', { tipo: 'login', mensagem: tarefa.mensagem, algoritmo: tarefa.algoritmoAssinatura });
    return desfecho(res, async (resposta) => {
      const assinaturas = assinaturasDe(resposta, 1);
      if (!assinaturas) return false;
      const resp = await enviar(
        alvo,
        { 'Content-Type': 'application/json', Accept: 'application/json', versao: VERSAO },
        paraJson({ uuid: tarefa.token, mensagem: tarefa.mensagem, assinatura: assinaturas[0], certChain: resposta.cadeia }),
      );
      // O 302 do PJe, sem segui-lo.
      if (resp.type === 'opaqueredirect') return true;
      if (!SUCESSO.has(resp.status)) console.warn(TAG, 'O PJe recusou o login: código', resp.status);
      return SUCESSO.has(resp.status);
    });
  }

  // Um documento: o servidor responde texto, "Sucesso" ou "Erro: ...".
  async function enviarDocumento(alvo, campos) {
    try {
      const resp = await enviar(
        alvo,
        { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', versao: VERSAO },
        new URLSearchParams(campos).toString(),
      );
      if (resp.type === 'opaqueredirect') {
        console.warn(TAG, `O PJe redirecionou o envio do documento ${campos.id}; não foi seguido.`);
        return false;
      }
      const texto = (await resp.text()).trim();
      if (resp.ok && texto.startsWith('Sucesso')) return true;
      console.warn(TAG, `O PJe recusou o documento ${campos.id}:`, resp.status, texto.slice(0, 200));
    } catch (e) {
      console.warn(TAG, `Falha ao enviar o documento ${campos.id}:`, String((e && e.message) || e));
    }
    return false;
  }

  async function documentos(r, tarefa) {
    if (!temDestino(tarefa.uploadUrl, 'destino dos documentos')) return false;
    const alvo = destino(r.servidor, tarefa.uploadUrl);
    if (!alvo) return false;
    let arquivos = tarefa.arquivos;
    if (typeof arquivos === 'string') { try { arquivos = parse(arquivos); } catch { arquivos = []; } }
    if (!Array.isArray(arquivos) || !arquivos.length) {
      console.warn(TAG, 'Pedido de assinatura do PJe sem documentos.');
      return false;
    }
    arquivos = arquivos.map((a) => (a && typeof a === 'object' ? a : {}));
    const res = await pedir('assinar', {
      tipo: 'documentos',
      resumos: arquivos.map((a) => (a.hash === undefined || a.hash === null ? '' : String(a.hash))),
      algoritmo: tarefa.algoritmoAssinatura,
    });
    return desfecho(res, async (resposta) => {
      const assinaturas = assinaturasDe(resposta, arquivos.length);
      if (!assinaturas) return false;
      const { cadeia } = resposta;
      // Um por vez, na ordem; falha num não impede os seguintes.
      let todos = true;
      for (let i = 0; i < arquivos.length; i++) {
        const a = arquivos[i];
        const campos = { assinatura: assinaturas[i], cadeiaCertificado: cadeia, id: String(a.id ?? ''), codIni: String(a.codIni ?? ''), hash: String(a.hash) };
        if (a.idTarefa !== undefined && a.idTarefa !== null) campos.idTarefa = String(a.idTarefa);
        if (!(await enviarDocumento(alvo, campos))) todos = false;
      }
      return todos;
    });
  }

  const TAREFAS = { 'sso.autenticador': login, 'cnj.assinadorHash': documentos };

  // Tarefa que o Jamegão não faz: anota para o popup e deixa seguir.
  const naoFaz = (nome) => {
    console.warn(TAG, 'O PJe pediu uma tarefa que o Jamegão ainda não faz:', nome || '(sem nome)');
    if (nome) pedir('registrarTarefa', { tarefa: nome.slice(0, 200) });
    return ORIGINAL;
  };

  async function requisicao(u) {
    let r;
    try { r = parse(u.searchParams.get('r')); } catch { r = null; }
    if (!r || typeof r !== 'object') {
      console.warn(TAG, 'Pedido do PJe ilegível.');
      return false;
    }
    const nome = typeof r.tarefaId === 'string' ? r.tarefaId : '';
    if (!temProprio(TAREFAS, nome)) return naoFaz(nome);
    let tarefa;
    try { tarefa = typeof r.tarefa === 'string' ? parse(r.tarefa) : r.tarefa; } catch { tarefa = null; }
    if (!tarefa || typeof tarefa !== 'object') {
      console.warn(TAG, 'Tarefa do PJe ilegível.');
      return false;
    }
    if (tarefa.modoTeste === true || tarefa.modoTeste === 'true') return naoFaz(nome + ' (modoTeste)');
    return TAREFAS[nome](r, tarefa);
  }

  async function atender(img, endereco) {
    const n = novaVez(img);
    let resultado;
    try {
      const estado = await pedir('estado', {});
      if (!(estado && estado.success === true && estado.response && estado.response.atender === true)) {
        return aplicar(img, n, endereco);
      }
      const u = new URL(String(endereco), location.href);
      const caminho = u.pathname.replace(/\/+$/, '') + '/';
      if (caminho === '/pjeOffice/' || caminho === '/pjeOffice/versao/') resultado = true;
      else if (caminho === '/pjeOffice/requisicao/') resultado = await requisicao(u);
      else resultado = ORIGINAL; // chamada que o Jamegão não conhece
    } catch (e) {
      console.warn(TAG, 'Falha ao atender o PJe:', String((e && e.message) || e));
      resultado = false;
    }
    if (resultado === ORIGINAL) aplicar(img, n, endereco);
    else aplicar(img, n, resultado ? GIF_OK : GIF_ERRO);
  }

  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    enumerable: desc.enumerable,
    get: desc.get,
    set(v) {
      if (ehAssinadorLocal(v)) { atender(this, v); return; }
      novaVez(this);
      desc.set.call(this, v);
    },
  });

  Element.prototype.setAttribute = function (name, value) {
    if (this instanceof HTMLImageElement && String(name).toLowerCase() === 'src') {
      if (ehAssinadorLocal(value)) { atender(this, value); return undefined; }
      novaVez(this);
    }
    return setAttr.call(this, name, value);
  };
})();
