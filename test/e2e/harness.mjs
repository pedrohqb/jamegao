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

// UUID fixo da extensão no Firefox (o Firefox sorteia um por instalação; o
// mapa extensions.webextensions.uuids o fixa para que extUrl seja previsível).
export const FIREFOX_UUID = '85f92c19-fa19-458c-a644-199f3699eefb';

const geckoId = (dir) => {
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const id = m.browser_specific_settings?.gecko?.id;
  if (!id) throw new Error(`${dir}/manifest.json precisa de browser_specific_settings.gecko.id para o Firefox`);
  return id;
};

// Abre o navegador com a extensão (e as extras) carregadas. Devolve o
// navegador e o que muda entre Chrome e Firefox: extUrl e o "esperar a
// extensão ficar pronta".
async function abrirNavegador(name, { userDataDir, extras }, extDir) {
  if (name === 'chrome') {
    const browser = await puppeteer.launch({
      executablePath: process.env.CHROME || '/usr/bin/google-chrome',
      headless: true,
      ...(userDataDir ? { userDataDir } : {}),
      args: ['--no-sandbox', `--disable-extensions-except=${[extDir, ...extras].join(',')}`, `--load-extension=${[extDir, ...extras].join(',')}`],
    });
    try {
      // Service worker de background.js = extensão pronta.
      const sw = await browser.waitForTarget(
        (t) => t.type() === 'service_worker' && t.url().includes('background.js'),
        { timeout: 15000 },
      );
      const extId = new URL(sw.url()).host;
      return { browser, extUrl: (p) => `chrome-extension://${extId}/${String(p).replace(/^\//, '')}` };
    } catch (err) {
      await browser.close().catch(() => {});
      throw err;
    }
  }

  // Firefox: WebDriver BiDi; extensões entram como temporárias, por
  // browser.installExtension (equivale a "Carregar extensão temporária").
  const executablePath = process.env.FIREFOX_BIN;
  if (!executablePath) {
    throw new Error('Defina FIREFOX_BIN com o caminho do executável do Firefox (versão 128 ou mais nova), '
      + 'por exemplo: BROWSER=firefox FIREFOX_BIN=/usr/bin/firefox npm run e2e');
  }
  const browser = await puppeteer.launch({
    browser: 'firefox',
    protocol: 'webDriverBiDi',
    executablePath,
    headless: !process.env.HEADFUL,
    ...(userDataDir ? { userDataDir } : {}),
    extraPrefsFirefox: {
      'extensions.webextensions.uuids': JSON.stringify({ [geckoId(EXT)]: FIREFOX_UUID }),
    },
  });
  try {
    await browser.installExtension(extDir);
    for (const extra of extras) await browser.installExtension(extra);
    return { browser, extUrl: (p) => `moz-extension://${FIREFOX_UUID}/${String(p).replace(/^\//, '')}` };
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }
}

export async function launch(name = 'chrome', { userDataDir, extras = [] } = {}) {
  if (name !== 'chrome' && name !== 'firefox') throw new Error('Navegador desconhecido: ' + name);

  const extDir = await makeTestExtension();
  const server = await startServer();
  const origin = `http://localhost:${server.address().port}`;
  let browser;
  let extUrl;
  try {
    ({ browser, extUrl } = await abrirNavegador(name, { userDataDir, extras }, extDir));
  } catch (err) {
    server.close();
    throw err;
  }
  try {
    // onInstalled abre pages/import.html; as páginas de teste não querem essa aba extra.
    try {
      const t = await browser.waitForTarget(
        (x) => x.type() === 'page' && x.url().startsWith(extUrl('')) && x.url().includes('import.html'),
        { timeout: name === 'firefox' ? 8000 : 4000 },
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
    return { browser, origin, extUrl, waitForExtPage, importPfx, close, name };
  } catch (err) {
    await browser.close().catch(() => {});
    server.close();
    throw err;
  }
}
