// Registro dos scripts do PJe (protocolos/pje/registro.js) com uma api falsa.
// Cobre também o acerto da inicialização do fundo, que no Firefox não tem
// teste de ponta a ponta (não há como encerrar o fundo de lá pelo BiDi).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSAO, ligado, registrar, ligarNoGesto, retirar, acertar } from '../../ext/protocolos/pje/registro.js';
import { memoryKv } from './helpers.js';

const ESAJ = ['https://esaj.tjsp.jus.br/*', 'https://www2.tjal.jus.br/*'];
const IDS = ['jamegao-pje-pagina', 'jamegao-pje-conteudo'];

// api falsa: permissão concedida ou não, scripts registrados por id. Imita os
// erros do navegador (id repetido, id inexistente, permissão obrigatória).
// `antes.register` / `antes.unregister` rodam no meio da chamada, como outro
// contexto da extensão mexendo no registro ao mesmo tempo. `kv` é o
// armazenamento da escolha do usuário.
function apiFalsa({ concedida = false, recusaRemover = false, escolha } = {}) {
  const estado = { concedida, scripts: new Map(), chamadas: [], antes: {}, kv: memoryKv().local };
  if (escolha !== undefined) estado.kv.set('pjeLigado', escolha);
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
        await estado.antes.register?.();
        for (const s of lista) if (estado.scripts.has(s.id)) throw new Error(`Duplicate script ID '${s.id}'`);
        for (const s of lista) estado.scripts.set(s.id, structuredClone(s));
      },
      unregisterContentScripts: async ({ ids }) => {
        estado.chamadas.push('unregister');
        await estado.antes.unregister?.();
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

const escolha = (e) => e.kv.get('pjeLigado');
const ligadoDe = (e) => ligado(e.api, e.kv);
const registrarTudo = (e) => { for (const s of ESPERADOS) e.scripts.set(s.id, structuredClone(s)); };

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

test('registrar: outro contexto registra no meio do caminho ("Duplicate script ID") e vale o dele', async () => {
  const e = apiFalsa({ concedida: true });
  e.antes.register = () => { e.antes.register = undefined; registrarTudo(e); };
  await registrar(e.api);
  assert.deepEqual(IDS.map((id) => e.scripts.get(id)), ESPERADOS);
});

test('registrar: outro contexto tira o registro no meio do caminho', async () => {
  const e = apiFalsa({ concedida: true });
  registrarTudo(e);
  e.antes.unregister = () => { e.antes.unregister = undefined; e.scripts.clear(); };
  await registrar(e.api);
  assert.deepEqual(IDS.map((id) => e.scripts.get(id)), ESPERADOS);
});

test('registrar: erro que não é corrida chega a quem chamou', async () => {
  const e = apiFalsa({ concedida: true });
  e.api.scripting.registerContentScripts = async () => { throw new Error('Could not load javascript'); };
  await assert.rejects(registrar(e.api), /Could not load/);
});

test('ligado: só com a escolha, a permissão e os dois scripts', async () => {
  const e = apiFalsa({ concedida: true });
  registrarTudo(e);
  assert.equal(await ligadoDe(e), false, 'sem a escolha');
  await e.kv.set('pjeLigado', true);
  assert.equal(await ligadoDe(e), true);
  e.concedida = false;
  assert.equal(await ligadoDe(e), false, 'sem a permissão');
  e.concedida = true;
  e.scripts.delete('jamegao-pje-conteudo');
  assert.equal(await ligadoDe(e), false, 'só um dos scripts');
});

test('retirar: guarda a escolha, tira os dois scripts e devolve a permissão', async () => {
  const e = apiFalsa({ concedida: true, escolha: true });
  registrarTudo(e);
  await retirar(e.api, e.kv);
  assert.equal(await escolha(e), false);
  assert.equal(e.scripts.size, 0);
  assert.equal(e.concedida, false);
  assert.equal(await ligadoDe(e), false);
});

test('retirar: a escolha é guardada antes de mexer no registro', async () => {
  const e = apiFalsa({ concedida: true, escolha: true });
  registrarTudo(e);
  let naHora;
  e.antes.unregister = async () => { naHora = await escolha(e); };
  await retirar(e.api, e.kv);
  assert.equal(naHora, false);
});

test('retirar: a recusa em devolver a permissão é ignorada', async () => {
  const e = apiFalsa({ concedida: true, recusaRemover: true, escolha: true });
  registrarTudo(e);
  await retirar(e.api, e.kv);
  assert.equal(e.scripts.size, 0);
  assert.equal(e.concedida, true);
  assert.ok(e.chamadas.includes('remove'));
  assert.equal(await ligadoDe(e), false);
});

test('remoção da permissão recusada: depois de acertar, o PJe segue desligado', async () => {
  const e = apiFalsa({ concedida: true, recusaRemover: true, escolha: true });
  registrarTudo(e);
  await retirar(e.api, e.kv);
  await acertar(e.api, e.kv);
  assert.equal(e.scripts.size, 0);
  assert.equal(e.concedida, true);
  assert.equal(await ligadoDe(e), false);
});

test('retirar sem nada registrado não falha', async () => {
  const e = apiFalsa();
  await retirar(e.api, e.kv);
  e.scripts.set('jamegao-pje-pagina', { id: 'jamegao-pje-pagina' });
  await retirar(e.api, e.kv);
  assert.equal(e.scripts.size, 0);
});

test('acertar: escolhido, com a permissão e sem o registro, registra', async () => {
  const e = apiFalsa({ concedida: true, escolha: true });
  await acertar(e.api, e.kv);
  assert.deepEqual(IDS.map((id) => e.scripts.get(id)), ESPERADOS);
  assert.equal(await ligadoDe(e), true);
});

test('acertar: escolhido, com a permissão e só um dos scripts, registra os dois', async () => {
  const e = apiFalsa({ concedida: true, escolha: true });
  e.scripts.set('jamegao-pje-pagina', { id: 'jamegao-pje-pagina' });
  await acertar(e.api, e.kv);
  assert.deepEqual(IDS.map((id) => e.scripts.get(id)), ESPERADOS);
});

test('acertar: com a permissão mas sem a escolha, não registra', async () => {
  for (const valor of [undefined, false]) {
    const e = apiFalsa({ concedida: true, escolha: valor });
    await acertar(e.api, e.kv);
    assert.equal(e.scripts.size, 0);
    assert.deepEqual(e.chamadas, []);
  }
});

test('acertar: sem a escolha e com o registro, retira sem mexer na permissão', async () => {
  const e = apiFalsa({ concedida: true });
  registrarTudo(e);
  await acertar(e.api, e.kv);
  assert.equal(e.scripts.size, 0);
  assert.equal(e.concedida, true);
  assert.ok(!e.chamadas.includes('remove'));
});

test('acertar: escolhido, mas a permissão foi tirada no navegador: desliga e desfaz a escolha', async () => {
  const e = apiFalsa({ concedida: true, escolha: true });
  registrarTudo(e);
  e.concedida = false;
  await acertar(e.api, e.kv);
  assert.equal(e.scripts.size, 0);
  assert.equal(await escolha(e), false);
  assert.equal(await ligadoDe(e), false);
  // Concedida de novo por fora, não religa sozinho: falta a escolha.
  e.concedida = true;
  await acertar(e.api, e.kv);
  assert.equal(e.scripts.size, 0);
});

test('acertar: estado certo não muda nada', async () => {
  const ligadoCerto = apiFalsa({ concedida: true, escolha: true });
  registrarTudo(ligadoCerto);
  await acertar(ligadoCerto.api, ligadoCerto.kv);
  assert.deepEqual(ligadoCerto.chamadas, []);

  const desligadoCerto = apiFalsa();
  await acertar(desligadoCerto.api, desligadoCerto.kv);
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

test('ligarNoGesto: pede a permissão na hora, sem esperar nada antes, registra e guarda a escolha', async () => {
  const e = comPedido(apiFalsa(), async () => { e.concedida = true; return true; });
  const r = ligarNoGesto(e.api, e.kv);
  assert.equal(e.pedidos, 1, 'o pedido precisa sair dentro do gesto, antes de qualquer await');
  assert.equal(await r, true);
  assert.deepEqual(IDS.map((id) => e.scripts.get(id)), ESPERADOS);
  assert.equal(await escolha(e), true);
  assert.equal(await ligadoDe(e), true);
});

test('ligarNoGesto: permissão negada não registra nem guarda a escolha', async () => {
  const e = comPedido(apiFalsa(), async () => false);
  assert.equal(await ligarNoGesto(e.api, e.kv), false);
  assert.equal(e.scripts.size, 0);
  assert.equal(await escolha(e), undefined);
});

test('ligarNoGesto: registro que falha não guarda a escolha', async () => {
  const e = comPedido(apiFalsa(), async () => { e.concedida = true; return true; });
  e.api.scripting.registerContentScripts = async () => { throw new Error('Could not load javascript'); };
  await assert.rejects(ligarNoGesto(e.api, e.kv), /Could not load/);
  assert.equal(await escolha(e), undefined);
});

test('ligarNoGesto: recusa do navegador (sem gesto) chega a quem chamou', async () => {
  const sem = new Error('permissions.request may only be called from a user input handler');
  const e = comPedido(apiFalsa(), () => Promise.reject(sem));
  await assert.rejects(ligarNoGesto(e.api, e.kv), sem);
  const lanca = comPedido(apiFalsa(), () => { throw sem; });
  await assert.rejects(ligarNoGesto(lanca.api, lanca.kv), sem);
  assert.equal(e.scripts.size + lanca.scripts.size, 0);
});
