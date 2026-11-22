// Ponte entre a página e a extensão.
//
// O SDK da página (lacuna-web-pki.js ou o derivado softplan-websigner.js):
//   1. considera a extensão instalada se existir um elemento cujo id é o ID
//      da extensão oficial;
//   2. envia pedidos por CustomEvent no document (Chromium) ou por
//      window.postMessage (Firefox), num "porto" com o prefixo da marca;
//   3. espera a resposta no porto ResponseEvent da mesma marca.
//
// Este script anuncia as marcas e repassa cada pedido ao background, que é
// quem tem acesso aos certificados. Os pedidos de cada quadro são atendidos
// em fila, um por vez.
(() => {
  'use strict';

  const api = globalThis.browser ?? globalThis.chrome;

  // Cópia literal de BRANDS em lib/protocol.js (este script não é módulo);
  // o teste de unidade confere que são idênticas.
  const BRANDS = [
    {
      prefix: 'br.com.softplan.WebPKI',
      ids: ['bbafmabaelnnkondpfpjmdklbmfnbmol', 'websigner_softplan_com_br'],
    },
    {
      prefix: 'com.lacunasoftware.WebPKI',
      ids: [
        'dcngeagmmhegagicpcmpinaoklddcgon',
        'nedeegdmhlnmboboahchfpkmdnnemapd',
        'webpki_lacunasoftware_com',
        'webpki_beta_lacunasoftware_com',
      ],
    },
  ];

  const announce = () => {
    const root = document.head || document.documentElement;
    if (!root) return false;
    for (const brand of BRANDS) {
      for (const id of brand.ids) {
        if (document.getElementById(id)) continue;
        const meta = document.createElement('meta');
        meta.id = id;
        meta.setAttribute('data-jamegao', '');
        root.appendChild(meta);
      }
    }
    return true;
  };

  // O fundo decide, pela origem que o navegador informa, se este quadro
  // deve se anunciar (precisa de certificado importado e de o site não estar
  // bloqueado nem preferir a extensão oficial). Sem resposta, não anuncia.
  const announced = (async () => {
    try {
      const r = await api.runtime.sendMessage({ type: 'announce?' });
      return !!r && r.announce === true;
    } catch {
      return false;
    }
  })();
  announced.then((yes) => {
    if (yes && !announce()) document.addEventListener('DOMContentLoaded', announce, { once: true });
  });

  // Elemento de marca que não é nosso: a extensão oficial está presente.
  let officialReported = false;
  const noteOfficial = () => {
    if (officialReported) return;
    for (const brand of BRANDS) {
      for (const id of brand.ids) {
        for (const el of document.querySelectorAll(`[id="${id}"]`)) {
          if (el.hasAttribute('data-jamegao')) continue;
          officialReported = true;
          Promise.resolve(api.runtime.sendMessage({ type: 'official-seen' })).catch(() => {});
          return;
        }
      }
    }
  };
  noteOfficial();
  document.addEventListener('DOMContentLoaded', noteOfficial, { once: true });

  const failure = (message) => ({
    success: false,
    exception: { message, complete: message, origin: 'extension', code: 'undefined' },
  });

  const reply = (brand, channel, message) => {
    const port = brand.prefix + '.ResponseEvent';
    try {
      if (channel === 'message') {
        window.postMessage({ port, message }, window.location.origin);
      } else {
        // No Firefox, objetos do content script só ficam legíveis para a
        // página se forem clonados para o contexto dela.
        const detail = typeof cloneInto === 'function' ? cloneInto(message, window) : message;
        document.dispatchEvent(new CustomEvent(port, { detail }));
      }
    } catch { /* quadro de origem opaca: não há como responder */ }
  };

  const PROMPT_TIMEOUT_MS = 120000;

  const cancelled = (message) => ({
    success: false,
    exception: { message, complete: message, origin: 'extension', code: 'user_cancelled' },
  });

  // Respostas de confirmação: id -> função que recebe o desfecho. Se o
  // desfecho chegar antes de alguém esperar por ele, fica guardado em "early".
  const waiting = new Map();
  const early = new Map();
  const live = new Set();
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
  // Se a página sai, a confirmação pendente deixa de ter dono.
  window.addEventListener('pagehide', () => { for (const id of [...live]) abandon(id); });

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

  const ask = async (brand, message) => {
    const result = await api.runtime.sendMessage({
      type: 'jamegao-pedido',
      brand: brand.prefix,
      command: String(message.command),
      request: message.request ?? null,
    });
    if (result && result.pending === true && typeof result.promptId === 'string') return result;
    if (!result || typeof result.success !== 'boolean') {
      return failure('Jamegão: resposta inválida da extensão');
    }
    return result;
  };

  const handle = async (brand, channel, message) => {
    let result;
    try {
      result = await ask(brand, message);
      if (result.pending) {
        let outcome = await waitPrompt(result.promptId);
        if (outcome === 'retry') {
          // O usuário aceitou: repete o mesmo pedido, uma única vez.
          result = await ask(brand, message);
          if (result.pending) {
            abandon(result.promptId);
            outcome = cancelled('Operação cancelada: a confirmação não foi concluída.');
          } else {
            outcome = result;
          }
        }
        result = outcome;
      }
      if (!result || typeof result.success !== 'boolean') {
        result = failure('Jamegão: resposta inválida da extensão');
      }
    } catch (err) {
      result = failure('Jamegão: falha ao falar com a extensão (' + (err && err.message) + ')');
    }
    reply(brand, channel, { requestId: message.requestId, ...result });
  };

  // Fila única por quadro: um pedido só começa quando o anterior terminou.
  let queue = Promise.resolve();
  const enqueue = (brand, channel, message) => {
    if (!message || typeof message !== 'object' || typeof message.requestId !== 'string') return;
    queue = queue
      .then(async () => { if (await announced) await handle(brand, channel, message); })
      .catch(() => {});
  };

  for (const brand of BRANDS) {
    const port = brand.prefix + '.RequestEvent';
    document.addEventListener(port, (event) => {
      enqueue(brand, 'event', event.detail);
    });
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (data && data.port === port) enqueue(brand, 'message', data.message);
    });
  }
})();
