// Ajudas dos testes do PJe (não é um teste): liga o PJe no navegador de teste
// e abre páginas imitadas do PJe, servidas por interceptação (sem rede).
// O navegador precisa ter sido aberto com launch(..., { pje: true }).
import assert from 'node:assert/strict';

// Liga o PJe como o clique em "Usar também no PJe", menos o pedido de
// permissão (já concedida na cópia de teste): registro.registrar e a escolha
// guardada, a partir de uma página da extensão. Sem a escolha, o fundo
// retiraria o registro na próxima vez que acordasse.
export async function ligarPje(h) {
  const page = await h.browser.newPage();
  try {
    await page.goto(h.extUrl('pages/import.html'));
    await page.evaluate(async () => {
      const { registrar } = await import('/protocolos/pje/registro.js');
      const { idbKv } = await import('/lib/kv.js');
      await registrar(globalThis.browser ?? globalThis.chrome);
      await idbKv().set('pjeLigado', true);
    });
  } finally {
    await page.close();
  }
}

// Página imitada do PJe. `chamar` faz o que a página do PJe faz: carrega uma
// imagem e lê a resposta pelas dimensões (1×1 deu certo, 2×1 deu erro, falha
// de carga = assinador indisponível). Com `prototype`, a página põe
// Array.prototype.toJSON como o Prototype.js, e o JSON.stringify dela
// transforma listas em texto.
export const paginaPje = ({ prototype = false } = {}) => `<!doctype html><meta charset="utf-8"><body><script>
${prototype ? "Array.prototype.toJSON = function () { return '[' + this.map((x) => JSON.stringify(x)).join(',') + ']'; };" : ''}
window.chamar = (url, { img = new Image(), modo = 'src' } = {}) => new Promise((ok) => {
  img.onload = () => ok(img.width === 2 ? 'erro' : 'ok');
  img.onerror = () => ok('indisponivel');
  if (modo === 'atributo') img.setAttribute('src', url); else img.src = url;
});
window.ping = () => 'http://localhost:8800/pjeOffice/?&u=' + Date.now();
window.requisicao = (tarefaId, tarefa, { servidor = location.origin + '/pje', objeto = false } = {}) => {
  const r = { aplicacao: 'PJe', servidor, sessao: document.cookie, codigoSeguranca: 'x', tarefaId,
    tarefa: objeto ? tarefa : JSON.stringify(tarefa) };
  return 'http://127.0.0.1:8800/pjeOffice/requisicao/?r=' + encodeURIComponent(JSON.stringify(r)) + '&u=' + Date.now();
};
</script>`;

// Abre `url` numa aba nova, com a página imitada servida para a origem de
// `url`. Os POST são anotados em `envios` e respondidos por `rotas` (recebe o
// envio e devolve a resposta; sem resposta, 404). As chamadas a :8800 são
// anotadas em `localhost` e abortadas; as que não são POST, para outras
// origens, são anotadas em `outros` e abortadas. As mensagens do console da
// página ficam em `consoleDaPagina`. Com `jamegao: false`, confere que os
// scripts do PJe não estão na página.
// O BiDi do Firefox não dá o corpo de forma síncrona.
const lerCorpo = async (req) => {
  try { return req.postData(); } catch { return req.fetchPostData(); }
};

export async function abrirPje(h, url, { prototype = false, rotas = () => undefined, jamegao = true } = {}) {
  const page = await h.browser.newPage();
  const localhost = [];
  const envios = [];
  const outros = [];
  const consoleDaPagina = [];
  const origem = new URL(url).origin;
  page.on('console', (m) => consoleDaPagina.push(m.text()));
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    const u = req.url();
    // As respostas 1×1 e 2×1 do Jamegão (data:) não saem do navegador.
    if (u.startsWith('data:')) return req.continue();
    if (u.includes(':8800')) { localhost.push(u); return req.abort(); }
    if (req.method() === 'POST') {
      const envio = { url: u, headers: req.headers(), corpo: (await lerCorpo(req)) ?? '' };
      envios.push(envio);
      const r = rotas(envio);
      if (r) return req.respond(r);
      return req.respond({ status: 404, body: '' });
    }
    if (u.startsWith(origem + '/')) return req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: paginaPje({ prototype }) });
    outros.push(u);
    return req.abort();
  });
  await page.goto(url);
  if (jamegao) assert.equal(await page.evaluate(() => window.__jamegaoPje), true, 'os scripts do PJe não estão na página');
  else assert.equal(await page.evaluate(() => window.__jamegaoPje), undefined, 'os scripts do PJe não deveriam estar na página');
  return { page, localhost, envios, outros, consoleDaPagina };
}
