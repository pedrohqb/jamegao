// Pedidos de confirmação ao usuário. Todo o estado fica em storage.session
// (chave "prompts"), porque o service worker pode morrer a qualquer momento.
// Este módulo não abre janela: quem abre é o fundo, que depois grava o
// windowId aqui (setWindow) para ligar o fechamento da janela ao pedido.
import { CODES, fail, ok } from './protocol.js';

export const PROMPT_TIMEOUT_MS = 120000;

// Serializa as leituras-e-gravações de "prompts" (neste worker e, quando há
// Web Locks, em qualquer contexto da extensão).
let queue = Promise.resolve();
function exclusive(fn) {
  const run = queue.then(() =>
    globalThis.navigator?.locks?.request
      ? globalThis.navigator.locks.request('jamegao-prompts', fn)
      : fn(),
  );
  queue = run.catch(() => {});
  return run;
}

const CANCELLED = () => fail(CODES.cancelled, 'Operação cancelada.');

export function createPrompts({ session, vault, certs, sites, credits, notify, closeWindow, now = () => Date.now() }) {
  const readAll = () => session.get('prompts', {});
  const writeAll = (all) => session.set('prompts', all);

  async function finish(rec, outcome) {
    const all = await readAll();
    delete all[rec.id];
    await writeAll(all);
    try { await notify(rec.tabId, rec.frameId, { type: 'prompt-resolved', id: rec.id, outcome }); } catch { /* aba fechada */ }
    if (rec.windowId !== undefined && closeWindow) {
      try { await closeWindow(rec.windowId); } catch { /* janela já fechada */ }
    }
  }

  async function refuse(rec) {
    await finish(rec, CANCELLED());
  }

  return {
    open: (needs, { origin, tabId, frameId, command }) => exclusive(async () => {
      const all = await readAll();
      if (Object.values(all).some((p) => p.tabId === tabId)) return { busy: true };
      // Titular e validade vêm do certificado guardado, nunca da página.
      let subject = null;
      let validityEnd = null;
      if (needs.sign) {
        const entry = await certs.get(needs.sign.thumbprint);
        subject = entry?.model?.subjectName ?? null;
        validityEnd = entry?.model?.validityEnd ?? null;
      }
      const id = globalThis.crypto.randomUUID();
      all[id] = { id, needs, origin, tabId, frameId, command, subject, validityEnd, createdAt: now() };
      await writeAll(all);
      return { id };
    }),

    setWindow: (id, windowId) => exclusive(async () => {
      const all = await readAll();
      if (!all[id]) return false;
      all[id].windowId = windowId;
      await writeAll(all);
      return true;
    }),

    async describe(id) {
      const rec = (await readAll())[id];
      if (!rec) return null;
      return { origin: rec.origin, needs: rec.needs, subject: rec.subject, validityEnd: rec.validityEnd };
    },

    answer: (id, { allow, password } = {}) => exclusive(async () => {
      const rec = (await readAll())[id];
      if (!rec) return { done: true };
      if (allow !== true) {
        await refuse(rec);
        return { done: true };
      }
      if (rec.needs.unlock && !(await vault.isUnlocked())) {
        const r = await vault.unlock(typeof password === 'string' ? password : '');
        if (!r.ok) return { error: 'senha', waitMs: r.waitMs };
      }
      if (rec.needs.site) await sites.setAllowed(rec.origin, true);
      if (rec.needs.sign) await credits.grant(rec.origin, rec.needs.sign.thumbprint, rec.needs.sign.count);
      await finish(rec, rec.command === 'preauthorizeSignatures' ? ok(null) : 'retry');
      return { done: true };
    }),

    // Equivale a recusar. Se tabId vier, só vale para o pedido daquela aba.
    abandon: (id, { tabId } = {}) => exclusive(async () => {
      const rec = (await readAll())[id];
      if (!rec || (tabId !== undefined && rec.tabId !== tabId)) return;
      await refuse(rec);
    }),

    closedWindow: (windowId) => exclusive(async () => {
      const rec = Object.values(await readAll()).find((p) => p.windowId === windowId);
      if (rec) await refuse({ ...rec, windowId: undefined });
    }),
  };
}
