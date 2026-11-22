// Armazenamento chave-valor.
//   local:   persiste, no IndexedDB da extensão (lib/db.js). Não usa
//            storage.local porque os scripts de conteúdo o alcançam, e
//            nele ficariam o sal e a conferência do cofre, o contador de
//            tentativas de senha e as decisões por site.
//   session: storage.session, que some ao fechar o navegador e, por padrão,
//            só os contextos da extensão leem.
import { STORES, run } from './db.js';

// Chaves que a v0.1 de antes gravava em storage.local; migram uma vez.
const LEGADAS = ['vaultMeta', 'lockout', 'sites'];
const MIGRADO = '__migrado-de-storage-local';

function wrap(area) {
  return {
    async get(key, fallback) {
      const r = await area.get(key);
      return key in r ? r[key] : fallback;
    },
    async set(key, value) {
      await area.set({ [key]: value });
    },
    async remove(key) {
      await area.remove(key);
    },
  };
}

const S = STORES.kv;
const idbGet = (key) => run(S, 'readonly', (s) => s.get(key));
const idbSet = (key, value) => run(S, 'readwrite', (s) => s.put(value, key)).then(() => undefined);
const idbRemove = (key) => run(S, 'readwrite', (s) => s.delete(key)).then(() => undefined);

const comTrava = (nome, fn) =>
  globalThis.navigator?.locks?.request ? globalThis.navigator.locks.request(nome, fn) : fn();

// Uma única vez: copia o que houver em storage.local e apaga de lá. Depois
// da marca, storage.local nunca mais é lido (nada que um script de conteúdo
// grave ali entra no cofre).
async function migrar(legado) {
  if (!legado) return;
  await comTrava('jamegao-migracao', async () => {
    if ((await idbGet(MIGRADO)) === true) return;
    for (const k of LEGADAS) {
      const v = await legado.get(k);
      if (v !== undefined && (await idbGet(k)) === undefined) await idbSet(k, v);
    }
    for (const k of LEGADAS) await legado.remove(k);
    await idbSet(MIGRADO, true);
  });
}

export function idbKv({ legado } = {}) {
  let pronto = null;
  const antes = () => {
    pronto ??= migrar(legado).catch((e) => { pronto = null; throw e; });
    return pronto;
  };
  return {
    async get(key, fallback) {
      await antes();
      const v = await idbGet(key);
      return v === undefined ? fallback : v;
    },
    async set(key, value) {
      await antes();
      // Mesma semântica do chrome.storage: guarda uma cópia em JSON.
      await idbSet(key, JSON.parse(JSON.stringify(value)));
    },
    async remove(key) {
      await antes();
      await idbRemove(key);
    },
  };
}

export function browserKv() {
  const api = globalThis.browser ?? globalThis.chrome;
  try {
    Promise.resolve(
      api.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }),
    ).catch(() => {});
  } catch {
    // ignorado
  }
  return { local: idbKv({ legado: wrap(api.storage.local) }), session: wrap(api.storage.session) };
}
