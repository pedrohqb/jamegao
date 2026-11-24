// Registro dos scripts do PJe (protocolos/pje/registro.js) com uma api falsa.
// Cobre também o acerto da inicialização do fundo, que no Firefox não tem
// teste de ponta a ponta (não há como encerrar o fundo de lá pelo BiDi).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSAO, ligado, registrar, ligarNoGesto, retirar, acertar } from '../../ext/protocolos/pje/registro.js';

const ESAJ = ['https://esaj.tjsp.jus.br/*', 'https://www2.tjal.jus.br/*'];
const IDS = ['jamegao-pje-pagina', 'jamegao-pje-conteudo'];

// api falsa: permissão concedida ou não, scripts registrados por id. Imita os
// erros do navegador (id repetido, id inexistente, permissão obrigatória).
function apiFalsa({ concedida = false, recusaRemover = false } = {}) {
  const estado = { concedida, scripts: new Map(), chamadas: [] };
  const conferir = (p) => assert.deepEqual(p, PERMISSAO);
  estado.api = {
    runtime: { getManifest: () => ({ content_scripts: [{ matches: [...ESAJ] }] }) },
    permissions: {
      contains: async (p) => { conferir(p); return estado.concedida; },
      remove: async (p) => {
        conferir(p);
        estado.chamadas.push('remove');
        if (recusaRemover) throw new Error('You cannot remove required permissions.');
        estado.concedida = false;
        return true;
      },
    },
    scripting: {
      getRegisteredContentScripts: async ({ ids } = {}) =>
        [...estado.scripts.values()].filter((s) => !ids || ids.includes(s.id)).map((s) => structuredClone(s)),
      registerContentScripts: async (lista) => {
        estado.chamadas.push('register');
        for (const s of lista) if (estado.scripts.has(s.id)) throw new Error(`Duplicate script ID '${s.id}'`);
        for (const s of lista) estado.scripts.set(s.id, structuredClone(s));
      },
      unregisterContentScripts: async ({ ids }) => {
        estado.chamadas.push('unregister');
        for (const id of ids) if (!estado.scripts.has(id)) throw new Error(`Nonexistent script ID '${id}'`);
        for (const id of ids) estado.scripts.delete(id);
      },
    },
  };
  return estado;
}

const ESPERADOS = [
  {
    id: 'jamegao-pje-pagina',
    world: 'MAIN',
    js: ['/protocolos/pje/pagina.js'],
    matches: ['https://*.jus.br/*'],
    excludeMatches: ESAJ,
    runAt: 'document_start',
    allFrames: true,
    persistAcrossSessions: true,
  },
  {
    id: 'jamegao-pje-conteudo',
    js: ['/conteudo/ponte.js', '/protocolos/pje/conteudo.js'],
    matches: ['https://*.jus.br/*'],
    excludeMatches: ESAJ,
    runAt: 'document_start',
    allFrames: true,
    persistAcrossSessions: true,
  },
];

test('PERMISSAO é a de *.jus.br', () => {
  assert.deepEqual(PERMISSAO, { origins: ['https://*.jus.br/*'] });
});

test('registrar: os dois scripts, fora dos endereços do e-SAJ', async () => {
  const e = apiFalsa({ concedida: true });
  await registrar(e.api);
  assert.deepEqual(IDS.map((id) => e.scripts.get(id)), ESPERADOS);
});

test('registrar de novo troca o registro, sem id repetido', async () => {
  const e = apiFalsa({ concedida: true });
  await registrar(e.api);
  await registrar(e.api);
  assert.deepEqual(IDS.map((id) => e.scripts.get(id)), ESPERADOS);
});

test('ligado: só com a permissão e os dois scripts', async () => {
  const e = apiFalsa();
  assert.equal(await ligado(e.api), false);
  await registrar(e.api);
  assert.equal(await ligado(e.api), false, 'sem a permissão');
  e.concedida = true;
  assert.equal(await ligado(e.api), true);
  e.scripts.delete('jamegao-pje-conteudo');
  assert.equal(await ligado(e.api), false, 'só um dos scripts');
});

