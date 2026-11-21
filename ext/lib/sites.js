// Sites: decisão do usuário por origem (local.sites) e origens em que o
// certificado oficial já apareceu nesta sessão (session.officialSeen).

export function createSites({ local, session }) {
  const readAll = () => local.get('sites', {});

  async function patch(origin, change) {
    const all = await readAll();
    all[origin] = { ...all[origin], ...change };
    await local.set('sites', all);
  }

  async function get(origin) {
    const e = (await readAll())[origin];
    return { allowed: e?.allowed, preferOfficial: e?.preferOfficial === true };
  }

  return {
    get,
    setAllowed: (origin, allowed) => patch(origin, { allowed: allowed === true }),
    setPreferOfficial: (origin, v) => patch(origin, { preferOfficial: v === true }),
    async remove(origin) {
      const all = await readAll();
      delete all[origin];
      await local.set('sites', all);
    },
    async list() {
      const all = await readAll();
      return Object.entries(all).map(([origin, e]) => ({
        origin,
        allowed: e.allowed,
        preferOfficial: e.preferOfficial === true,
      }));
    },
    async noteOfficial(origin) {
      const seen = await session.get('officialSeen', []);
      if (!seen.includes(origin)) await session.set('officialSeen', [...seen, origin]);
    },
    async officialSeen(origin) {
      return (await session.get('officialSeen', [])).includes(origin);
    },
    async shouldAnnounce(origin, certCount) {
      if (certCount < 1) return false;
      const s = await get(origin);
      if (s.allowed === false) return false;
      if (s.preferOfficial) return false;
      return true;
    },
  };
}
