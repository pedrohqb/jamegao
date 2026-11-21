// Núcleo: atende os comandos do protocolo Web PKI / WebSigner.
// Nesta etapa só os comandos de inicialização; o resto devolve
// "comando não suportado".
import { COMPAT_VERSION, CODES, PkiError, fail, ok } from './lib/protocol.js';

const api = globalThis.browser ?? globalThis.chrome;

const platformOs = async () => {
  try {
    const info = await api.runtime.getPlatformInfo();
    return { win: 'Windows', mac: 'Darwin', linux: 'Linux' }[info.os] || 'Linux';
  } catch {
    return 'Linux';
  }
};

const COMMANDS = {
  async getExtensionVersion() {
    return COMPAT_VERSION;
  },

  async getVersion() {
    return COMPAT_VERSION;
  },

  async initialize() {
    const os = await platformOs();
    return {
      isReady: true,
      status: 0,
      message: null,
      nativeInfo: { os, installedVersion: COMPAT_VERSION, essentialFeaturesOnly: false },
      platformInfo: { os },
    };
  },

  async pollNative() {
    return true;
  },
};

// Só vale a origem que o próprio navegador informa para o quadro que pediu.
// Quadros de origem opaca ("null") nunca são aceitos.
export const senderOrigin = (sender) => {
  const origin = sender && sender.origin;
  if (typeof origin !== 'string' || !/^https?:\/\//.test(origin)) return null;
  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
};

const dispatch = async (msg, sender) => {
  const handler = Object.prototype.hasOwnProperty.call(COMMANDS, msg.command) ? COMMANDS[msg.command] : null;
  try {
    if (!handler) {
      throw new PkiError(`O Jamegão não atende o comando "${msg.command}"`, CODES.unsupported);
    }
    return ok(await handler(msg.request, senderOrigin(sender)));
  } catch (err) {
    if (err instanceof PkiError) return fail(err.code, err.message);
    return fail(CODES.internal, 'Erro interno do Jamegão: ' + (err && err.message));
  }
};

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'webpki-request') return false;
  // Só páginas (content script) fazem pedidos.
  if (!sender || !sender.tab) return false;
  dispatch(msg, sender).then(sendResponse);
  return true;
});
