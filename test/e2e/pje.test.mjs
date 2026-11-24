// PJe: o Jamegão no lugar do assinador local, em páginas imitadas do SSO e do
// TJMA servidas por interceptação (sem rede).
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { launch, FIX } from './harness.mjs';
import { criarAjudas } from './ajudas.mjs';
import { ligarPje, abrirPje } from './ajudas-pje.mjs';
import { gerar } from '../fix/gerar.mjs';

const forge = createRequire(import.meta.url)('node-forge');
const browserName = process.env.BROWSER || 'chrome';
const COFRE = 'cofre-forte-1';
const SSO = 'https://sso.cloud.pje.jus.br';
const TJMA = 'https://pje.tjma.jus.br';
const UPLOAD = '/arquivoAssinadoUpload.seam?action=processoUpdateAction&cid=1&mo=P';
const MD5_DIGESTINFO = Buffer.from('3020300c06082a864886f70d020505000410', 'hex');

let h;
let a;
let gen;
let titularDer;
let raizDer;
let publicKey;
const abertas = [];

before(async () => {
  gen = fs.mkdtempSync(path.join(os.tmpdir(), 'jamegao-pje-'));
  await gerar(gen);
  // Titular e autoridade do PFX com cadeia, para conferir assinatura e ordem.
  const pfx = fs.readFileSync(path.join(gen, 'cadeia.pfx'));
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(pfx.toString('binary')), 'senha123');
  const certs = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag].map((b) => b.cert);
  const der = (c) => Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(c)).getBytes(), 'binary');
  const titular = certs.find((c) => c.subject.getField('CN').value === 'TITULAR COM CADEIA');
  titularDer = der(titular);
  raizDer = der(certs.find((c) => c !== titular));
  publicKey = crypto.createPublicKey(forge.pki.certificateToPem(titular));

  h = await launch(browserName, { pje: true });
  a = criarAjudas(h);
  await h.importPfx(path.join(gen, 'cadeia.pfx'), 'senha123', COFRE);
  await ligarPje(h);
});
after(async () => {
  if (h) await h.close();
  if (gen) fs.rmSync(gen, { recursive: true, force: true });
});

// Cofre travado, sem sites nem créditos entre os testes; o certificado fica.
beforeEach(async () => {
  const page = await h.browser.newPage();
  await page.goto(h.extUrl('pages/import.html'));
  await page.evaluate(async () => {
    const { browserKv } = await import('/lib/kv.js');
    const kv = browserKv().local;
    await kv.remove('sites');
    await kv.remove('lockout');
    await chrome.storage.session.clear();
  });
  await page.close();
});
afterEach(async () => {
  for (const p of abertas.splice(0)) await p.close().catch(() => {});
  for (const p of await a.confirmPages()) await p.close().catch(() => {});
});

const abrir = async (url, opcoes) => {
  const r = await abrirPje(h, url, opcoes);
  abertas.push(r.page);
  return r;
};

// Servidor do PJe imitado: o login responde 204; os documentos, "Sucesso"
// (ou o que `textos` mandar, na ordem).
const rotasSso = () => ({ status: 204, body: '' });
const rotasTjma = (textos = []) => () => ({ status: 200, contentType: 'text/plain', body: textos.shift() ?? 'Sucesso' });

const MENSAGEM = 'Bem-vindo ao PJe 123456';
const logar = (page) => page.evaluate(async (mensagem) => {
  const ping = await window.chamar(window.ping());
  const res = await window.chamar(window.requisicao('sso.autenticador',
    { enviarPara: '/pjeoffice-rest', mensagem, token: 'tok-1' },
    { servidor: location.origin + '/auth/realms/pje' }));
  return { ping, res };
}, MENSAGEM);

const ARQUIVOS = [
  { id: '197872195', codIni: '132616815', hash: 'e8a8d6d38608c1aceb7d1b01ea238168', isBin: 'true' },
  { id: '197872205', codIni: '132954530', hash: '094d4af227008ccf5a5abf046feaa414', isBin: 'true' },
];
const lote = (arquivos, extra = {}) => ({
  algoritmoAssinatura: 'ASN1MD5withRSA', modoTeste: 'false', uploadUrl: UPLOAD, arquivos, ...extra,
});
const assinar = (page, tarefa, opcoes = {}) => page.evaluate(
  (t, o) => window.chamar(window.requisicao('cnj.assinadorHash', t, o), { modo: o.modo }),
  tarefa, opcoes,
);

