// Pedidos de confirmação ao usuário. Todo o estado fica em storage.session
// (chave "prompts"), porque o service worker pode morrer a qualquer momento.
// Este módulo não abre janela: quem abre é o fundo, que depois grava o
// windowId aqui (setWindow) para ligar o fechamento da janela ao pedido. Sem
// janelas (Firefox do Android), a confirmação abre numa aba (setTab).
import { CODES, fail, ok } from './protocol.js';
import { createExclusive } from './exclusive.js';

export const PROMPT_TIMEOUT_MS = 120000;
// Depois que o usuário recusa (ou deixa o prazo vencer), o mesmo site fica
// este tempo sem poder abrir outra janela. A tela de login do e-SAJ repete
// a listagem na hora quando ela falha, até três vezes; sem a pausa, a janela
// reabriria a cada recusa ou a cada 120 s.
export const REFUSAL_PAUSE_MS = 15000;

const exclusive = createExclusive('jamegao-prompts');

const CANCELLED = () => fail(CODES.cancelled, 'Operação cancelada.');

export function createPrompts({ session, vault, certs, sites, credits, notify, closeWindow, closeTab, now = () => Date.now() }) {
  const readAll = () => session.get('prompts', {});
  const writeAll = (all) => session.set('prompts', all);

  // A aba é avisada mesmo que a gravação falhe: não pode ficar esperando.
  async function finish(rec, outcome) {
    try {
      const all = await readAll();
      delete all[rec.id];
      await writeAll(all);
    } catch { /* o registro vence sozinho */ }
    try { await notify(rec.tabId, rec.frameId, { type: 'prompt-resolved', id: rec.id, outcome }); } catch { /* aba fechada */ }
    if (rec.windowId !== undefined && closeWindow) {
      try { await closeWindow(rec.windowId); } catch { /* janela já fechada */ }
    }
    if (rec.confirmTabId !== undefined && closeTab) {
      try { await closeTab(rec.confirmTabId, rec.tabId); } catch { /* aba já fechada */ }
    }
  }

  // pause: o usuário recusou, fechou a janela ou deixou o prazo vencer.
  // A aba que saiu ou foi fechada não pausa o site. O aviso (needs.aviso) não
  // pede decisão nenhuma: fechá-lo nunca pausa.
  async function refuse(rec, { pause = false } = {}) {
    if (pause && !rec.needs?.aviso) {
      try {
        const pausas = await session.get('promptRefusals', {});
        pausas[rec.origin] = now();
        await session.set('promptRefusals', pausas);
      } catch { /* sem pausa; segue recusando */ }
    }
    await finish(rec, CANCELLED());
  }

  const expired = (rec) => now() - rec.createdAt > PROMPT_TIMEOUT_MS;
  // A aba desiste aos 120 s contados de um pouco depois da criação; a folga
  // de 2 s cobre essa diferença.
  const timedOut = (rec) => now() - rec.createdAt >= PROMPT_TIMEOUT_MS - 2000;

  return {
    open: (needs, { origin, tabId, frameId, command }) => exclusive(async () => {
      // Registros órfãos (worker morto, aba descartada) não podem prender a aba.
      for (const p of Object.values(await readAll())) {
        if (now() - p.createdAt > PROMPT_TIMEOUT_MS + 10000) await refuse(p);
      }
      const all = await readAll();
      if (Object.values(all).some((p) => p.tabId === tabId)) return { busy: true };
      const recusado = (await session.get('promptRefusals', {}))[origin];
      if (typeof recusado === 'number' && now() - recusado < REFUSAL_PAUSE_MS) return { paused: true };
      // Titular e validade vêm do certificado guardado, nunca da página.
      const descrever = async (thumbprint) => {
        const entry = await certs.get(thumbprint);
        return { thumbprint, subject: entry?.model?.subjectName ?? null, validityEnd: entry?.model?.validityEnd ?? null };
      };
      let subject = null;
      let validityEnd = null;
      const principal = needs.sign?.thumbprint ?? needs.escolher?.marcado;
      if (principal !== undefined) ({ subject, validityEnd } = await descrever(principal));
      const rec = { id: globalThis.crypto.randomUUID(), needs, origin, tabId, frameId, command, subject, validityEnd, createdAt: now() };
      if (needs.escolher) {
        rec.opcoes = [];
        for (const t of needs.escolher.opcoes) rec.opcoes.push(await descrever(t));
      }
      const { id } = rec;
      all[id] = rec;
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

    setTab: (id, confirmTabId) => exclusive(async () => {
      const all = await readAll();
      if (!all[id]) return false;
      all[id].confirmTabId = confirmTabId;
      await writeAll(all);
      return true;
    }),

    describe: (id) => exclusive(async () => {
      const rec = (await readAll())[id];
      if (!rec) return null;
      // A aba já desistiu (120 s): a janela não pode mais ser aprovada.
      if (expired(rec)) {
        await refuse(rec, { pause: true });
        return null;
      }
      const d = { origin: rec.origin, needs: rec.needs, subject: rec.subject, validityEnd: rec.validityEnd };
      if (rec.opcoes) d.opcoes = rec.opcoes;
      return d;
    }),

    // block: o usuário pediu "Bloquear este site" (recusa e bloqueia).
    // programa: "Usar o programa instalado" (só quando needs.programa): a
    // página deixa a chamada seguir, sem pausa, crédito nem decisão do site.
    // thumbprint: o certificado escolhido, quando há needs.escolher.
    answer: (id, { allow, password, block, thumbprint, programa } = {}) => exclusive(async () => {
      const rec = (await readAll())[id];
      if (!rec) return { done: true };
      if (expired(rec)) {
        await refuse(rec, { pause: true });
        return { done: true, expired: true };
      }
      // O aviso só se fecha: qualquer resposta é recusa (sem pausa).
      if (rec.needs.aviso) {
        await refuse(rec);
        return { done: true };
      }
      if (programa === true && rec.needs.programa === true) {
        await finish(rec, 'programa');
        return { done: true };
      }
      if (block === true) {
        let gravou = true;
        try {
          await sites.setAllowed(rec.origin, false);
          await credits.clear();
        } catch {
          gravou = false; // a recusa vale mesmo assim; o usuário é avisado
        }
        await refuse(rec, { pause: true });
        return gravou ? { done: true } : { done: true, error: 'bloqueio' };
      }
      if (allow !== true || programa === true) {
        await refuse(rec, { pause: true });
        return { done: true };
      }
      const interno = async () => {
        await finish(rec, fail(CODES.internal, 'Não foi possível registrar a autorização. Tente de novo.'));
        return { done: true, error: 'interno' };
      };
      let escolhido = rec.needs.sign?.thumbprint;
      if (rec.needs.escolher) {
        // Só vale um certificado oferecido na janela.
        if (typeof thumbprint !== 'string' || !rec.needs.escolher.opcoes.includes(thumbprint)) return interno();
        escolhido = thumbprint;
      }
      try {
        if (rec.needs.unlock && !(await vault.isUnlocked())) {
          const r = await vault.unlock(typeof password === 'string' ? password : '');
          if (!r.ok) return { error: 'senha', waitMs: r.waitMs };
        }
        if (rec.needs.sign) await credits.grant(rec.origin, escolhido, rec.needs.sign.count);
        if (rec.needs.escolher) await sites.setCertificado(rec.origin, escolhido);
        if (rec.needs.site) await sites.setAllowed(rec.origin, true);
      } catch {
        // Falhou no meio: nenhum crédito sobra, e a aba recebe a falha agora,
        // em vez de esperar 120 s.
        if (rec.needs.sign) await credits.clear().catch(() => {});
        return interno();
      }
      await finish(rec, rec.command === 'preauthorizeSignatures' ? ok(null) : 'retry');
      return { done: true };
    }),

    // Equivale a recusar. Se tabId vier, só vale para o pedido daquela aba.
    // Sem tabId, vem da janela de confirmação (o usuário a fechou). Com tabId,
    // vem da aba: ou o prazo venceu (pausa) ou a página saiu (sem pausa).
    abandon: (id, { tabId } = {}) => exclusive(async () => {
      const rec = (await readAll())[id];
      if (!rec || (tabId !== undefined && rec.tabId !== tabId)) return;
      await refuse(rec, { pause: tabId === undefined || timedOut(rec) });
    }),

    // A aba fechada pode ser a da confirmação (o usuário desistiu: recusa e
    // pausa) ou a do site (recusa sem pausa, e a confirmação fecha junto).
    tabClosed: (tabId) => exclusive(async () => {
      for (const p of Object.values(await readAll())) {
        if (p.confirmTabId === tabId) await refuse({ ...p, confirmTabId: undefined }, { pause: true });
        else if (p.tabId === tabId) await refuse(p);
      }
    }),

    closedWindow: (windowId) => exclusive(async () => {
      const rec = Object.values(await readAll()).find((p) => p.windowId === windowId);
      if (rec) await refuse({ ...rec, windowId: undefined }, { pause: true });
    }),
  };
}
