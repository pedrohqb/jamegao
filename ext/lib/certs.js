// Certificados importados, no IndexedDB da extensão (lib/db.js).
// Entrada: {thumbprint, model, certB64, chainB64 (titular primeiro), key: {iv, data}, importedAt}; a chave
// privada só existe cifrada (nunca CryptoKey nem PKCS#8 em claro).
import { STORES, run } from './db.js';

const S = STORES.certs;

export function createCerts() {
  return {
    list: () => run(S, 'readonly', (s) => s.getAll()),
    get: (thumbprint) => run(S, 'readonly', (s) => s.get(thumbprint)),
    put: (entry) => run(S, 'readwrite', (s) => s.put(entry)).then(() => undefined),
    remove: (thumbprint) => run(S, 'readwrite', (s) => s.delete(thumbprint)).then(() => undefined),
    count: () => run(S, 'readonly', (s) => s.count()),
  };
}
