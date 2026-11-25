// Gera as imagens cruas para as capturas das lojas (dados fictícios: o
// certificado de teste de test/fix). Uso: node scripts/capturas.mjs <pasta>
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { launch } from '../test/e2e/harness.mjs';
import { criarAjudas } from '../test/e2e/ajudas.mjs';

const out = process.argv[2];
const forge = createRequire(import.meta.url)('node-forge');

// PFX fictício com a cadeia completa (AC + titular), como o PJe exige; sem a
// cadeia, o popup mostra o aviso de cadeia ausente.
function pfxComCadeia(arquivo) {
  const chave = () => forge.pki.privateKeyFromPem(crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs1', format: 'pem' }));
  const agora = Date.now();
  const cert = (k, cn, emissor, kEmissor, ac) => {
    const c = forge.pki.createCertificate();
    c.publicKey = forge.pki.setRsaPublicKey(k.n, k.e);
    c.serialNumber = '0' + crypto.randomBytes(8).toString('hex');
    c.validity.notBefore = new Date(agora - 86400000);
    c.validity.notAfter = new Date(agora + 365 * 86400000);
    const attrs = [{ name: 'commonName', value: cn }];
    c.setSubject(attrs);
    c.setIssuer(emissor ? emissor.subject.attributes : attrs);
    c.setExtensions([{ name: 'basicConstraints', cA: ac }]);
    c.sign(kEmissor || k, forge.md.sha256.create());
    return c;
  };
  const kAc = chave();
  const ac = cert(kAc, 'AC DE TESTE', null, null, true);
  const k = chave();
  const titular = cert(k, 'FULANO DE TAL TESTE:12345678909', ac, kAc, false);
  const asn1 = forge.pkcs12.toPkcs12Asn1(k, [ac, titular], 'senha123', { algorithm: '3des' });
  fs.writeFileSync(arquivo, Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary'));
}

const ESAJ = 'https://esaj.tjsp.jus.br';
const h = await launch('chrome');
const a = criarAjudas(h);
const trocarOrigem = (p, origem) => p.evaluate((o, n) => {
  for (const el of document.querySelectorAll('p, div, span, li')) {
    if (el.children.length === 0 && el.textContent.includes(o)) el.textContent = el.textContent.split(o).join(n);
  }
  for (const li of document.querySelectorAll('[data-origem]')) li.dataset.origem = n;
}, origem, ESAJ);
const foto = async (p, nome) => {
  const el = await p.$('body');
  await el.screenshot({ path: path.join(out, nome) });
};
try {
  const pfx = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jamegao-capturas-')), 'fulano.pfx');
  pfxComCadeia(pfx);
  await h.importPfx(pfx, 'senha123', 'cofre-forte-1');
  await a.limparSessao();
  const page = await a.abrirPagina(h.origin, 'lacuna-2.20.0.js');

  // 1. Autorização do site.
  let r = a.chamar(page, () => window.listar());
  let j = await a.janela();
  await j.setViewport({ width: 440, height: 300, deviceScaleFactor: 2 });
  await trocarOrigem(j, h.origin);
  await new Promise((res) => setTimeout(res, 700));
  await foto(j, 'cru-site.png');
  await a.responder(j, '#confirmar');
  const T = (await r).ok[0].thumbprint;

  // 2. Assinatura de um lote com o cofre travado.
  r = a.chamar(page, (t) => window.preautorizar(t, 3), T);
  j = await a.janela();
  await j.setViewport({ width: 440, height: 380, deviceScaleFactor: 2 });
  await trocarOrigem(j, h.origin);
  await new Promise((res) => setTimeout(res, 700));
  await foto(j, 'cru-assinatura.png');
  await a.responder(j, '#confirmar', 'cofre-forte-1');
  await r;

  // 3. Popup.
  const popup = await a.abrirPopup();
  await popup.setViewport({ width: 400, height: 520, deviceScaleFactor: 2 });
  await trocarOrigem(popup, h.origin);
  await foto(popup, 'cru-popup.png');
  // No Firefox o pedido de permissão já diz "jus.br": sem o aviso do Chrome.
  await popup.$eval('#pje-chromium', (el) => { el.hidden = true; });
  await foto(popup, 'cru-popup-firefox.png');

  // 4. Importação.
  const imp = await h.browser.newPage();
  await imp.setViewport({ width: 820, height: 760, deviceScaleFactor: 1.5 });
  await imp.goto(h.extUrl('pages/import.html'));
  await imp.waitForSelector('#importar');
  await new Promise((res) => setTimeout(res, 500));
  await foto(imp, 'cru-importar.png');
} finally {
  await h.close();
}
