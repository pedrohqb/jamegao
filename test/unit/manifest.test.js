import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const m = JSON.parse(fs.readFileSync(new URL('../../ext/manifest.json', import.meta.url), 'utf8'));

test('manifesto', () => {
  assert.equal(m.manifest_version, 3);
  assert.deepEqual(m.permissions, ['alarms', 'scripting', 'storage']);
  assert.equal(m.host_permissions, undefined);
  // O PJe é ligado pelo usuário: *.jus.br só como permissão opcional, para que
  // a atualização não desative a extensão no Chrome.
  assert.deepEqual(m.optional_host_permissions, ['https://*.jus.br/*']);
  assert.equal(m.optional_permissions, undefined);
  assert.ok(m.content_scripts[0].matches.every((x) => /^https:\/\/[a-z0-9.]+\.jus\.br\/\*$/.test(x)));
  // Só os e-SAJ em uso (TJSC e TJAM já migraram).
  assert.deepEqual(m.content_scripts[0].matches, [
    'https://esaj.tjsp.jus.br/*',
    'https://www2.tjal.jus.br/*',
    'https://esaj.tjms.jus.br/*',
    'https://esaj.tjac.jus.br/*',
    'https://esaj.tjce.jus.br/*',
    'https://esaj.tjba.jus.br/*',
  ]);
  assert.match(m.content_security_policy.extension_pages, /connect-src 'none'/);
  assert.doesNotMatch(m.name + m.description, /websigner|web ?pki|softplan|lacuna/i);
});

test('valores fixos', () => {
  assert.equal(m.name, 'Jamegão');
  assert.equal(m.version, '0.3.0');
  assert.equal(m.description, 'Assinatura no e-SAJ e no PJe com certificado A1, sem instalar programa.');
  assert.equal(m.minimum_chrome_version, '121');
  assert.equal(m.action.default_popup, 'pages/popup.html');
  assert.deepEqual(m.background, { service_worker: 'background.js', scripts: ['background.js'], type: 'module' });
  assert.equal(m.browser_specific_settings.gecko.strict_min_version, '140.0');
  assert.equal(m.browser_specific_settings.gecko_android.strict_min_version, '142.0');
  // Listada na Mozilla: quem atualiza é a própria loja, e a Mozilla recusa
  // versão listada com endereço próprio de atualização.
  assert.equal(m.browser_specific_settings.gecko.update_url, undefined);
});

// A 0.3.0 não tem .xpi no GitHub (decisão de Pedro, 24/11/2026): quem atualiza
// é a Mozilla. O updates.json fica só para quem ainda tem a 0.1.1 pelo .xpi.
test('updates.json só aponta para endereços https://', () => {
  const u = JSON.parse(fs.readFileSync(new URL('../../updates.json', import.meta.url), 'utf8'));
  const versoes = u.addons[m.browser_specific_settings.gecko.id].updates;
  assert.ok(versoes.length > 0);
  for (const v of versoes) assert.match(v.update_link, /^https:\/\//);
});

test('vendor/forge.min.js é o do node-forge instalado', async () => {
  const { createHash } = await import('node:crypto');
  const ler = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
  // Única alteração do vendor: o validador da Mozilla aponta o construtor
  // Function. A linha nunca roda (ali o `this` já é o objeto global, e a CSP
  // da extensão a barraria), e `globalThis` é o mesmo objeto. Se a contagem
  // não for exatamente uma, o node-forge mudou e a troca precisa ser revista.
  const alvo = 'new Function("return this")()';
  const original = ler('../../node_modules/node-forge/dist/forge.min.js');
  assert.equal(original.split(alvo).length - 1, 1, 'o node-forge deve ter exatamente uma ocorrência de ' + alvo);
  const esperado = original.replace(alvo, 'globalThis');
  const sha = (t) => createHash('sha256').update(t).digest('hex');
  assert.equal(sha(ler('../../ext/vendor/forge.min.js')), sha(esperado));
});
