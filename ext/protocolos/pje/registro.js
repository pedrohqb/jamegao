// Ligar e desligar o PJe (desenho, 8.2). O PJe vem desligado: ligar é obter a
// permissão opcional de *.jus.br (permissions.request, que só o gesto do
// usuário pode pedir, por isso fica com quem trata o clique) e então
// registrar os scripts do PJe; desligar é retirá-los e devolver a permissão.
// O e-SAJ segue no manifesto; os seus endereços ficam fora do registro, para
// que os dois protocolos nunca dividam a mesma página.
//
// Os caminhos dos scripts levam a barra inicial: o Firefox resolve os
// relativos a partir da página que registra (do popup, daria em
// pages/protocolos/...).

export const PERMISSAO = { origins: ['https://*.jus.br/*'] };

const PAGINA = 'jamegao-pje-pagina';
const CONTEUDO = 'jamegao-pje-conteudo';
const IDS = [PAGINA, CONTEUDO];

const registradosDe = async (api) => (await api.scripting.getRegisteredContentScripts({ ids: IDS })).map((s) => s.id);

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

const tirarRegistro = async (api) => {
  const ids = await registradosDe(api);
  if (ids.length) await api.scripting.unregisterContentScripts({ ids });
};

// Ligado: a permissão concedida e os dois scripts registrados.
export async function ligado(api) {
  if (!(await api.permissions.contains(PERMISSAO))) return false;
  return (await registradosDe(api)).length === IDS.length;
}

// Registra os dois scripts, trocando o que houver com os mesmos ids.
export async function registrar(api) {
  await tirarRegistro(api);
  await api.scripting.registerContentScripts(scripts(api));
}

// Para o clique em "Usar também no PJe": pede a permissão na hora, sem nada
// esperado antes (os navegadores só a pedem dentro do gesto do usuário), e,
// concedida, registra. Resolve se ligou.
export function ligarNoGesto(api) {
  let pedido;
  try {
    pedido = api.permissions.request(PERMISSAO);
  } catch (err) {
    return Promise.reject(err);
  }
  return pedido.then(async (concedida) => {
    if (concedida) await registrar(api);
    return concedida;
  });
}

// Retira os scripts e tenta devolver a permissão. Se o navegador recusar,
// desligar é só retirar o registro, e a permissão fica.
export async function retirar(api) {
  await tirarRegistro(api);
  try {
    await api.permissions.remove(PERMISSAO);
  } catch {
    // recusa do navegador: a permissão fica
  }
}

// Na inicialização do fundo: com a permissão e sem o registro (ou parte
// dele), registra; sem a permissão e com algum registro, retira.
export async function acertar(api) {
  const concedida = await api.permissions.contains(PERMISSAO);
  const n = (await registradosDe(api)).length;
  if (concedida && n < IDS.length) await registrar(api);
  else if (!concedida && n > 0) await retirar(api);
}
