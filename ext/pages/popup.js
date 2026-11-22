// Popup: estado do cofre, certificados e decisões por site. Opera direto nos
// módulos (contexto de página da extensão); nada disso passa por mensagens.
import { createVault } from '../lib/vault.js';
import { createCerts } from '../lib/certs.js';
import { createSites } from '../lib/sites.js';
import { createCredits } from '../lib/credits.js';
import { browserKv } from '../lib/kv.js';
import { avisoValidade } from '../lib/validade.js';

const api = globalThis.browser ?? globalThis.chrome;
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

// Volta o site a "perguntar de novo", sem perder a preferência pela oficial.
async function revogar(origin) {
  const { preferOfficial } = await sites.get(origin);
  await sites.remove(origin);
  if (preferOfficial) await sites.setPreferOfficial(origin, true);
  await credits.clear();
}

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
    li.append(button('remover', 'Remover', async () => { await certs.remove(c.thumbprint); }));
    $('certs').append(li);
  }

  const vistos = await kv.session.get('officialSeen', []);
  const conhecidos = await sites.list();
  const origens = [...new Set([...conhecidos.map((s) => s.origin), ...vistos])].sort();
  $('aviso-oficial').hidden = vistos.length === 0;
  $('sites').replaceChildren();
  for (const origin of origens) {
    const s = await sites.get(origin);
    const li = document.createElement('li');
    li.dataset.origem = origin;
    if (s.allowed === false) li.classList.add('bloqueado');
    const nome = document.createElement('div');
    nome.className = 'nome-site';
    nome.textContent = origin + (s.allowed === false ? ' (bloqueado)' : '');
    li.append(nome);
    li.append(checkbox('permitido', 'Permitido', s.allowed === true, async (on) => {
      if (on) await sites.setAllowed(origin, true);
      else await revogar(origin);
    }));
    li.append(checkbox('oficial', 'Deixar a extensão oficial responder', s.preferOfficial, (on) => sites.setPreferOfficial(origin, on)));
    li.append(s.allowed === false
      ? button('desbloquear', 'Desbloquear', () => revogar(origin))
      : button('bloquear', 'Bloquear', async () => { await sites.setAllowed(origin, false); await credits.clear(); }));
    $('sites').append(li);
  }
}

$('travar').addEventListener('click', () => vault.lock().then(render));
$('importar').addEventListener('click', () => {
  api.tabs.create({ url: api.runtime.getURL('pages/import.html') });
});
$('esqueci').addEventListener('click', () => { $('esqueci-aviso').hidden = false; });
$('cancelar-esqueci').addEventListener('click', () => { $('esqueci-aviso').hidden = true; });
$('apagar-tudo').addEventListener('click', async () => {
  try {
    await vault.destroy();
    for (const c of await certs.list()) await certs.remove(c.thumbprint);
    for (const s of await sites.list()) await sites.remove(s.origin);
    await credits.clear();
    $('esqueci-aviso').hidden = true;
    await render();
    status('ok', 'Cofre e certificados apagados.');
  } catch {
    status('erro', 'Não foi possível apagar tudo.');
  }
});

await render();
