// Banco IndexedDB da extensão. Aberto e fechado a cada operação (o service
// worker pode morrer a qualquer momento). Só contextos da própria extensão
// alcançam este banco; os scripts de conteúdo, não.
//   certs: certificados importados (lib/certs.js)
//   kv:    dados persistentes (cofre, tentativas de senha, sites)

const DB_NAME = 'jamegao';
const VERSION = 2;
export const STORES = { certs: 'certs', kv: 'kv' };

const openDb = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.certs)) db.createObjectStore(STORES.certs, { keyPath: 'thumbprint' });
      if (!db.objectStoreNames.contains(STORES.kv)) db.createObjectStore(STORES.kv);
    };
    req.onsuccess = () => {
      const db = req.result;
      // Outra versão quer atualizar o banco: esta conexão sai da frente.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    // Sem onblocked: rejeitar ali deixaria vazar a conexão que abre depois.
    // As conexões abertas cedem sozinhas (onversionchange acima).
  });

export async function run(store, mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