test('retirar: tira os dois scripts e devolve a permissão', async () => {
  const e = apiFalsa({ concedida: true });
  await registrar(e.api);
  await retirar(e.api);
  assert.equal(e.scripts.size, 0);
  assert.equal(e.concedida, false);
  assert.equal(await ligado(e.api), false);
});

test('retirar: a recusa em devolver a permissão é ignorada', async () => {
  const e = apiFalsa({ concedida: true, recusaRemover: true });
  await registrar(e.api);
  await retirar(e.api);
  assert.equal(e.scripts.size, 0);
  assert.equal(e.concedida, true);
  assert.ok(e.chamadas.includes('remove'));
  assert.equal(await ligado(e.api), false);
});

test('retirar sem nada registrado não falha', async () => {
  const e = apiFalsa();
  await retirar(e.api);
  e.scripts.set('jamegao-pje-pagina', { id: 'jamegao-pje-pagina' });
  await retirar(e.api);
  assert.equal(e.scripts.size, 0);
});

test('acertar: com a permissão e sem o registro, registra', async () => {
  const e = apiFalsa({ concedida: true });
  await acertar(e.api);
  assert.deepEqual(IDS.map((id) => e.scripts.get(id)), ESPERADOS);
  assert.equal(await ligado(e.api), true);
});

test('acertar: com a permissão e só um dos scripts, registra os dois', async () => {
  const e = apiFalsa({ concedida: true });
  e.scripts.set('jamegao-pje-pagina', { id: 'jamegao-pje-pagina' });
  await acertar(e.api);
  assert.deepEqual(IDS.map((id) => e.scripts.get(id)), ESPERADOS);
});

test('acertar: sem a permissão e com o registro, retira', async () => {
  const e = apiFalsa();
  await registrar(e.api);
  await acertar(e.api);
  assert.equal(e.scripts.size, 0);
});

test('acertar: estado certo não muda nada', async () => {
  const ligadoCerto = apiFalsa({ concedida: true });
  await registrar(ligadoCerto.api);
  ligadoCerto.chamadas.length = 0;
  await acertar(ligadoCerto.api);
  assert.deepEqual(ligadoCerto.chamadas, []);

  const desligadoCerto = apiFalsa();
  await acertar(desligadoCerto.api);
  assert.deepEqual(desligadoCerto.chamadas, []);
});

// permissions.request com resposta sob controle do teste.
const comPedido = (e, resposta) => {
  e.pedidos = 0;
  e.api.permissions.request = (p) => {
    assert.deepEqual(p, PERMISSAO);
    e.pedidos++;
    return resposta();
  };
  return e;
};

test('ligarNoGesto: pede a permissão na hora, sem esperar nada antes, e registra', async () => {
  const e = comPedido(apiFalsa(), async () => { e.concedida = true; return true; });
  const r = ligarNoGesto(e.api);
  assert.equal(e.pedidos, 1, 'o pedido precisa sair dentro do gesto, antes de qualquer await');
  assert.equal(await r, true);
  assert.deepEqual(IDS.map((id) => e.scripts.get(id)), ESPERADOS);
  assert.equal(await ligado(e.api), true);
});

test('ligarNoGesto: permissão negada não registra', async () => {
  const e = comPedido(apiFalsa(), async () => false);
  assert.equal(await ligarNoGesto(e.api), false);
  assert.equal(e.scripts.size, 0);
});

test('ligarNoGesto: recusa do navegador (sem gesto) chega a quem chamou', async () => {
  const sem = new Error('permissions.request may only be called from a user input handler');
  const e = comPedido(apiFalsa(), () => Promise.reject(sem));
  await assert.rejects(ligarNoGesto(e.api), sem);
  const lanca = comPedido(apiFalsa(), () => { throw sem; });
  await assert.rejects(ligarNoGesto(lanca.api), sem);
  assert.equal(e.scripts.size + lanca.scripts.size, 0);
});