const campos = (envio) => Object.fromEntries(new URLSearchParams(envio.corpo));
const conferirDocumento = (envio) => {
  assert.match(envio.headers['content-type'], /^application\/x-www-form-urlencoded; ?charset=UTF-8$/i);
  assert.equal(envio.headers.versao, '2.5.16');
  const c = campos(envio);
  const di = crypto.publicDecrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(c.assinatura, 'base64'));
  assert.deepEqual(di, Buffer.concat([MD5_DIGESTINFO, Buffer.from(c.hash, 'hex')]));
  assert.deepEqual(corpoPkiPath(c.cadeiaCertificado), Buffer.concat([raizDer, titularDer]));
  return c;
};

// Conteúdo da SEQUENCE do PkiPath (os certificados, na ordem em que vieram).
function corpoPkiPath(b64) {
  const b = Buffer.from(b64, 'base64');
  assert.equal(b[0], 0x30);
  const inicio = b[1] & 0x80 ? 2 + (b[1] & 0x7f) : 2;
  return b.subarray(inicio);
}

const textoAssinatura = (j) => j.$eval('#assinatura', (e) => e.textContent);

test('login no SSO: assina MD5withRSA e envia à própria origem, com a cadeia do PkiPath', async () => {
  const { page, localhost, envios } = await abrir(SSO + '/auth/realms/pje/protocol/openid-connect/auth', { rotas: rotasSso });
  const resultado = logar(page);
  const j = await a.janela(SSO);
  assert.match(await textoAssinatura(j), /^Entrar no PJe de https:\/\/sso\.cloud\.pje\.jus\.br com o certificado de .*TITULAR COM CADEIA.*\.$/);
  await a.responder(j, '#confirmar', COFRE);
  assert.deepEqual(await resultado, { ping: 'ok', res: 'ok' });
  assert.deepEqual(localhost, []);
  assert.equal(envios.length, 1);
  const { url, headers, corpo } = envios[0];
  assert.equal(url, SSO + '/auth/realms/pje/pjeoffice-rest');
  assert.equal(headers['content-type'], 'application/json');
  assert.equal(headers.accept, 'application/json');
  assert.equal(headers.versao, '2.5.16');
  const body = JSON.parse(corpo);
  assert.deepEqual(Object.keys(body).sort(), ['assinatura', 'certChain', 'mensagem', 'uuid']);
  assert.equal(body.uuid, 'tok-1');
  assert.equal(body.mensagem, MENSAGEM);
  assert.ok(crypto.verify('md5', Buffer.from(MENSAGEM), publicKey, Buffer.from(body.assinatura, 'base64')));
  // Ordem do Java: a autoridade primeiro, o titular por último.
  assert.deepEqual(corpoPkiPath(body.certChain), Buffer.concat([raizDer, titularDer]));
});

test('lote de 2 no TJMA: uma janela, um envio por documento, na ordem', async () => {
  const { page, localhost, envios } = await abrir(TJMA + '/pje/Processo/update.seam', { rotas: rotasTjma() });
  const resultado = assinar(page, lote(ARQUIVOS));
  const j = await a.janela(TJMA);
  assert.match(await textoAssinatura(j), /^Assinar 2 documentos no PJe de https:\/\/pje\.tjma\.jus\.br com o certificado de /);
  await a.responder(j, '#confirmar', COFRE);
  assert.equal(await resultado, 'ok');
  assert.equal((await a.confirmPages()).length, 0);
  assert.deepEqual(localhost, []);
  assert.equal(envios.length, 2);
  for (const e of envios) assert.equal(e.url, TJMA + '/pje' + UPLOAD);
  const c = envios.map(conferirDocumento);
  assert.deepEqual(c.map((x) => [x.id, x.codIni, x.hash]), ARQUIVOS.map((x) => [x.id, x.codIni, x.hash]));
  assert.deepEqual(Object.keys(c[0]).sort(), ['assinatura', 'cadeiaCertificado', 'codIni', 'hash', 'id']);
});

