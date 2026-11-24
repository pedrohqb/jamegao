// Página de importação de certificado (primeira execução e importações seguintes).
import { parsePfx } from '../lib/pfx.js';
import { buildModel, thumbprintOf } from '../lib/certmodel.js';
import { createCerts } from '../lib/certs.js';
import { createVault } from '../lib/vault.js';
import { browserKv } from '../lib/kv.js';
import { bytesToB64 } from '../lib/bytes.js';

const $ = (id) => document.getElementById(id);
const kv = browserKv();
const vault = createVault({ local: kv.local, session: kv.session, now: () => Date.now() });
const certs = createCerts();

const status = (cls, msg) => {
  $('status').className = cls;
  $('status').textContent = msg;
};

async function refreshVaultFields() {
  const exists = await vault.exists();
  const unlocked = exists && (await vault.isUnlocked());
  $('senha-cofre-2').hidden = exists;
  $('rotulo-cofre-2').hidden = exists;
  $('senha-cofre').hidden = unlocked;
  $('rotulo-cofre').hidden = unlocked;
  $('rotulo-cofre').textContent = exists ? 'Senha do cofre' : 'Crie uma senha para o cofre (mínimo de 8 caracteres)';
}

async function refreshList() {
  const list = $('certs');
  list.replaceChildren();
  for (const c of await certs.list()) {
    const li = document.createElement('li');
    li.textContent = `${c.model.subjectName} (válido até ${c.model.validityEnd.slice(0, 10)})`;
    list.append(li);
  }
}

async function unlockOrCreate() {
  if (!(await vault.exists())) {
    const a = $('senha-cofre').value;
    if (a.length < 8) throw new Error('A senha do cofre precisa ter pelo menos 8 caracteres.');
    if (a !== $('senha-cofre-2').value) throw new Error('As senhas do cofre não conferem.');
    await vault.create(a);
    return;
  }
  if (await vault.isUnlocked()) return;
  const r = await vault.unlock($('senha-cofre').value);
  if (!r.ok) {
    const espera = r.waitMs > 0 ? ` Aguarde ${Math.ceil(r.waitMs / 1000)} s para tentar de novo.` : '';
    throw new Error('Senha do cofre incorreta.' + espera);
  }
}

async function importar() {
  const file = $('arquivo').files[0];
  if (!file) return status('erro', 'Escolha o arquivo do certificado.');
  $('importar').disabled = true;
  let pkcs8 = null;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed = parsePfx(forge, bytes, $('senha-pfx').value);
    pkcs8 = parsed.pkcs8;
    await unlockOrCreate();
    const thumbprint = await thumbprintOf(parsed.certDer);
    const model = buildModel(forge, parsed.cert, thumbprint);
    const key = await vault.encrypt(pkcs8);
    await certs.put({
      thumbprint, model, certB64: bytesToB64(parsed.certDer), chainB64: parsed.chainDer.map(bytesToB64), key, importedAt: Date.now(),
    });
    $('arquivo').value = '';
    status('ok', `Certificado de ${model.subjectName} importado.`);
  } catch (err) {
    status('erro', err && err.message === 'senha-curta' ? 'A senha do cofre precisa ter pelo menos 8 caracteres.' : (err && err.message) || 'Falha ao importar o certificado.');
  } finally {
    if (pkcs8) pkcs8.fill(0);
    for (const id of ['senha-pfx', 'senha-cofre', 'senha-cofre-2']) $(id).value = '';
    $('importar').disabled = false;
    await refreshVaultFields();
    await refreshList();
  }
}

const area = $('area');
area.addEventListener('dragover', (e) => { e.preventDefault(); area.classList.add('sobre'); });
area.addEventListener('dragleave', () => area.classList.remove('sobre'));
area.addEventListener('drop', (e) => {
  e.preventDefault();
  area.classList.remove('sobre');
  if (e.dataTransfer && e.dataTransfer.files.length) $('arquivo').files = e.dataTransfer.files;
});
$('importar').addEventListener('click', importar);

await refreshVaultFields();
await refreshList();
