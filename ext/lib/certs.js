// Certificados importados, no IndexedDB da extensão. O banco é aberto e
// fechado a cada operação (o service worker pode morrer a qualquer momento).
// Entrada: {thumbprint, model, certB64, key: {iv, data}, importedAt}; a chave
// privada só existe cifrada (nunca CryptoKey nem PKCS#8 em claro).

const DB_NAME = 'jamegao';
const STORE = 'certs';

const openDb = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'thumbprint' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function run(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function createCerts() {
  return {
    list: () => run('readonly', (s) => s.getAll()),
    get: (thumbprint) => run('readonly', (s) => s.get(thumbprint)),
    put: (entry) => run('readwrite', (s) => s.put(entry)).then(() => undefined),
    remove: (thumbprint) => run('readwrite', (s) => s.delete(thumbprint)).then(() => undefined),
    count: () => run('readonly', (s) => s.count()),
  };
}
