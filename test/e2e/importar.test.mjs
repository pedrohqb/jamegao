import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, FIX } from './harness.mjs';
import { createRequire } from 'node:module';
import { gerar } from '../fix/gerar.mjs';

const browserName = process.env.BROWSER || 'chrome';
const CONTROLE = crypto.randomBytes(32);
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
    // Esvazia as tabelas em vez de apagar o banco (apagar fica esperando as
      // conexões de outros contextos e pode não terminar).
      const { STORES, run } = await import('/lib/db.js');
      for (const s of Object.values(STORES)) await run(s, 'readwrite', (st) => st.clear());
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
// A página redesenha a lista depois de mostrar o status (finally de importar):
// só vale a contagem que não muda entre duas leituras.
const itens = async (page) => {
  const contar = () => page.$$eval('#certs li', (l) => l.length);
  let a = await contar();
  for (;;) {
    await new Promise((r) => setTimeout(r, 250));
    const b = await contar();
    if (a === b) return b;
    a = b;
  }
};
const fx = (n) => path.join(FIX, n);

test('primeira importação cria o cofre', async () => {
  const page = await abrir();
  try {
    assert.match(await page.$eval('body', (b) => b.innerText), /a chave nunca sai do seu computador/i);
    assert.doesNotMatch(await page.$eval('body', (b) => b.innerText), /WebSigner|Web PKI|Softplan|Lacuna/i);
    const r = await importar(page, { arquivo: fx('pf-moderno.pfx'), cofre: 'cofre-forte-1', cofre2: 'cofre-forte-1' });
    assert.equal(r.cls, 'ok', r.texto);
    assert.equal(await itens(page), 1);
    assert.equal(await page.$eval('#senha-cofre-2', (el) => el.hidden), true);
    // Nada do cofre em storage.local, que os scripts de conteúdo alcançam.
    assert.deepEqual(await page.evaluate(() => chrome.storage.local.get(null)), {});
  } finally { await page.close(); }
});

test('senha do PFX errada', async () => {
  const page = await abrir();
  try {
    const r = await importar(page, { arquivo: fx('pf-moderno.pfx'), senhaPfx: 'errada', cofre: 'cofre-forte-1', cofre2: 'cofre-forte-1' });
    assert.equal(r.cls, 'erro');
    assert.match(r.texto, /Senha incorreta/);
    assert.equal(await itens(page), 0);
    for (const id of ['#senha-pfx', '#senha-cofre', '#senha-cofre-2']) {
      assert.equal(await page.$eval(id, (el) => el.value), '', id);
    }
    assert.deepEqual(await page.evaluate(() => import('/lib/kv.js').then(async ({ browserKv }) => { const v = await browserKv().local.get('vaultMeta'); return v === undefined ? {} : { vaultMeta: v }; })), {});
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
    const meta = await page.evaluate(() => import('/lib/kv.js').then(async ({ browserKv }) => { const v = await browserKv().local.get('vaultMeta'); return v === undefined ? {} : { vaultMeta: v }; }));
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
    // Controle positivo: um blob com agulha conhecida, em claro, num banco de teste.
    await page.evaluate(async (hex) => {
      const bytes = new Uint8Array(hex.match(/../g).map((b) => parseInt(b, 16)));
      await new Promise((res, rej) => {
        const r = indexedDB.open('controle-claro', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('x');
        r.onsuccess = () => {
          const tx = r.result.transaction('x', 'readwrite');
          tx.objectStore('x').put(bytes, 'blob');
          tx.oncomplete = () => { r.result.close(); res(); };
          tx.onerror = () => rej(tx.error);
        };
        r.onerror = () => rej(r.error);
      });
    }, CONTROLE.toString('hex'));
    await page.close();
  } finally {
    await p.close();
  }
  try {
    const jwk = crypto.createPrivateKey(fs.readFileSync(fx('pf.key'))).export({ format: 'jwk' });
    // pf.key é a chave do certificado de pf-moderno.pfx (mesmo módulo).
    const forge = createRequire(import.meta.url)('node-forge');
    const p12 = forge.pkcs12.pkcs12FromAsn1(
      forge.asn1.fromDer(forge.util.createBuffer(fs.readFileSync(fx('pf-moderno.pfx')).toString('binary'))), false, 'senha123');
    const cert = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag][0].cert;
    assert.equal(Buffer.from(cert.publicKey.n.toString(16).padStart(512, '0'), 'hex').toString('base64url'), jwk.n);
    const brutas = ['d', 'p'].map((k) => Buffer.from(jwk[k], 'base64url').subarray(0, 32));
    assert.equal(brutas[0].length, 32);
    // Bytes brutos, base64 em três alinhamentos e base64url.
    const variantes = (raw) => {
      const out = [raw];
      for (let off = 0; off < 3; off++) {
        const b = Buffer.concat([Buffer.alloc(off), raw]).toString('base64');
        // descarta caracteres de borda que dependem dos bytes vizinhos
        out.push(Buffer.from(b.slice(4, b.length - 4)));
        out.push(Buffer.from(b.slice(4, b.length - 4).replace(/\+/g, '-').replace(/\//g, '_')));
      }
      return out;
    };
    const agulhas = [...brutas.flatMap(variantes)];
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
      if (buf.includes(CONTROLE)) achouCofre = true;
      agulhas.forEach((a, i) => { if (buf.includes(a)) achados.push(`agulha ${i} em ${f}`); });
    }
    assert.ok(achouCofre, 'controle: a agulha em claro deveria aparecer no perfil');
    assert.deepEqual(achados, []);
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
