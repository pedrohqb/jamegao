// Armazenamento chave-valor.
//   local:   persiste, no IndexedDB da extensão (lib/db.js). Não usa
//            storage.local porque os scripts de conteúdo o alcançam, e
//            nele ficariam o sal e a conferência do cofre, o contador de
//            tentativas de senha e as decisões por site.
//   session: storage.session, que some ao fechar o navegador e, por padrão,
//            só os contextos da extensão leem.
import { STORES, run } from './db.js';

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

// Antes do primeiro envio às lojas, uma versão de desenvolvimento gravava
// em storage.local; não há migração: storage.local nunca é lido.
export function idbKv() {
  return {
    async get(key, fallback) {
      const v = await idbGet(key);
      return v === undefined ? fallback : v;
    },
    async set(key, value) {
      // Mesma semântica do chrome.storage: guarda uma cópia em JSON.
      await idbSet(key, JSON.parse(JSON.stringify(value)));
    },
    remove: (key) => idbRemove(key),
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
  return { local: idbKv(), session: wrap(api.storage.session) };
}
