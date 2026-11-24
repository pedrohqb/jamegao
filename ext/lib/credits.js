// Créditos de assinatura: o usuário autoriza N assinaturas por origem,
// certificado e motivo; valem por CREDIT_TTL_MS e ficam só em storage.session.
// O motivo separa o que a janela mostrou (no PJe, "Entrar" e "Assinar N
// documentos"): o crédito de um não serve ao outro. O e-SAJ não usa motivo ('').

export const CREDIT_TTL_MS = 300000;
export const MAX_SIGNATURES = 500;

import { createExclusive } from './exclusive.js';

const keyOf = (origin, thumbprint, motivo) => `${origin}\n${thumbprint}\n${motivo}`;

export function createCredits({ session, now }) {
  const readAll = () => session.get('credits', {});
  const exclusive = createExclusive('jamegao-creditos');

  // Lê descartando vencidos; regrava só se algo foi descartado.
  async function live() {
    const all = await readAll();
    let dirty = false;
    for (const [k, c] of Object.entries(all)) {
      if (now() > c.expires || c.remaining <= 0) {
        delete all[k];
        dirty = true;
      }
    }
    if (dirty) await session.set('credits', all);
    return all;
  }

  return {
    grant(origin, thumbprint, count, motivo = '') {
      if (!Number.isInteger(count) || count < 1 || count > MAX_SIGNATURES) {
        return Promise.reject(new RangeError(`count deve ser inteiro de 1 a ${MAX_SIGNATURES}`));
      }
      return exclusive(async () => {
        const all = await live();
        all[keyOf(origin, thumbprint, motivo)] = { origin, thumbprint, motivo, remaining: count, expires: now() + CREDIT_TTL_MS };
        await session.set('credits', all);
      });
    },
    consume(origin, thumbprint, motivo = '') {
      return exclusive(async () => {
        const all = await live();
        const k = keyOf(origin, thumbprint, motivo);
        const c = all[k];
        if (!c) return false;
        c.remaining -= 1;
        if (c.remaining <= 0) delete all[k];
        await session.set('credits', all);
        return true;
      });
    },
    has(origin, thumbprint, motivo = '') {
      return exclusive(async () => keyOf(origin, thumbprint, motivo) in (await live()));
    },
    clear: () => exclusive(() => session.remove('credits')),
  };
}
