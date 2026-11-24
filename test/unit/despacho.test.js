import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDespacho } from '../../ext/lib/despacho.js';
import { createEsaj } from '../../ext/protocolos/esaj/fundo.js';
import { PkiError, CODES } from '../../ext/lib/protocol.js';

const O = 'https://a.exemplo';
const montar = ({ allowed, aceita = () => true, comandos = {}, extra = [] } = {}) => {
  const visto = [];
  const falso = {
    id: 'falso',
    aceitaOrigem: aceita,
    abertos: { aberto: async () => 'v' },
    comandos: { ola: async (req, ctx) => { visto.push(ctx); return { success: true, response: req }; }, ...comandos },
  };
  const sites = { get: async () => ({ allowed }) };
  const d = createDespacho({ protocolos: [falso, ...extra], certs: 'C', sites, assinar: 'A', platformOs: 'Linux' });
  return { d, visto };
};
const h = (d, over) => d.handle({ protocolo: 'falso', command: 'ola', request: { x: 1 }, ...over }, O);

test('protocolo desconhecido é command_not_supported', async () => {
  const { d } = montar();
  const r = await h(d, { protocolo: 'nao' });
  assert.equal(r.exception.code, 'command_not_supported');
});

test('protocolo ausente vale e-SAJ', async () => {
  const { d } = montar({ extra: [createEsaj({ matches: ['https://a.exemplo/*'] })] });
  const r = await d.handle({ command: 'getVersion' }, null);
  assert.equal(r.success, true);
});

test('comando aberto responde sem olhar origem', async () => {
  const { d } = montar({ aceita: () => false });
  assert.deepEqual(await d.handle({ protocolo: 'falso', command: 'aberto' }, null), { success: true, response: 'v' });
});

test('origem nula é cancelado', async () => {
  const { d } = montar();
  const r = await d.handle({ protocolo: 'falso', command: 'ola' }, null);
  assert.equal(r.exception.code, 'user_cancelled');
});

test('origem não aceita pelo protocolo', async () => {
  const { d } = montar({ aceita: () => false });
  const r = await h(d);
  assert.equal(r.exception.code, 'command_not_supported');
  assert.equal(r.exception.message, 'O Jamegão não atende o comando "ola".');
});

test('site bloqueado vem antes de comando ausente', async () => {
  const { d } = montar({ allowed: false });
  for (const command of ['ola', 'naoExiste']) {
    const r = await h(d, { command });
    assert.equal(r.exception.code, 'user_cancelled');
    assert.equal(r.exception.message, 'Este site está bloqueado no Jamegão.');
  }
});

test('comando ausente, inclusive __proto__', async () => {
  const { d } = montar();
  for (const command of ['naoExiste', '__proto__', 'constructor']) {
    const r = await h(d, { command });
    assert.equal(r.exception.code, 'command_not_supported');
  }
});

test('comando recebe o pedido e o contexto', async () => {
  const { d, visto } = montar();
  assert.deepEqual(await h(d), { success: true, response: { x: 1 } });
  assert.deepEqual(visto[0], { origin: O, certs: 'C', sites: visto[0].sites, assinar: 'A', platformOs: 'Linux' });
});

test('PkiError vira fail com o código; outro erro vira interno sem vazar', async () => {
  const { d } = montar({ comandos: {
    pki: async () => { throw new PkiError('x', CODES.badRequest); },
    boom: async () => { throw new Error('segredo'); },
  } });
  assert.equal((await h(d, { command: 'pki' })).exception.code, 'bad_request');
  const r = await h(d, { command: 'boom' });
  assert.equal(r.exception.message, 'Erro interno do Jamegão.');
  assert.ok(!JSON.stringify(r).includes('segredo'));
});

test('e-SAJ: aceita só os hosts da lista (e localhost se listado)', () => {
  const e = createEsaj({ matches: ['https://esaj.tjsp.jus.br/*', 'http://localhost/*'] });
  assert.equal(e.aceitaOrigem('https://esaj.tjsp.jus.br'), true);
  assert.equal(e.aceitaOrigem('http://localhost:8123'), true);
  assert.equal(e.aceitaOrigem('http://esaj.tjsp.jus.br'), false);
  assert.equal(e.aceitaOrigem('https://outro.jus.br'), false);
  assert.equal(e.aceitaOrigem('https://esaj.tjsp.jus.br.evil.com'), false);
  assert.equal(e.aceitaOrigem(null), false);
  assert.equal(createEsaj({ matches: ['https://esaj.tjsp.jus.br/*'] }).aceitaOrigem('http://127.0.0.1'), false);
});