test('página com o toJSON do Prototype.js: a lista chega em texto e é assinada', async () => {
  const { page, localhost, envios } = await abrir(TJMA + '/pje/Processo/update.seam', { prototype: true, rotas: rotasTjma() });
  // Na própria página, o JSON.stringify transforma a lista em texto.
  assert.equal(await page.evaluate(() => typeof JSON.parse(JSON.stringify({ l: [1] })).l), 'string');
  const resultado = assinar(page, lote(ARQUIVOS.map((x) => ({ ...x, idTarefa: 77 }))));
  await a.responder(await a.janela(TJMA), '#confirmar', COFRE);
  assert.equal(await resultado, 'ok');
  assert.deepEqual(localhost, []);
  assert.equal(envios.length, 2);
  for (const e of envios) assert.equal(conferirDocumento(e).idTarefa, '77');
  // O toJSON da página continua lá depois do Jamegão.
  assert.equal(await page.evaluate(() => Object.prototype.hasOwnProperty.call(Array.prototype, 'toJSON')), true);
});

test('tarefa que o Jamegão não faz: sem janela, a chamada segue para o localhost e fica anotada', async () => {
  const { page, localhost, envios } = await abrir(TJMA + '/pje/x.seam');
  const r = await page.evaluate(() => window.chamar(window.requisicao('cnj.assinador', { arquivos: [] })));
  assert.equal(r, 'indisponivel');
  await a.semJanela(500);
  assert.equal(localhost.length, 1);
  assert.match(localhost[0], /^http:\/\/127\.0\.0\.1:8800\/pjeOffice\/requisicao\/\?r=/);
  assert.equal(envios.length, 0);
  const sessao = await h.browser.newPage();
  await sessao.goto(h.extUrl('pages/import.html'));
  const recusadas = await sessao.evaluate(() => chrome.storage.session.get('pjeRecusadas').then((x) => x.pjeRecusadas));
  await sessao.close();
  assert.deepEqual(recusadas, [{ origin: TJMA, tarefa: 'cnj.assinador' }]);
});

test("modoTeste 'true': sem janela, a chamada segue para o localhost", async () => {
  const { page, localhost, envios } = await abrir(TJMA + '/pje/x.seam');
  assert.equal(await assinar(page, lote(ARQUIVOS, { modoTeste: 'true' })), 'indisponivel');
  await a.semJanela(500);
  assert.equal(localhost.length, 1);
  assert.equal(envios.length, 0);
});

test('destino de envio de outra origem: 2×1, sem janela e sem envio', async () => {
  const { page, localhost, envios } = await abrir(TJMA + '/pje/x.seam');
  assert.equal(await assinar(page, lote(ARQUIVOS), { servidor: 'https://outro.jus.br/pje' }), 'erro');
  await a.semJanela(500);
  assert.deepEqual(localhost, []);
  assert.equal(envios.length, 0);
});

