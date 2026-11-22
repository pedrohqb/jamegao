// Fundo: só liga eventos. A decisão está em lib/commands.js e os pedidos de
// confirmação em lib/prompts.js. Nada fica em memória entre eventos: o
// service worker pode morrer a qualquer momento, então os módulos são
// recriados a cada mensagem e o estado vive em storage/IndexedDB.
import { CODES, fail } from './lib/protocol.js';
import { browserKv } from './lib/kv.js';
import { createVault } from './lib/vault.js';
import { createCerts } from './lib/certs.js';
import { createSites } from './lib/sites.js';
import { createCredits } from './lib/credits.js';
import { createCommands } from './lib/commands.js';
import { createPrompts } from './lib/prompts.js';

const api = globalThis.browser ?? globalThis.chrome;

const platformOs = async () => {
  try {
    const info = await api.runtime.getPlatformInfo();
    return { win: 'Windows', mac: 'Darwin', linux: 'Linux' }[info.os] || 'Linux';
  } catch {
    return 'Linux';
  }
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

const modules = () => {
  const kv = browserKv();
  const now = () => Date.now();
  const vault = createVault({ local: kv.local, session: kv.session, now });
  const certs = createCerts();
  const sites = createSites(kv);
  const credits = createCredits({ session: kv.session, now });
  const prompts = createPrompts({
    session: kv.session, vault, certs, sites, credits, now,
    notify: (tabId, frameId, msg) => api.tabs.sendMessage(tabId, msg, { frameId }),
    closeWindow: (windowId) => api.windows.remove(windowId),
  });
  return { vault, certs, sites, credits, prompts };
};

async function atenderPedido(msg, sender) {
  const m = modules();
  const commands = createCommands({ ...m, platformOs: await platformOs() });
  const result = await commands.handle({ command: msg.command, request: msg.request }, senderOrigin(sender));
  if (!result.needs) return result;
  const opened = await m.prompts.open(result.needs, {
    origin: senderOrigin(sender), tabId: sender.tab.id, frameId: sender.frameId ?? 0, command: msg.command,
  });
  if (opened.busy) return fail(CODES.cancelled, 'Há uma confirmação pendente nesta aba.');
  try {
    const win = await api.windows.create({
      url: api.runtime.getURL('pages/confirm.html') + '?id=' + encodeURIComponent(opened.id),
      type: 'popup', width: 440, height: 520,
    });
    await m.prompts.setWindow(opened.id, win.id);
  } catch {
    await m.prompts.abandon(opened.id);
    return fail(CODES.cancelled, 'Não foi possível abrir a janela de confirmação.');
  }
  return { pending: true, promptId: opened.id };
}

const fromConfirmPage = (sender) =>
  typeof sender?.url === 'string' && sender.url.startsWith(api.runtime.getURL('pages/confirm.html'));

async function promptMessage(msg, sender) {
  const { prompts } = modules();
  if (msg.type === 'prompt-abandon') {
    // A janela de confirmação ou o próprio quadro que fez o pedido.
    if (fromConfirmPage(sender)) return prompts.abandon(String(msg.id));
    if (sender?.tab) return prompts.abandon(String(msg.id), { tabId: sender.tab.id });
    return undefined;
  }
  if (!fromConfirmPage(sender)) return null; // describe/answer: só a janela de confirmação
  if (msg.type === 'prompt-describe') return prompts.describe(String(msg.id));
  return prompts.answer(String(msg.id), { allow: msg.allow === true, password: msg.password });
}

// Anúncio e convivência com a extensão oficial: valem só a origem informada
// pelo navegador para o quadro (sender.origin), nunca dados da mensagem.
async function anunciar(msg, sender) {
  const origin = senderOrigin(sender);
  if (origin === null) return { announce: false };
  const { certs, sites } = modules();
  // Nova pergunta antes de cada pedido: site bloqueado continua respondendo
  // (para recusar); só quem passou a preferir a oficial deve se calar (sem certificado
  // responde lista vazia, como antes).
  if (msg.recheck === true) {
    return { announce: !(await sites.get(origin)).preferOfficial };
  }
  return { announce: await sites.shouldAnnounce(origin, await certs.count()) };
}

async function oficialVisto(sender) {
  const origin = senderOrigin(sender);
  if (origin !== null) await modules().sites.noteOfficial(origin);
}

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return false;
  let task;
  if (msg.type === 'jamegao-pedido') {
    if (!sender || !sender.tab) return false; // só páginas (content script) fazem pedidos
    task = atenderPedido(msg, sender).catch(() => fail(CODES.internal, 'Erro interno do Jamegão.'));
  } else if (msg.type === 'announce?' || msg.type === 'official-seen') {
    if (!sender || !sender.tab) return false;
    task = (msg.type === 'announce?' ? anunciar(msg, sender) : oficialVisto(sender))
      .catch(() => (msg.type === 'announce?' ? { announce: false } : undefined));
  } else if (['prompt-describe', 'prompt-answer', 'prompt-abandon'].includes(msg.type)) {
    task = promptMessage(msg, sender).catch(() => null);
  } else {
    return false;
  }
  task.then(sendResponse);
  return true;
});

api.tabs.onRemoved.addListener((tabId) => {
  modules().prompts.tabClosed(tabId).catch(() => {});
});

api.windows.onRemoved.addListener((windowId) => {
  modules().prompts.closedWindow(windowId).catch(() => {});
});

// Primeira execução: abre a página de importação do certificado.
api.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') api.tabs.create({ url: api.runtime.getURL('pages/import.html') });
});

// Travamento automático: a cada minuto confere o cofre (vault.isUnlocked trava
// após 30 min sem uso) e, se travou, descarta os créditos de assinatura.
const ALARM_TRAVAMENTO = 'travamento';
const agendarTravamento = () => api.alarms.create(ALARM_TRAVAMENTO, { periodInMinutes: 1 });
api.runtime.onInstalled.addListener(agendarTravamento);
api.runtime.onStartup.addListener(agendarTravamento);
api.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_TRAVAMENTO) return;
  const { vault, credits } = modules();
  vault.isUnlocked()
    .then((unlocked) => (unlocked ? undefined : credits.clear()))
    .catch(() => {});
});
