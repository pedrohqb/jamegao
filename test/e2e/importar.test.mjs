import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, FIX } from './harness.mjs';
import { gerar } from '../fix/gerar.mjs';

const browserName = process.env.BROWSER || 'chrome';
let h;
let gen;
before(async () => {
  h = await launch(browserName);
  gen = fs.mkdtempSync(path.join(os.tmpdir(), 'jamegao-fix-'));
  await gerar(gen);
});
after(async () => {
  if (h) await h.close();
  fs.rmSync(gen, { recursive: true, force: true });
});

const abrir = async () => {
  const page = await h.browser.newPage();
  await page.goto(h.extUrl('pages/import.html'));
  await page.waitForSelector('#importar');
  return page;
};

// Zera cofre, certificados e sessão entre os testes.
beforeEach(async () => {
  const page = await abrir();
  await page.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.session.clear();
    await new Promise((res) => { const r = indexedDB.deleteDatabase('jamegao'); r.onsuccess = r.onerror = r.onblocked = res; });
  });
  await page.close();
});

async function importar(page, { arquivo, senhaPfx = 'senha123', cofre, cofre2 }) {
  await (await page.$('#arquivo')).uploadFile(arquivo);
  await page.$eval('#senha-pfx', (el, v) => { el.value = v; }, senhaPfx);
  if (cofre !== undefined) await page.$eval('#senha-cofre', (el, v) => { el.value = v; }, cofre);
  if (cofre2 !== undefined) await page.$eval('#senha-cofre-2', (el, v) => { el.value = v; }, cofre2);
  await page.$eval('#status', (el) => { el.className = ''; el.textContent = ''; });
  await page.click('#importar');
  await page.waitForSelector('#status.ok, #status.erro');
  return page.$eval('#status', (el) => ({ cls: el.className, texto: el.textContent }));
}
const itens = (page) => page.$$eval('#certs li', (l) => l.length);
const fx = (n) => path.join(FIX, n);

test('primeira importação cria o cofre', async () => {
  const page = await abrir();
  try {
    assert.match(await page.$eval('body', (b) => b.innerText), /nada sai do seu computador/i);
    assert.doesNotMatch(await page.$eval('body', (b) => b.innerText), /WebSigner|Web PKI|Softplan|Lacuna/i);
    const r = await importar(page, { arquivo: fx('pf-moderno.pfx'), cofre: 'cofre-forte-1', cofre2: 'cofre-forte-1' });
    assert.equal(r.cls, 'ok', r.texto);
    assert.equal(await itens(page), 1);
    assert.equal(await page.$eval('#senha-cofre-2', (el) => el.hidden), true);
  } finally { await page.close(); }
});

test('senha do PFX errada', async () => {
  const page = await abrir();
  try {
    const r = await importar(page, { arquivo: fx('pf-moderno.pfx'), senhaPfx: 'errada', cofre: 'cofre-forte-1', cofre2: 'cofre-forte-1' });
    assert.equal(r.cls, 'erro');
    assert.match(r.texto, /Senha incorreta/);
    assert.equal(await itens(page), 0);
  } finally { await page.close(); }
});

test('senhas do cofre diferentes ou curtas', async () => {
  const page = await abrir();
  try {
    let r = await importar(page, { arquivo: fx('pf-moderno.pfx'), cofre: 'cofre-forte-1', cofre2: 'cofre-forte-2' });
    assert.equal(r.cls, 'erro');
    assert.match(r.texto, /não conferem/);
    r = await importar(page, { arquivo: fx('pf-moderno.pfx'), cofre: 'curta', cofre2: 'curta' });
    assert.equal(r.cls, 'erro');
    assert.match(r.texto, /pelo menos 8/);
    assert.equal(await itens(page), 0);
    const meta = await page.evaluate(() => chrome.storage.local.get('vaultMeta'));
    assert.deepEqual(meta, {});
  } finally { await page.close(); }
});

