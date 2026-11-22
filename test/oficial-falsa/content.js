// Imita a extensão oficial: marca a página (sem data-jamegao) e responde aos
// pedidos da marca Softplan com um único certificado, "TOKEN FALSO".
(() => {
  const PREFIX = 'br.com.softplan.WebPKI';
  const ID = 'bbafmabaelnnkondpfpjmdklbmfnbmol';
  const meta = document.createElement('meta');
  meta.id = ID;
  (document.head || document.documentElement).appendChild(meta);

  const cert = {
    thumbprint: 'FALSO-THUMBPRINT-0001',
    subjectName: 'TOKEN FALSO',
    issuerName: 'AC FALSA',
    isRemote: false,
    canRemove: false,
    email: null,
    keyUsage: 0,
    pkiBrazil: null,
    pkiItaly: null,
    validityStart: '2020-01-01T00:00:00.000Z',
    validityEnd: '2099-01-01T00:00:00.000Z',
  };
  const answers = {
    getExtensionVersion: () => '2.99.0',
    getVersion: () => '2.99.0',
    initialize: () => ({
      isReady: true, status: 0, message: null,
      nativeInfo: { os: 'Linux', installedVersion: '2.99.0', essentialFeaturesOnly: false },
      platformInfo: { os: 'Linux' },
    }),
    pollNative: () => true,
    listCertificates: () => [cert],
  };

  const answer = (msg) => {
    if (!msg || typeof msg.requestId !== 'string') return null;
    const fn = Object.prototype.hasOwnProperty.call(answers, msg.command) ? answers[msg.command] : null;
    return fn
      ? { requestId: msg.requestId, success: true, response: fn() }
      : { requestId: msg.requestId, success: false, exception: { message: 'não atendido', complete: 'não atendido', origin: 'extension', code: 'command_not_supported' } };
  };

  // Chromium: CustomEvent no document. Assíncrono, como a extensão real: o SDK
  // só liga o callback depois do envio.
  document.addEventListener(PREFIX + '.RequestEvent', (event) => {
    const detail = answer(event.detail);
    if (!detail) return;
    // No Firefox, o detail precisa ser clonado para o contexto da página.
    const visible = typeof cloneInto === 'function' ? cloneInto(detail, window) : detail;
    setTimeout(() => document.dispatchEvent(new CustomEvent(PREFIX + '.ResponseEvent', { detail: visible })), 20);
  });

  // Firefox: o SDK usa window.postMessage em vez de CustomEvent.
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.port !== PREFIX + '.RequestEvent') return;
    const message = answer(event.data.message);
    if (!message) return;
    setTimeout(() => window.postMessage({ port: PREFIX + '.ResponseEvent', message }, window.location.origin), 20);
  });
})();
