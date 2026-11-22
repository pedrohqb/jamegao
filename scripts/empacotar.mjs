// Gera dist/jamegao-<versão>.zip com o conteúdo de ext/ (manifest.json na raiz do zip).
// Determinístico: entradas ordenadas, data fixa, permissões fixas. Só módulos nativos do Node.
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const ext = join(raiz, 'ext');
const versao = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8')).version;

const TABELA = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABELA[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function listar(dir) {
  const out = [];
  for (const nome of readdirSync(dir).sort()) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...listar(p));
    else out.push(p);
  }
  return out;
}

// 1980-01-01 00:00:00 em formato DOS.
const DOS_HORA = 0;
const DOS_DATA = (0 << 9) | (1 << 5) | 1;

const nomes = listar(ext).map((p) => relative(ext, p).split(sep).join('/')).sort();
const locais = [];
const centrais = [];
let deslocamento = 0;
for (const nome of nomes) {
  const dados = readFileSync(join(ext, nome));
  const comp = deflateRawSync(dados, { level: 9 });
  const [metodo, corpo] = comp.length < dados.length ? [8, comp] : [0, dados];
  const nomeBuf = Buffer.from(nome, 'utf8');
  const crc = crc32(dados);

  const l = Buffer.alloc(30);
  l.writeUInt32LE(0x04034b50, 0);
  l.writeUInt16LE(20, 4);
  l.writeUInt16LE(0x0800, 6); // nomes em UTF-8
  l.writeUInt16LE(metodo, 8);
  l.writeUInt16LE(DOS_HORA, 10);
  l.writeUInt16LE(DOS_DATA, 12);
  l.writeUInt32LE(crc, 14);
  l.writeUInt32LE(corpo.length, 18);
  l.writeUInt32LE(dados.length, 22);
  l.writeUInt16LE(nomeBuf.length, 26);
  l.writeUInt16LE(0, 28);
  locais.push(l, nomeBuf, corpo);

  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0);
  c.writeUInt16LE(20, 4);
  c.writeUInt16LE(20, 6);
  c.writeUInt16LE(0x0800, 8);
  c.writeUInt16LE(metodo, 10);
  c.writeUInt16LE(DOS_HORA, 12);
  c.writeUInt16LE(DOS_DATA, 14);
  c.writeUInt32LE(crc, 16);
  c.writeUInt32LE(corpo.length, 20);
  c.writeUInt32LE(dados.length, 24);
  c.writeUInt16LE(nomeBuf.length, 28);
  c.writeUInt32LE((0o100644 << 16) >>> 0, 38); // atributos externos: arquivo 0644
  c.writeUInt32LE(deslocamento, 42);
  centrais.push(c, nomeBuf);
  deslocamento += 30 + nomeBuf.length + corpo.length;
}
const tamCentral = centrais.reduce((s, b) => s + b.length, 0);
const fim = Buffer.alloc(22);
fim.writeUInt32LE(0x06054b50, 0);
fim.writeUInt16LE(nomes.length, 8);
fim.writeUInt16LE(nomes.length, 10);
fim.writeUInt32LE(tamCentral, 12);
fim.writeUInt32LE(deslocamento, 16);

mkdirSync(join(raiz, 'dist'), { recursive: true });
const saida = join(raiz, 'dist', `jamegao-${versao}.zip`);
writeFileSync(saida, Buffer.concat([...locais, ...centrais, fim]));
console.log(`${relative(raiz, saida)}: ${nomes.length} arquivos`);
