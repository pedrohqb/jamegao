// Popup: estado do cofre, certificados, decisões por site e o PJe. Opera
// direto nos módulos (contexto de página da extensão); nada disso passa por
// mensagens.
import { createVault } from '../lib/vault.js';
import { createCerts } from '../lib/certs.js';
import { createSites } from '../lib/sites.js';
import { createCredits } from '../lib/credits.js';
import { browserKv } from '../lib/kv.js';
import { avisoValidade } from '../lib/validade.js';
import { ligado, ligarNoGesto, retirar } from '../protocolos/pje/registro.js';


const api = globalThis.browser ?? globalThis.chrome;
// O Chrome recente também expõe `browser`; só o Firefox tem getBrowserInfo.
const CHROMIUM = typeof api.runtime.getBrowserInfo !== 'function';
const $ = (id) => document.getElementById(id);
const kv = browserKv();
const now = () => Date.now();
const vault = createVault({ local: kv.local, session: kv.session, now });
const certs = createCerts();
const sites = createSites(kv);
const credits = createCredits({ session: kv.session, now });

const status = (cls, msg) => {
  $('status').className = cls;
  $('status').textContent = msg;
};
const button = (cls, text, onClick) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  b.addEventListener('click', () => onClick().then(render, () => status('erro', 'Não foi possível concluir a ação.')));
  return b;
};
const checkbox = (cls, label, checked, onChange) => {
  const l = document.createElement('label');
  const i = document.createElement('input');
  i.type = 'checkbox';
  i.className = cls;
  i.checked = checked;
  i.addEventListener('change', () => onChange(i.checked).then(render, () => status('erro', 'Não foi possível concluir a ação.')));
  l.append(i, ' ' + label);
  return l;
};

// O PJe usa a cadeia do certificado, guardada na importação desde que o PJe
// existe (titular primeiro).
const marcaPje = (c) => {
  if (!Array.isArray(c.chainB64) || c.chainB64.length === 0) return 'Importe de novo para usar no PJe.';
  if (c.chainB64.length === 1) {
    return 'O arquivo deste certificado não trouxe as autoridades certificadoras; o PJe pode recusá-lo. '
      + 'Peça à certificadora o arquivo PFX com a cadeia completa.';
  }
  return null;
};

// Volta o site a "perguntar de novo".
async function revogar(origin) {
  await sites.remove(origin);
  await credits.clear();
}

