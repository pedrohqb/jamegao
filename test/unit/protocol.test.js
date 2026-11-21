import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { BRANDS, CODES, COMPAT_VERSION, PkiError, fail, ok } from '../../ext/lib/protocol.js';

const brandsFromContentJs = () => {
  const src = fs.readFileSync(new URL('../../ext/content.js', import.meta.url), 'utf8');
  const m = src.match(/const BRANDS = (\[[\s\S]*?\n {2}\]);/);
  assert.ok(m, 'literal BRANDS não encontrado em content.js');
  return JSON.parse(JSON.stringify(vm.runInNewContext('(' + m[1] + ')')));
};

test('ok monta a resposta de sucesso', () => {
  assert.deepEqual(ok(7), { success: true, response: 7 });
});

test('fail monta o erro no formato do SDK', () => {
  assert.deepEqual(fail(CODES.badRequest, 'x'), { success: false,
    exception: { message: 'x', complete: 'x', origin: 'extension', code: 'bad_request' } });
});

test('códigos e versão', () => {
  assert.deepEqual(CODES, { cancelled: 'user_cancelled', badRequest: 'bad_request',
    notFound: 'certificate_not_found', unsupported: 'command_not_supported', internal: 'undefined' });
  assert.equal(COMPAT_VERSION, '2.99.0');
});

test('PkiError carrega o código', () => {
  const e = new PkiError('m', CODES.notFound);
  assert.ok(e instanceof Error);
  assert.equal(e.code, 'certificate_not_found');
  assert.equal(e.message, 'm');
});

test('content.js anuncia exatamente as marcas de protocol.js', () => {
  assert.deepEqual(brandsFromContentJs(), BRANDS);
});
