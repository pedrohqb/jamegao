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
  assert.equal(m.version, '0.2.0');
  assert.equal(m.minimum_chrome_version, '121');
  assert.equal(m.action.default_popup, 'pages/popup.html');
  assert.deepEqual(m.background, { service_worker: 'background.js', scripts: ['background.js'], type: 'module' });
  assert.equal(m.browser_specific_settings.gecko.strict_min_version, '140.0');
  assert.equal(m.browser_specific_settings.gecko_android.strict_min_version, '142.0');
  // Listada na Mozilla: quem atualiza é a própria loja, e a Mozilla recusa
  // versão listada com endereço próprio de atualização.
  assert.equal(m.browser_specific_settings.gecko.update_url, undefined);
});

test('updates.json leva quem tem a 0.1.1 à versão do manifesto, com o .xpi da release', async () => {
  const u = JSON.parse(fs.readFileSync(new URL('../../updates.json', import.meta.url), 'utf8'));
  const versoes = u.addons[m.browser_specific_settings.gecko.id].updates;
  const atual = versoes.find((v) => v.version === m.version);
  assert.ok(atual, 'updates.json precisa listar a versão ' + m.version);
  assert.equal(atual.update_link, `https://github.com/pedrohqb/jamegao/releases/download/v${m.version}/jamegao-${m.version}-firefox.xpi`);
  for (const v of versoes) assert.match(v.update_link, /^https:\/\//);
});

test('vendor/forge.min.js é o do node-forge instalado', async () => {
  const { createHash } = await import('node:crypto');
  const sha = (p) => createHash('sha256').update(fs.readFileSync(new URL(p, import.meta.url))).digest('hex');
  assert.equal(sha('../../ext/vendor/forge.min.js'), sha('../../node_modules/node-forge/dist/forge.min.js'));
});