let renderizacoes = 0;
async function render() {
  const lista = await certs.list();
  const unlocked = lista.length > 0 && (await vault.isUnlocked());
  const estado = lista.length === 0 ? 'sem-certificado' : unlocked ? 'destravado' : 'travado';
  $('estado').dataset.estado = estado;
  $('estado').textContent = { 'sem-certificado': 'nenhum certificado importado', destravado: 'destravado', travado: 'travado' }[estado];
  $('travar').hidden = !unlocked;

  $('certs').replaceChildren();
  for (const c of lista) {
    const li = document.createElement('li');
    const nome = document.createElement('span');
    nome.textContent = `${c.model.subjectName} (válido até ${c.model.validityEnd.slice(0, 10)})`;
    li.append(nome);
    const aviso = avisoValidade(c.model.validityEnd);
    if (aviso) {
      li.classList.add(aviso.tipo === 'vencido' ? 'vencido' : 'vence-logo');
      const a = document.createElement('div');
      a.textContent = aviso.texto;
      li.append(a);
    }
    const pje = marcaPje(c);
    if (pje) {
      const m = document.createElement('div');
      m.className = 'pje-cadeia';
      m.textContent = pje;
      li.append(m);
    }
    li.append(button('remover', 'Remover', async () => { await certs.remove(c.thumbprint); }));
    $('certs').append(li);
  }

  const vistos = await kv.session.get('officialSeen', []);
  const conhecidos = await sites.list();
  const origens = [...new Set([...conhecidos.map((s) => s.origin), ...vistos])].sort();
  $('aviso-oficial').hidden = vistos.length === 0;
  $('aviso-oficial-sites').textContent = vistos.join(', ');
  $('sites').replaceChildren();
  for (const origin of origens) {
    const s = await sites.get(origin);
    const li = document.createElement('li');
    li.dataset.origem = origin;
    if (s.allowed === false) li.classList.add('bloqueado');
    const nome = document.createElement('div');
    nome.className = 'nome-site';
    nome.textContent = origin + (s.allowed === false ? ' (bloqueado)' : vistos.includes(origin) ? ' (extensão oficial)' : '');
    li.append(nome);
    li.append(checkbox('permitido', 'Permitido', s.allowed === true, async (on) => {
      if (on) await sites.setAllowed(origin, true);
      else await revogar(origin);
    }));
    li.append(s.allowed === false
      ? button('desbloquear', 'Desbloquear', () => revogar(origin))
      : button('bloquear', 'Bloquear', async () => { await sites.setAllowed(origin, false); await credits.clear(); }));
    $('sites').append(li);
  }
  $('pje-ligar').checked = await ligado(api).catch(() => false);
  // No Chromium, *.jus.br aparece no pedido de permissão como "qualquer site"
  // (jus.br é sufixo público, como com.br). O Firefox mostra o domínio.
  $('pje-chromium').hidden = CHROMIUM === false || $('pje-ligar').checked;
  const recusadas = await kv.session.get('pjeRecusadas', []);
  $('pje-recusadas').replaceChildren(...recusadas.map(({ origin, tarefa }) => {
    const li = document.createElement('li');
    li.textContent = `O PJe pediu uma operação que o Jamegão ainda não faz: ${tarefa} em ${origin}.`;
    return li;
  }));

  // Contador de renderizações concluídas (os testes esperam por ele).
  document.body.dataset.render = String(++renderizacoes);
}

// Travar também descarta os créditos: um lote interrompido recomeça pedindo
// a senha junto com o que será assinado.
$('travar').addEventListener('click', () => vault.lock().then(() => credits.clear()).then(render));
$('importar').addEventListener('click', () => {
  api.tabs.create({ url: api.runtime.getURL('pages/import.html') });
});
// Ligar pede a permissão de *.jus.br no próprio clique (o navegador só a pede
// dentro do gesto do usuário); só as páginas do PJe carregadas depois têm o
// Jamegão.
$('pje-ligar').addEventListener('click', () => {
  const caixa = $('pje-ligar');
  const acao = caixa.checked
    ? ligarNoGesto(api).then((ligou) => { $('pje-aviso').hidden = !ligou; $('pje-chromium').hidden = !CHROMIUM || ligou; })
    : retirar(api).then(() => { $('pje-aviso').hidden = true; $('pje-chromium').hidden = !CHROMIUM; });
  caixa.disabled = true;
  acao
    .catch(() => status('erro', 'Não foi possível concluir a ação.'))
    .then(render)
    .finally(() => { caixa.disabled = false; });
});
$('esqueci').addEventListener('click', () => { $('esqueci-aviso').hidden = false; });
$('cancelar-esqueci').addEventListener('click', () => { $('esqueci-aviso').hidden = true; });
$('apagar-tudo').addEventListener('click', async () => {
  // Cofre por último: se algo falhar antes, a senha ainda abre o que sobrou.
  const passos = [
    ['certificados', async () => { for (const c of await certs.list()) await certs.remove(c.thumbprint); }],
    ['sites', async () => { for (const s of await sites.list()) await sites.remove(s.origin); }],
    ['créditos', () => credits.clear()],
    ['cofre', async () => { await vault.destroy(); await kv.local.remove('lockout'); }],
  ];
  const falhas = [];
  for (const [nome, fn] of passos) {
    try { await fn(); } catch { falhas.push(nome); }
  }
  $('esqueci-aviso').hidden = true;
  await render();
  if (falhas.length) status('erro', `Não foi possível apagar: ${falhas.join(', ')}. Tente de novo.`);
  else status('ok', 'Cofre e certificados apagados.');
});

await render();
