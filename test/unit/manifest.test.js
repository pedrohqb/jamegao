import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const m = JSON.parse(fs.readFileSync(new URL('../../ext/manifest.json', import.meta.url), 'utf8'));

test('manifesto', () => {
  assert.equal(m.manifest_version, 3);
  assert.deepEqual([...m.permissions].sort(), ['alarms', 'storage']);
  assert.equal(m.host_permissions, undefined);
  assert.ok(m.content_scripts[0].matches.every((x) => /^https:\/\/[a-z0-9.]+\.jus\.br\/\*$/.test(x)));
  assert.match(m.content_security_policy.extension_pages, /connect-src 'none'/);
  assert.doesNotMatch(m.name + m.description, /websigner|web ?pki|softplan|lacuna/i);
});

test('valores fixos', () => {
  assert.equal(m.name, 'Jamegão');
  assert.equal(m.version, '0.1.0');
  assert.equal(m.minimum_chrome_version, '121');
  assert.equal(m.action.default_popup, 'pages/popup.html');
  assert.deepEqual(m.background, { service_worker: 'background.js', scripts: ['background.js'], type: 'module' });
  assert.equal(m.browser_specific_settings.gecko.strict_min_version, '128.0');
});
