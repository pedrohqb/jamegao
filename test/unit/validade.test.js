import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisoValidade, LIMITE_AVISO_DIAS } from '../../ext/lib/validade.js';

const DIA = 86400000;
const agora = Date.parse('2026-11-21T12:00:00Z');
const em = (ms) => new Date(agora + ms).toISOString();

test('limite de aviso é de 30 dias', () => assert.equal(LIMITE_AVISO_DIAS, 30));

test('vencido quando validityEnd já passou', () => {
  const a = avisoValidade(em(-1000), agora);
  assert.equal(a.tipo, 'vencido');
  assert.match(a.texto, /vencido/);
});

test('vence em N dias dentro de 30 dias (arredonda para cima)', () => {
  const a = avisoValidade(em(10 * DIA - 5000), agora);
  assert.equal(a.tipo, 'vence-logo');
  assert.match(a.texto, /vence em 10 dias/);
  assert.match(avisoValidade(em(DIA / 2), agora).texto, /vence em 1 dia\b/);
  assert.equal(avisoValidade(em(30 * DIA), agora).tipo, 'vence-logo');
});

test('sem aviso além de 30 dias ou com data inválida', () => {
  assert.equal(avisoValidade(em(30 * DIA + 1000), agora), null);
  assert.equal(avisoValidade('lixo', agora), null);
  assert.equal(avisoValidade(null, agora), null);
});
