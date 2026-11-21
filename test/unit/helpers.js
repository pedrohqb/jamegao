// Auxiliares de teste: armazenamento em memória (imita chrome.storage, que
// guarda JSON) e relógio falso.

function area() {
  const m = new Map();
  return {
    async get(key, fallback) {
      return m.has(key) ? structuredClone(m.get(key)) : fallback;
    },
    async set(key, value) {
      m.set(key, structuredClone(value));
    },
    async remove(key) {
      m.delete(key);
    },
  };
}

export function memoryKv() {
  return { local: area(), session: area() };
}

export function fakeClock(startMs = 0) {
  let t = startMs;
  return {
    now: () => t,
    advance(ms) {
      t += ms;
    },
  };
}
