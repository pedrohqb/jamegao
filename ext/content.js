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
  if (!announce()) {
    document.addEventListener('DOMContentLoaded', announce, { once: true });
  }

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

  const handle = async (brand, channel, message) => {
    let result;
    try {
      result = await api.runtime.sendMessage({
        type: 'webpki-request',
        brand: brand.prefix,
        command: String(message.command),
        request: message.request ?? null,
      });
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
    queue = queue.then(() => handle(brand, channel, message)).catch(() => {});
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