test('segunda importação pede a senha do cofre se estiver travado', async () => {
  let page = await abrir();
  try {
    let r = await importar(page, { arquivo: fx('pf-moderno.pfx'), cofre: 'cofre-forte-1', cofre2: 'cofre-forte-1' });
    assert.equal(r.cls, 'ok', r.texto);
    // Destravado: nem pede a senha.
    r = await importar(page, { arquivo: gen && path.join(gen, 'cadeia.pfx') });
    assert.equal(r.cls, 'ok', r.texto);
    assert.equal(await itens(page), 2);
    await page.evaluate(() => chrome.storage.session.clear());
    await page.reload();
    await page.waitForSelector('#importar');
    assert.equal(await page.$eval('#senha-cofre', (el) => el.hidden), false);
    assert.equal(await page.$eval('#senha-cofre-2', (el) => el.hidden), true);
    r = await importar(page, { arquivo: path.join(gen, 'vencido.pfx'), cofre: 'senha-errada-1' });
    assert.equal(r.cls, 'erro');
    assert.match(r.texto, /Senha do cofre incorreta/);
    r = await importar(page, { arquivo: path.join(gen, 'vencido.pfx'), cofre: 'cofre-forte-1' });
    assert.equal(r.cls, 'ok', r.texto);
    assert.equal(await itens(page), 3);
  } finally { await page.close(); }
});

test('mesmo certificado duas vezes não duplica', async () => {
  const page = await abrir();
  try {
    let r = await importar(page, { arquivo: fx('pf-moderno.pfx'), cofre: 'cofre-forte-1', cofre2: 'cofre-forte-1' });
    assert.equal(r.cls, 'ok', r.texto);
    r = await importar(page, { arquivo: fx('pf-3des.pfx') });
    assert.equal(r.cls, 'ok', r.texto);
    assert.equal(await itens(page), 1);
  } finally { await page.close(); }
});

test('PFX com chave EC mostra o erro de RSA', async () => {
  const page = await abrir();
  try {
    const r = await importar(page, { arquivo: path.join(gen, 'ec.pfx'), cofre: 'cofre-forte-1', cofre2: 'cofre-forte-1' });
    assert.equal(r.cls, 'erro');
    assert.match(r.texto, /não é RSA/);
    assert.equal(await itens(page), 0);
  } finally { await page.close(); }
});

test('em repouso não há chave em claro', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'jamegao-perfil-'));
  const p = await launch(browserName, { userDataDir: profile });
  try {
    const page = await p.browser.newPage();
    await page.goto(p.extUrl('pages/import.html'));
    await page.waitForSelector('#importar');
    await (await page.$('#arquivo')).uploadFile(fx('pf-moderno.pfx'));
    await page.$eval('#senha-pfx', (el) => { el.value = 'senha123'; });
    await page.$eval('#senha-cofre', (el) => { el.value = 'cofre-forte-1'; });
    await page.$eval('#senha-cofre-2', (el) => { el.value = 'cofre-forte-1'; });
    await page.click('#importar');
    await page.waitForSelector('#status.ok');
  } finally {
    await p.close();
  }
  try {
    const jwk = crypto.createPrivateKey(fs.readFileSync(fx('pf.key'))).export({ format: 'jwk' });
    const agulhas = ['d', 'p'].map((k) => Buffer.from(jwk[k], 'base64url').subarray(0, 32));
    assert.equal(agulhas[0].length, 32);
    const files = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name);
        if (e.isDirectory()) walk(f);
        else if (e.isFile()) files.push(f);
      }
    };
    walk(profile);
    let achouCofre = false;
    const achados = [];
    for (const f of files) {
      let buf;
      try { buf = fs.readFileSync(f); } catch { continue; }
      if (buf.includes('vaultMeta')) achouCofre = true;
      agulhas.forEach((a, i) => { if (buf.includes(a)) achados.push(`${i ? 'p' : 'd'} em ${f}`); });
    }
    assert.ok(achouCofre, 'controle: o perfil deveria conter o storage da extensão');
    assert.deepEqual(achados, []);
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