test('"Usar o programa instalado": a chamada segue para o localhost', async () => {
  const { page, localhost, envios } = await abrir(SSO + '/auth/realms/pje/x', { rotas: rotasSso });
  const resultado = logar(page);
  const j = await a.janela(SSO);
  assert.equal(await j.$eval('#programa', (b) => b.hidden), false);
  assert.equal(await j.$eval('#programa', (b) => b.textContent), 'Usar o programa instalado');
  await a.responder(j, '#programa');
  assert.deepEqual(await resultado, { ping: 'ok', res: 'indisponivel' });
  assert.equal(localhost.length, 1);
  assert.match(localhost[0], /\/pjeOffice\/requisicao\//);
  assert.equal(envios.length, 0);
});

test('site bloqueado: as chamadas seguem para o localhost, sem janela', async () => {
  const { page, localhost } = await abrir(SSO + '/auth/realms/pje/x', { rotas: rotasSso });
  const primeiro = logar(page);
  await a.responder(await a.janela(SSO), '#bloquear');
  assert.deepEqual(await primeiro, { ping: 'ok', res: 'erro' });
  assert.deepEqual(localhost, []);
  assert.deepEqual(await logar(page), { ping: 'indisponivel', res: 'indisponivel' });
  await a.semJanela(500);
  assert.equal(localhost.length, 2);
});

test('a mesma imagem reaproveitada para a consulta e para a tarefa', async () => {
  const { page, localhost, envios } = await abrir(TJMA + '/pje/x.seam', { rotas: rotasTjma() });
  const resultado = page.evaluate(async (tarefa) => {
    const img = new Image();
    const ping = await window.chamar(window.ping(), { img });
    const res = await window.chamar(window.requisicao('cnj.assinadorHash', tarefa), { img });
    return { ping, res, largura: img.width };
  }, lote(ARQUIVOS.slice(0, 1)));
  await a.responder(await a.janela(TJMA), '#confirmar', COFRE);
  assert.deepEqual(await resultado, { ping: 'ok', res: 'ok', largura: 1 });
  assert.deepEqual(localhost, []);
  assert.equal(envios.length, 1);
});

test('duas requisições seguidas sem esperar: uma janela por vez, as duas terminam', async () => {
  const { page, localhost, envios } = await abrir(TJMA + '/pje/x.seam', { rotas: rotasTjma() });
  const resultado = page.evaluate((t1, t2) => Promise.all([
    window.chamar(window.requisicao('cnj.assinadorHash', t1)),
    window.chamar(window.requisicao('cnj.assinadorHash', t2)),
  ]), lote(ARQUIVOS.slice(0, 1)), lote(ARQUIVOS.slice(1)));
  const j1 = await a.janela(TJMA);
  await new Promise((r) => setTimeout(r, 1000));
  assert.equal((await a.confirmPages()).length, 1);
  assert.match(await textoAssinatura(j1), /^Assinar 1 documento no PJe/);
  await a.responder(j1, '#confirmar', COFRE);
  // O segundo lote abre a sua própria janela, mesmo com o cofre aberto.
  const j2 = await a.janela(TJMA);
  assert.match(await textoAssinatura(j2), /^Assinar 1 documento no PJe/);
  await a.responder(j2, '#confirmar');
  assert.deepEqual(await resultado, ['ok', 'ok']);
  assert.deepEqual(localhost, []);
  assert.deepEqual(envios.map((e) => campos(e).id), [ARQUIVOS[0].id, ARQUIVOS[1].id]);
});

test('tarefa como objeto, resumo em maiúsculas e src por setAttribute', async () => {
  const { page, localhost, envios } = await abrir(TJMA + '/pje/x.seam', { rotas: rotasTjma() });
  const arquivo = { ...ARQUIVOS[0], hash: ARQUIVOS[0].hash.toUpperCase() };
  const resultado = assinar(page, lote([arquivo]), { objeto: true, modo: 'atributo' });
  await a.responder(await a.janela(TJMA), '#confirmar', COFRE);
  assert.equal(await resultado, 'ok');
  assert.deepEqual(localhost, []);
  assert.equal(envios.length, 1);
  assert.equal(conferirDocumento(envios[0]).hash, arquivo.hash);
});

test('lista de arquivos vazia: 2×1 sem janela', async () => {
  const { page, localhost, envios } = await abrir(TJMA + '/pje/x.seam');
  assert.equal(await assinar(page, lote([])), 'erro');
  assert.equal(await assinar(page, lote('[]')), 'erro');
  await a.semJanela(500);
  assert.deepEqual(localhost, []);
  assert.equal(envios.length, 0);
});

test('documento recusado pelo servidor não impede os seguintes; a resposta é 2×1', async () => {
  const { page, envios } = await abrir(TJMA + '/pje/x.seam', { rotas: rotasTjma(['Erro: documento inválido', 'Sucesso']) });
  const resultado = assinar(page, lote(ARQUIVOS));
  await a.responder(await a.janela(TJMA), '#confirmar', COFRE);
  assert.equal(await resultado, 'erro');
  assert.deepEqual(envios.map((e) => campos(e).id), [ARQUIVOS[0].id, ARQUIVOS[1].id]);
});

test('login do SSO dentro de um quadro da mesma origem', async () => {
  const { page, localhost, envios } = await abrir(SSO + '/auth/realms/pje/topo', { rotas: rotasSso });
  await page.evaluate((u) => new Promise((ok) => {
    const f = document.createElement('iframe');
    f.onload = ok;
    f.src = u;
    document.body.append(f);
  }), SSO + '/auth/realms/pje/quadro');
  const quadro = page.frames().find((f) => f.url().endsWith('/auth/realms/pje/quadro'));
  assert.ok(quadro, 'o quadro não carregou');
  assert.equal(await quadro.evaluate(() => window.__jamegaoPje), true, 'os scripts do PJe não estão no quadro');
  const resultado = logar(quadro);
  const j = await a.janela(SSO);
  assert.match(await textoAssinatura(j), /^Entrar no PJe de https:\/\/sso\.cloud\.pje\.jus\.br com o certificado de /);
  await a.responder(j, '#confirmar', COFRE);
  assert.deepEqual(await resultado, { ping: 'ok', res: 'ok' });
  assert.deepEqual(localhost, []);
  assert.equal(envios.length, 1);
  assert.equal(envios[0].url, SSO + '/auth/realms/pje/pjeoffice-rest');
  assert.ok(crypto.verify('md5', Buffer.from(MENSAGEM), publicKey, Buffer.from(JSON.parse(envios[0].corpo).assinatura, 'base64')));
});

test('modoTeste true (booleano): sem janela, a chamada segue para o localhost', async () => {
  const { page, localhost, envios } = await abrir(TJMA + '/pje/x.seam');
  assert.equal(await assinar(page, lote(ARQUIVOS, { modoTeste: true })), 'indisponivel');
  await a.semJanela(500);
  assert.equal(localhost.length, 1);
  assert.equal(envios.length, 0);
});

test('uploadUrl que leva a outra origem: 2×1, sem janela e sem envio', async () => {
  const { page, localhost, envios, outros } = await abrir(TJMA + '/pje/x.seam');
  // servidor + uploadUrl = https://pje.tjma.jus.br@outro.jus.br/... (outro.jus.br)
  const r = await assinar(page, lote(ARQUIVOS, { uploadUrl: '@outro.jus.br/upload.seam' }), { servidor: TJMA });
  assert.equal(r, 'erro');
  await a.semJanela(500);
  assert.deepEqual(localhost, []);
  assert.deepEqual(outros, []);
  assert.equal(envios.length, 0);
});

test('enviarPara que leva a outra origem: 2×1, sem janela e sem envio', async () => {
  const { page, localhost, envios, outros } = await abrir(SSO + '/auth/realms/pje/x', { rotas: rotasSso });
  // servidor + enviarPara = https://sso.cloud.pje.jus.br.outro.com.br/... (outra origem)
  const r = await page.evaluate((m) => window.chamar(window.requisicao('sso.autenticador',
    { enviarPara: '.outro.com.br/pjeoffice-rest', mensagem: m, token: 'tok-1' }, { servidor: location.origin })), MENSAGEM);
  assert.equal(r, 'erro');
  await a.semJanela(500);
  assert.deepEqual(localhost, []);
  assert.deepEqual(outros, []);
  assert.equal(envios.length, 0);
});

test('pedido sem enviarPara ou sem uploadUrl: 2×1, sem janela e sem envio', async () => {
  const sso = await abrir(SSO + '/auth/realms/pje/x', { rotas: rotasSso });
  for (const enviarPara of [undefined, '']) {
    const r = await sso.page.evaluate((m, e) => window.chamar(window.requisicao('sso.autenticador',
      { enviarPara: e, mensagem: m, token: 'tok-1' }, { servidor: location.origin + '/auth/realms/pje' })), MENSAGEM, enviarPara);
    assert.equal(r, 'erro', `enviarPara ${JSON.stringify(enviarPara)}`);
  }
  const tjma = await abrir(TJMA + '/pje/x.seam', { rotas: rotasTjma() });
  for (const uploadUrl of [undefined, '']) {
    assert.equal(await assinar(tjma.page, lote(ARQUIVOS, { uploadUrl })), 'erro', `uploadUrl ${JSON.stringify(uploadUrl)}`);
  }
  await a.semJanela(500);
  assert.deepEqual([...sso.localhost, ...tjma.localhost], []);
  assert.deepEqual([...sso.envios, ...tjma.envios], []);
});

test('login respondido com redirecionamento: vale como o 302 de sucesso, e o redirecionamento não é seguido', async () => {
  const redirecionar = () => ({ status: 302, headers: { location: 'https://outro.jus.br/depois-do-login' }, body: '' });
  const { page, localhost, envios, outros } = await abrir(SSO + '/auth/realms/pje/x', { rotas: redirecionar });
  const resultado = logar(page);
  await a.responder(await a.janela(SSO), '#confirmar', COFRE);
  assert.deepEqual(await resultado, { ping: 'ok', res: 'ok' });
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(localhost, []);
  assert.deepEqual(outros, []);
  assert.deepEqual(envios.map((e) => e.url), [SSO + '/auth/realms/pje/pjeoffice-rest']);
});

test('documento respondido com redirecionamento (307): falha dele, e a assinatura não vai a outra origem', async () => {
  let n = 0;
  const rotas = () => (++n === 1
    ? { status: 307, headers: { location: 'https://outro.jus.br/recebe' }, body: '' }
    : { status: 200, contentType: 'text/plain', body: 'Sucesso' });
  const { page, localhost, envios, outros } = await abrir(TJMA + '/pje/x.seam', { rotas });
  const resultado = assinar(page, lote(ARQUIVOS));
  await a.responder(await a.janela(TJMA), '#confirmar', COFRE);
  assert.equal(await resultado, 'erro');
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(localhost, []);
  assert.deepEqual(outros, []);
  // Os dois documentos foram à própria origem, uma vez cada; nada a outra.
  assert.deepEqual(envios.map((e) => [e.url, campos(e).id]), ARQUIVOS.map((x) => [TJMA + '/pje' + UPLOAD, x.id]));
});

test('mundo isolado que não responde: a chamada segue para o localhost, sem travar', async () => {
  const { page, localhost, envios } = await abrir(SSO + '/auth/realms/pje/x', { rotas: rotasSso });
  // Os pedidos do script da página não chegam ao mundo isolado (como com a
  // extensão desativada, quando o script da página fica).
  await page.evaluate(() => window.addEventListener('jamegao-pje-pedido', (e) => e.stopPropagation(), true));
  assert.deepEqual(await logar(page), { ping: 'indisponivel', res: 'indisponivel' });
  await a.semJanela(500);
  assert.equal(localhost.length, 2);
  assert.equal(envios.length, 0);
});

test('recusa do usuário não vai ao console; outras falhas vão, com [Jamegão]', async () => {
  const { page, consoleDaPagina } = await abrir(SSO + '/auth/realms/pje/x', { rotas: rotasSso });
  const resultado = logar(page);
  await a.responder(await a.janela(SSO), '#recusar');
  assert.deepEqual(await resultado, { ping: 'ok', res: 'erro' });
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(consoleDaPagina.filter((t) => t.includes('[Jamegão]')), []);
  // Controle: uma falha que não é do usuário aparece.
  const r = await page.evaluate(() => window.chamar(window.requisicao('sso.autenticador', { mensagem: 'x', token: 't' })));
  assert.equal(r, 'erro');
  for (const fim = Date.now() + 3000; Date.now() < fim && !consoleDaPagina.length;) await new Promise((ok) => setTimeout(ok, 50));
  assert.ok(consoleDaPagina.some((t) => t.includes('[Jamegão]')), 'a falha deveria ir ao console: ' + consoleDaPagina.join(' | '));
});

// Daqui em diante há dois certificados com cadeia.
test('dois certificados: a janela mostra o seletor, marca o último usado e assina com o escolhido', async () => {
  await h.importPfx(path.join(FIX, 'pj-legado.pfx'), 'outra senha', COFRE);
  const pjCert = new crypto.X509Certificate(fs.readFileSync(path.join(FIX, 'pj.crt')));
  const { page, localhost, envios } = await abrir(SSO + '/auth/realms/pje/x', { rotas: rotasSso });
  const opcoesDe = (j) => j.$eval('#certificado', (s) => [...s.options].map((o) => ({ valor: o.value, texto: o.textContent, marcado: o.selected })));

  // Primeira vez nesta origem: o seletor aparece, com os dois.
  let resultado = logar(page);
  let j = await a.janela(SSO);
  assert.equal(await j.$eval('#bloco-certificado', (b) => b.hidden), false);
  assert.equal(await j.$eval('label[for="certificado"]', (l) => l.textContent), 'Certificado');
  let opcoes = await opcoesDe(j);
  assert.equal(opcoes.length, 2);
  const pj = opcoes.find((o) => o.texto.includes('EMPRESA: TESTE LTDA'));
  const titular = opcoes.find((o) => o.texto.includes('TITULAR COM CADEIA'));
  assert.ok(pj && titular, JSON.stringify(opcoes));
  for (const o of opcoes) assert.match(o.texto, /^.+ \(válido até \d{4}-\d{2}-\d{2}\)$/);
  // Escolhe o da empresa; o texto acompanha.
  await j.$eval('#certificado', (s, v) => { s.value = v; s.dispatchEvent(new Event('change')); }, pj.valor);
  assert.match(await textoAssinatura(j), /^Entrar no PJe de https:\/\/sso\.cloud\.pje\.jus\.br com o certificado de .*EMPRESA: TESTE LTDA.*\.$/);
  await a.responder(j, '#confirmar', COFRE);
  assert.deepEqual(await resultado, { ping: 'ok', res: 'ok' });
  let body = JSON.parse(envios[0].corpo);
  assert.ok(crypto.verify('md5', Buffer.from(MENSAGEM), pjCert.publicKey, Buffer.from(body.assinatura, 'base64')));
  assert.deepEqual(corpoPkiPath(body.certChain), pjCert.raw);

  // Segunda vez: o da empresa já vem marcado.
  resultado = logar(page);
  j = await a.janela(SSO);
  opcoes = await opcoesDe(j);
  assert.deepEqual(opcoes.filter((o) => o.marcado).map((o) => o.valor), [pj.valor]);
  assert.match(await textoAssinatura(j), /com o certificado de .*EMPRESA: TESTE LTDA/);
  // Volta ao outro: a assinatura sai com ele.
  await j.$eval('#certificado', (s, v) => { s.value = v; s.dispatchEvent(new Event('change')); }, titular.valor);
  assert.match(await textoAssinatura(j), /com o certificado de .*TITULAR COM CADEIA/);
  await a.responder(j, '#confirmar');
  assert.deepEqual(await resultado, { ping: 'ok', res: 'ok' });
  body = JSON.parse(envios[1].corpo);
  assert.ok(crypto.verify('md5', Buffer.from(MENSAGEM), publicKey, Buffer.from(body.assinatura, 'base64')));
  assert.deepEqual(corpoPkiPath(body.certChain), Buffer.concat([raizDer, titularDer]));
  assert.deepEqual(localhost, []);
});

// Janela que não pede decisão: só o aviso de certificado sem cadeia.
async function janelaDeAviso() {
  for (const fim = Date.now() + 15000; Date.now() < fim;) {
    for (const p of await a.confirmPages()) {
      if ((await p.$eval('#cadeia', (e) => !e.hidden).catch(() => false))) return p;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('janela do aviso não apareceu');
}

test('certificados sem cadeia (importados antes do PJe): aviso com "Fechar" e nada é assinado', async () => {
  // Os registros perdem a cadeia, como os importados antes desta versão.
  const ext = await h.browser.newPage();
  await ext.goto(h.extUrl('pages/import.html'));
  assert.equal(await ext.evaluate(async () => {
    const { createCerts } = await import('/lib/certs.js');
    const certs = createCerts();
    const lista = await certs.list();
    for (const e of lista) {
      delete e.chainB64;
      await certs.put(e);
    }
    return (await certs.list()).filter((e) => e.chainB64 === undefined).length;
  }), 2);
  await ext.close();

  const { page, localhost, envios, consoleDaPagina } = await abrir(SSO + '/auth/realms/pje/x', { rotas: rotasSso });
  for (let vez = 1; vez <= 2; vez++) {
    // Fechar o aviso não pausa o site: a segunda vez mostra o aviso de novo.
    const resultado = logar(page);
    const j = await janelaDeAviso();
    assert.equal(await j.$eval('#cadeia', (e) => e.textContent),
      'Este certificado foi importado antes do suporte ao PJe. Importe o certificado de novo para usar no PJe.');
    assert.deepEqual(await j.$eval('body', (b) => [...b.querySelectorAll('button')].filter((x) => !x.hidden).map((x) => x.textContent)), ['Fechar']);
    assert.equal(await j.$eval('#origem', (e) => e.hidden), true);
    assert.equal(await j.$eval('#bloco-senha', (e) => e.hidden), true);
    await a.responder(j, '#fechar');
    assert.deepEqual(await resultado, { ping: 'ok', res: 'erro' }, `vez ${vez}`);
  }
  assert.deepEqual(localhost, []);
  assert.equal(envios.length, 0);
  assert.deepEqual(consoleDaPagina.filter((t) => t.includes('[Jamegão]')), []);
});

// Por último: apaga o certificado.
test('nenhum certificado: as chamadas seguem para o localhost, sem janela', async () => {
  await a.limparTudo();
  const { page, localhost, envios } = await abrir(SSO + '/auth/realms/pje/x', { rotas: rotasSso });
  assert.deepEqual(await logar(page), { ping: 'indisponivel', res: 'indisponivel' });
  await a.semJanela(500);
  assert.equal(localhost.length, 2);
  assert.equal(envios.length, 0);
});
