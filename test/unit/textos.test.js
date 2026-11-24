import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const ext = join(raiz, 'ext');
const ler = (f) => readFileSync(join(raiz, f), 'utf8');

function listar(dir) {
  const out = [];
  for (const nome of readdirSync(dir).sort()) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...listar(p));
    else out.push(p);
  }
  return out;
}
const rel = (p) => relative(ext, p).split(sep).join('/');

// protocolos/esaj/conteudo.js e lib/protocol.js carregam os identificadores técnicos do protocolo
// (IDs oficiais das extensões e prefixos de evento com o nome das marcas): são
// strings de fio, não texto voltado ao usuário. vendor/ é código de terceiros.
const EXCLUIDOS = new Set(['protocolos/esaj/conteudo.js', 'lib/protocol.js']);
const MARCAS = /websigner|web ?pki|softplan|lacuna/i;

// Comentários de código não chegam ao usuário.
function semComentarios(js) {
  return js
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
}

test('nenhum texto voltado ao usuário cita as marcas', () => {
  const arquivos = ['ext/manifest.json', 'docs/lojas/descricao.md', 'docs/lojas/roteiro-de-envio.md', 'PRIVACIDADE.md', 'README.md'];
  const textos = new Map(arquivos.map((f) => [f, ler(f)]));
  for (const p of listar(ext)) {
    const r = rel(p);
    if (r.startsWith('vendor/') || EXCLUIDOS.has(r)) continue;
    if (r.endsWith('.html')) textos.set('ext/' + r, readFileSync(p, 'utf8'));
    else if (r.endsWith('.js')) textos.set('ext/' + r, semComentarios(readFileSync(p, 'utf8')));
  }
  for (const [f, t] of textos) assert.doesNotMatch(t, MARCAS, f);
});

test('manifesto declara ícones que existem nos quatro tamanhos', () => {
  const m = JSON.parse(ler('ext/manifest.json'));
  for (const mapa of [m.icons, m.action.default_icon]) {
    assert.deepEqual(Object.keys(mapa).sort(), ['128', '16', '32', '48']);
    for (const [tam, caminho] of Object.entries(mapa)) {
      const png = readFileSync(join(ext, caminho));
      assert.equal(png.subarray(1, 4).toString(), 'PNG', caminho);
      assert.equal(png.readUInt32BE(16), Number(tam), caminho);
      assert.equal(png.readUInt32BE(20), Number(tam), caminho);
    }
  }
});

// Leitor mínimo de zip (diretório central + deflate/stored).
function lerZip(buf) {
  const fim = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const n = buf.readUInt16LE(fim + 10);
  let o = buf.readUInt32LE(fim + 16);
  const itens = new Map();
  for (let i = 0; i < n; i++) {
    assert.equal(buf.readUInt32LE(o), 0x02014b50);
    const metodo = buf.readUInt16LE(o + 10);
    const csize = buf.readUInt32LE(o + 20);
    const nomeLen = buf.readUInt16LE(o + 28);
    const extraLen = buf.readUInt16LE(o + 30);
    const comLen = buf.readUInt16LE(o + 32);
    const local = buf.readUInt32LE(o + 42);
    const nome = buf.toString('utf8', o + 46, o + 46 + nomeLen);
    const dados0 = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const bruto = buf.subarray(dados0, dados0 + csize);
    itens.set(nome, metodo === 8 ? inflateRawSync(bruto) : bruto);
    o += 46 + nomeLen + extraLen + comLen;
  }
  return itens;
}

test('pacote contém exatamente os arquivos de ext/, de forma determinística', () => {
  const versao = JSON.parse(ler('ext/manifest.json')).version;
  const saida = join(raiz, 'dist', `jamegao-${versao}.zip`);
  const gerar = () => {
    if (existsSync(saida)) rmSync(saida);
    execFileSync('node', [join(raiz, 'scripts/empacotar.mjs')], { cwd: raiz });
    return readFileSync(saida);
  };
  const a = gerar();
  const zip = lerZip(a);
  const esperado = listar(ext).map(rel).sort();
  assert.deepEqual([...zip.keys()], esperado);
  assert.ok(zip.has('manifest.json'));
  for (const [nome, dados] of zip) {
    const orig = readFileSync(join(ext, nome));
    assert.equal(createHash('sha256').update(dados).digest('hex'),
      createHash('sha256').update(orig).digest('hex'), nome);
  }
  assert.ok(a.equals(gerar()), 'duas execuções devem gerar o mesmo zip');
  // unzip -t, se existir, valida a estrutura.
  try { execFileSync('unzip', ['-tq', saida], { stdio: 'pipe' }); } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
});

test('PRIVACIDADE.md e README.md existem e dizem o essencial', () => {
  const p = ler('PRIVACIDADE.md');
  assert.match(p, /não coleta/i);
  assert.match(p, /github\.com\/pedrohqb\/jamegao\/issues/);
  const r = ler('README.md');
  for (const c of ['npm run preparar', 'npm run unit', 'BROWSER=chrome npm run e2e', 'npm run empacotar', 'GPL-3.0'])
    assert.ok(r.includes(c), c);
});
