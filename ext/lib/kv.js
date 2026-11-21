// Armazenamento chave-valor sobre chrome.storage / browser.storage.
// local: persiste; session: some ao fechar o navegador.

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

export function browserKv() {
  const api = globalThis.browser ?? globalThis.chrome;
  try {
    // Só contextos confiáveis (não os content scripts) leem o storage.
    Promise.resolve(
      api.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }),
    ).catch(() => {});
  } catch {
    // ignorado
  }
  return { local: wrap(api.storage.local), session: wrap(api.storage.session) };
}
