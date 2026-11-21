// Seção exclusiva para leitura-modificação-gravação em storage: fila por
// instância (mesmo contexto) mais navigator.locks quando existir (service
// worker e páginas da extensão são contextos distintos que dividem o storage).

export function createExclusive(lockName) {
  let tail = Promise.resolve();
  const locks = () => globalThis.navigator?.locks;
  return function run(fn) {
    const p = tail.then(() => {
      const l = locks();
      return l ? l.request(lockName, fn) : fn();
    });
    tail = p.catch(() => {});
    return p;
  };
}
