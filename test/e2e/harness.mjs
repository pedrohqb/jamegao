// Infraestrutura dos testes de ponta a ponta: abre o navegador com a extensão
// carregada e serve test/www por HTTP local.
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../..');
export const EXT = path.join(ROOT, 'ext');
export const WWW = path.join(ROOT, 'test/www');
export const FIX = path.join(ROOT, 'test/fix');
// Extensão "oficial" falsa, para os testes de convivência (passe-a em extras).
export const OFICIAL_FALSA = path.join(ROOT, 'test/oficial-falsa');

const tmpDirs = [];

// Cópia de ext/ numa pasta temporária, com http://localhost/* nos "matches"
// do content script (o manifesto de produção só cobre sites .jus.br).
export async function makeTestExtension() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jamegao-ext-'));
  tmpDirs.push(dir);
  fs.cpSync(EXT, dir, { recursive: true });
  const file = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const cs of manifest.content_scripts) cs.matches.push('http://localhost/*', 'http://127.0.0.1/*');
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  return dir;
}

const startServer = async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/$/, '/index.html');
    const file = path.join(WWW, rel);
    if (!file.startsWith(WWW) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html' });
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
};

export async function launch(name = 'chrome', { userDataDir, extras = [] } = {}) {
  if (name === 'firefox') throw new Error('Firefox não disponível neste ambiente');
  if (name !== 'chrome') throw new Error('Navegador desconhecido: ' + name);

  const extDir = await makeTestExtension();
  const server = await startServer();
  const origin = `http://localhost:${server.address().port}`;
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    headless: true,
    ...(userDataDir ? { userDataDir } : {}),
    args: ['--no-sandbox', `--disable-extensions-except=${[extDir, ...extras].join(',')}`, `--load-extension=${[extDir, ...extras].join(',')}`],
  });
  try {
    const sw = await browser.waitForTarget(
      (t) => t.type() === 'service_worker' && t.url().includes('background.js'),
      { timeout: 15000 },
    );
    const extId = new URL(sw.url()).host;
    const extUrl = (p) => `chrome-extension://${extId}/${String(p).replace(/^\//, '')}`;

    // onInstalled abre pages/import.html; as páginas de teste não querem essa aba extra.
    try {
      const t = await browser.waitForTarget(
        (x) => x.type() === 'page' && x.url().startsWith(extUrl('')) && x.url().includes('import.html'),
        { timeout: 4000 },
      );
      await (await t.page()).close();
    } catch {
      // perfil já instalado: não há aba de primeira execução
    }

    const waitForExtPage = async (fragment, timeoutMs = 15000) => {
      const target = await browser.waitForTarget(
        (t) => t.type() === 'page' && t.url().startsWith(extUrl('')) && t.url().includes(fragment),
        { timeout: timeoutMs },
      );
      return target.page();
    };

    // Importa um PFX pela página de importação (cria o cofre se preciso).
    const importPfx = async (file, pfxPassword, vaultPassword) => {
      const page = await browser.newPage();
      try {
        await page.goto(extUrl('pages/import.html'));
        await page.waitForSelector('#importar');
        await (await page.$('#arquivo')).uploadFile(file);
        await page.$eval('#senha-pfx', (el, v) => { el.value = v; }, pfxPassword);
        await page.$eval('#senha-cofre', (el, v) => { el.value = v; }, vaultPassword);
        await page.$eval('#senha-cofre-2', (el, v) => { el.value = v; }, vaultPassword);
        await page.click('#importar');
        await page.waitForSelector('#status.ok, #status.erro');
        const r = await page.$eval('#status', (el) => ({ cls: el.className, texto: el.textContent }));
        if (r.cls !== 'ok') throw new Error('importação falhou: ' + r.texto);
      } finally {
        await page.close();
      }
    };

    const close = async () => {
      await browser.close().catch(() => {});
      server.close();
      for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
    };
    return { browser, origin, extUrl, waitForExtPage, importPfx, close };
  } catch (err) {
    await browser.close().catch(() => {});
    server.close();
    throw err;
  }
}
