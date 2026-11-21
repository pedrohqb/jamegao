// Cofre: cifra as chaves privadas em repouso com uma chave derivada da senha
// (PBKDF2-SHA256 -> AES-GCM 256). A chave derivada fica só em storage.session
// enquanto destravado; nada dela vai para storage.local.

export const PBKDF2_ITERATIONS = 600000;
export const IDLE_MS = 1800000; // 30 min sem uso -> trava
export const MIN_PASSWORD = 8;

// Espera (s) antes da próxima tentativa, indexada pelo número de falhas
// consecutivas MENOS UM: a 1ª falha usa [0], a 4ª usa [3] = 5 s, a 8ª em
// diante usa [7] = 300 s. Ou seja, as três primeiras falhas não esperam.
export const BACKOFF_S = [0, 0, 0, 5, 15, 30, 60, 300];

const CHECK_PLAIN = 'jamegao-cofre-v1';
const enc = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;

function b64(bytes) {
  let s = '';
  const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 0x8000) {
    s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function unb64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveRaw(password, salt, iterations) {
  const base = await subtle().importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    256,
  );
  return new Uint8Array(bits);
}

const importAes = (raw) => subtle().importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

async function seal(key, bytes) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const data = await subtle().encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { iv: b64(iv), data: b64(data) };
}

async function open(key, { iv, data }) {
  return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(data)));
}

const MIN_STORED_ITER = 100000;
const MAX_STORED_ITER = 10000000;

export function createVault({ local, session, now, iterations }) {
  // iterations explícito (só testes) relaxa a validação do valor gravado.
  const explicitIter = iterations !== undefined;
  const iter = iterations ?? PBKDF2_ITERATIONS;

  // Serializa create/unlock: por instância (fila de promises) e, quando há
  // Web Locks, também entre páginas e fundo.
  let queue = Promise.resolve();
  function exclusive(fn) {
    const run = queue.then(() =>
      globalThis.navigator?.locks?.request
        ? globalThis.navigator.locks.request('jamegao-cofre', fn)
        : fn(),
    );
    queue = run.catch(() => {});
    return run;
  }

  async function setUnlocked(raw) {
    await session.set('vaultKey', b64(raw));
    await session.set('lastUse', now());
  }

  async function currentKey() {
    if (!(await isUnlocked())) throw new Error('travado');
    const k = await session.get('vaultKey');
    if (!k) throw new Error('travado');
    return importAes(unb64(k));
  }

  async function lock() {
    await session.remove('vaultKey');
    await session.remove('lastUse');
  }

  async function isUnlocked() {
    const k = await session.get('vaultKey');
    if (!k) return false;
    const last = await session.get('lastUse', 0);
    if (now() - last > IDLE_MS) {
      await lock();
      return false;
    }
    return true;
  }

  return {
    lock,
    isUnlocked,

    async exists() {
      return (await local.get('vaultMeta')) !== undefined;
    },

    create(password) {
      return exclusive(async () => {
        if (typeof password !== 'string') throw new Error('senha-curta');
        const pw = password.normalize('NFC');
        if (pw.length < MIN_PASSWORD) throw new Error('senha-curta');
        if ((await local.get('vaultMeta')) !== undefined) throw new Error('ja-existe');
        const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
        const raw = await deriveRaw(pw, salt, iter);
        const check = await seal(await importAes(raw), enc.encode(CHECK_PLAIN));
        await local.set('vaultMeta', { salt: b64(salt), iterations: iter, check });
        await local.remove('lockout');
        await setUnlocked(raw);
      });
    },

    unlock(password) {
      return exclusive(async () => {
        const meta = await local.get('vaultMeta');
        if (!meta) throw new Error('sem-cofre');
        const it = meta.iterations;
        const okIter = Number.isInteger(it) && (explicitIter ? it > 0 : it >= MIN_STORED_ITER && it <= MAX_STORED_ITER);
        if (!okIter) throw new Error('cofre-corrompido');
        const lockout = await local.get('lockout', { failures: 0, until: 0 });
        const remaining = lockout.until - now();
        if (remaining > 0) return { ok: false, waitMs: remaining };
        const pw = String(password ?? '').normalize('NFC');
        const raw = await deriveRaw(pw, unb64(meta.salt), it);
        let good = false;
        try {
          const plain = await open(await importAes(raw), meta.check);
          good = new TextDecoder().decode(plain) === CHECK_PLAIN;
        } catch (e) {
          if (e?.name !== 'OperationError') throw e;
        }
        if (good) {
          await local.remove('lockout');
          await setUnlocked(raw);
          return { ok: true };
        }
        const failures = lockout.failures + 1;
        const waitMs = BACKOFF_S[Math.min(failures - 1, BACKOFF_S.length - 1)] * 1000;
        await local.set('lockout', { failures, until: now() + waitMs });
        return { ok: false, waitMs };
      });
    },

    async touch() {
      if (await isUnlocked()) await session.set('lastUse', now());
    },

    async encrypt(bytes) {
      return seal(await currentKey(), bytes);
    },

    async decrypt(box) {
      return open(await currentKey(), box);
    },

    async destroy() {
      await lock();
      await local.remove('vaultMeta');
      await local.remove('lockout');
    },
  };
}
