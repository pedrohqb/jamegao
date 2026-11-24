// Ponte comum dos scripts de conteúdo com o fundo da extensão.
//
// Script não modular: define, uma única vez por mundo isolado, o objeto
// globalThis.jamegaoPonte, usado pelo script de cada protocolo carregado
// depois dele na mesma entrada de content_scripts. Cuida de enviar o pedido ao
// fundo, de esperar a janela de confirmação (até 120 s) e de atender os
// pedidos do quadro em fila, um por vez.
(() => {
  'use strict';
  if (globalThis.jamegaoPonte) return;

  const api = globalThis.browser ?? globalThis.chrome;
  const PROMPT_TIMEOUT_MS = 120000;

  const failure = (message) => ({
    success: false,
    exception: { message, complete: message, origin: 'extension', code: 'undefined' },
  });
  const cancelled = (message) => ({
    success: false,
    exception: { message, complete: message, origin: 'extension', code: 'user_cancelled' },
  });
  const valid = (r) => !!r && (typeof r.success === 'boolean' || r.programa === true);

  // Respostas de confirmação: id -> função que recebe o desfecho. Se o
  // desfecho chegar antes de alguém esperar por ele, fica guardado em "early".
  const waiting = new Map();
  const early = new Map();
  const live = new Set(); // confirmações pendentes deste quadro

  api.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== 'prompt-resolved' || typeof msg.id !== 'string') return false;
    const fn = waiting.get(msg.id);
    if (fn) fn(msg.outcome);
    else early.set(msg.id, msg.outcome);
    return false;
  });

  const abandon = (id) => {
    live.delete(id);
    Promise.resolve(api.runtime.sendMessage({ type: 'prompt-abandon', id })).catch(() => {});
  };
  const abandonarPendentes = () => { for (const id of [...live]) abandon(id); };
  // Se a página sai, a confirmação pendente deixa de ter dono.
  window.addEventListener('pagehide', abandonarPendentes);

  const waitPrompt = (id) =>
    new Promise((resolve) => {
      live.add(id);
      let timer = null;
      const done = (outcome) => {
        clearTimeout(timer);
        waiting.delete(id);
        early.delete(id);
        live.delete(id);
        resolve(outcome);
      };
      if (early.has(id)) return done(early.get(id));
      waiting.set(id, done);
      timer = setTimeout(() => {
        abandon(id);
        done(cancelled('Operação cancelada: a confirmação não foi respondida em 120 s.'));
      }, PROMPT_TIMEOUT_MS);
    });

  const ask = async (protocolo, command, request) => {
    const result = await api.runtime.sendMessage({
      type: 'jamegao-pedido',
      protocolo,
      command: String(command),
      request: request ?? null,
    });
    if (result && result.pending === true && typeof result.promptId === 'string') return result;
    if (!valid(result)) return failure('Jamegão: resposta inválida da extensão');
    return result;
  };

  const run = async (protocolo, command, request) => {
    let result;
    try {
      result = await ask(protocolo, command, request);
      if (result.pending) {
        let outcome = await waitPrompt(result.promptId);
        if (outcome === 'programa') {
          outcome = { programa: true };
        } else if (outcome === 'retry') {
          // O usuário aceitou: repete o mesmo pedido, uma única vez.
          result = await ask(protocolo, command, request);
          if (result.pending) {
            abandon(result.promptId);
            outcome = cancelled('Operação cancelada: a confirmação não foi concluída.');
          } else {
            outcome = result;
          }
        }
        result = outcome;
      }
      if (!valid(result)) result = failure('Jamegão: resposta inválida da extensão');
    } catch (err) {
      result = failure('Jamegão: falha ao falar com a extensão (' + (err && err.message) + ')');
    }
    return result;
  };

  // Fila única por quadro: um pedido só começa quando o anterior terminou.
  let queue = Promise.resolve();
  const pedir = (protocolo, comando, pedido) => {
    const result = queue.then(() => run(protocolo, comando, pedido));
    queue = result.catch(() => {});
    return result;
  };

  globalThis.jamegaoPonte = { pedir, abandonarPendentes };
})();
