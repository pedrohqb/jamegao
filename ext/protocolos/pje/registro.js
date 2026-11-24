// Ligar e desligar o PJe (desenho, 8.2). O PJe vem desligado: ligar é obter a
// permissão opcional de *.jus.br (permissions.request, que só o gesto do
// usuário pode pedir, por isso fica com quem trata o clique) e então
// registrar os scripts do PJe; desligar é retirá-los e devolver a permissão.
// A escolha do usuário fica guardada (`pjeLigado`, no armazenamento da
// extensão): se o navegador recusar devolver a permissão, é ela que mantém o
// PJe desligado quando o fundo acerta o registro ao iniciar.
// O e-SAJ segue no manifesto; os seus endereços ficam fora do registro, para
// que os dois protocolos nunca dividam a mesma página.
//
// Os caminhos dos scripts levam a barra inicial: o Firefox resolve os
// relativos a partir da página que registra (do popup, daria em
// pages/protocolos/...).
import { idbKv } from '../../lib/kv.js';

export const PERMISSAO = { origins: ['https://*.jus.br/*'] };

const CHAVE = 'pjeLigado';
const PAGINA = 'jamegao-pje-pagina';
const CONTEUDO = 'jamegao-pje-conteudo';
const IDS = [PAGINA, CONTEUDO];

const registradosDe = async (api) => (await api.scripting.getRegisteredContentScripts({ ids: IDS })).map((s) => s.id);
const escolhido = async (kv) => (await kv.get(CHAVE, false)) === true;

const scripts = (api) => {
  const comum = {
    matches: [...PERMISSAO.origins],
    excludeMatches: api.runtime.getManifest().content_scripts[0].matches,
    runAt: 'document_start',
    allFrames: true,
    persistAcrossSessions: true,
  };
  return [
    { id: PAGINA, world: 'MAIN', js: ['/protocolos/pje/pagina.js'], ...comum },
    { id: CONTEUDO, js: ['/conteudo/ponte.js', '/protocolos/pje/conteudo.js'], ...comum },
  ];
};

// Tira o que houver registrado. Outro contexto (o fundo que acaba de acordar,
// ou o popup) pode ter tirado antes: só falha se ainda sobrar registro.
const tirarRegistro = async (api) => {
  const ids = await registradosDe(api);
  if (!ids.length) return;
  try {
    await api.scripting.unregisterContentScripts({ ids });
  } catch (err) {
    if ((await registradosDe(api)).length) throw err;
  }
};

// Ligado: escolhido pelo usuário, com a permissão e os dois scripts registrados.
export async function ligado(api, kv = idbKv()) {
  if (!(await escolhido(kv))) return false;
  if (!(await api.permissions.contains(PERMISSAO))) return false;
  return (await registradosDe(api)).length === IDS.length;
}

// Registra os dois scripts, trocando o que houver com os mesmos ids. Se outro
// contexto registrou no meio do caminho ("Duplicate script ID"), o registro
// dele vale.
export async function registrar(api) {
  await tirarRegistro(api);
  try {
    await api.scripting.registerContentScripts(scripts(api));
  } catch (err) {
    if ((await registradosDe(api)).length !== IDS.length) throw err;
  }
}

// Para o clique em "Usar também no PJe": pede a permissão na hora, sem nada
// esperado antes (os navegadores só a pedem dentro do gesto do usuário), e,
// concedida, registra e guarda a escolha. Resolve se ligou.
export function ligarNoGesto(api, kv = idbKv()) {
  let pedido;
  try {
    pedido = api.permissions.request(PERMISSAO);
  } catch (err) {
    return Promise.reject(err);
  }
  return pedido.then(async (concedida) => {
    if (!concedida) return false;
    await registrar(api);
    await kv.set(CHAVE, true);
    return true;
  });
}

// Desligar: guarda a escolha primeiro, retira os scripts e tenta devolver a
// permissão. Se o navegador recusar, a permissão fica, e a escolha guardada
// mantém o PJe desligado.
export async function retirar(api, kv = idbKv()) {
  await kv.set(CHAVE, false);
  await tirarRegistro(api);
  try {
    await api.permissions.remove(PERMISSAO);
  } catch {
    // recusa do navegador: a permissão fica
  }
}

// Na inicialização do fundo:
//   - escolhido e com a permissão: registra o que faltar;
//   - escolhido, mas a permissão sumiu (o usuário a tirou no navegador):
//     desfaz a escolha e retira os scripts;
//   - não escolhido: retira os scripts que houver, sem mexer na permissão.
export async function acertar(api, kv = idbKv()) {
  const quer = await escolhido(kv);
  const concedida = await api.permissions.contains(PERMISSAO);
  const n = (await registradosDe(api)).length;
  if (quer && concedida) {
    if (n < IDS.length) await registrar(api);
    return;
  }
  if (quer) await kv.set(CHAVE, false);
  if (n > 0) await tirarRegistro(api);
}
