// Créditos de assinatura: o usuário autoriza N assinaturas por origem e
// certificado; valem por CREDIT_TTL_MS e ficam só em storage.session.

export const CREDIT_TTL_MS = 300000;
export const MAX_SIGNATURES = 500;

const keyOf = (origin, thumbprint) => `${origin}\n${thumbprint}`;

export function createCredits({ session, now }) {
  const readAll = () => session.get('credits', {});

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
    async grant(origin, thumbprint, count) {
      if (!Number.isInteger(count) || count < 1 || count > MAX_SIGNATURES) {
        throw new RangeError(`count deve ser inteiro de 1 a ${MAX_SIGNATURES}`);
      }
      const all = await live();
      all[keyOf(origin, thumbprint)] = { origin, thumbprint, remaining: count, expires: now() + CREDIT_TTL_MS };
      await session.set('credits', all);
    },
    async consume(origin, thumbprint) {
      const all = await live();
      const k = keyOf(origin, thumbprint);
      const c = all[k];
      if (!c) return false;
      c.remaining -= 1;
      if (c.remaining <= 0) delete all[k];
      await session.set('credits', all);
      return true;
    },
    async has(origin, thumbprint) {
      return keyOf(origin, thumbprint) in (await live());
    },
    clear: () => session.remove('credits'),
  };
}
