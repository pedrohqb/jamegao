// Janela de confirmação. Só lê o pedido pelo id (origem e titular vêm do
// fundo, nunca da página) e responde com a decisão do usuário.
import { avisoValidade } from '../lib/validade.js';
const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get('id');
let finished = false;

const status = (cls, msg) => {
  $('status').className = cls;
  $('status').textContent = msg;
};
const send = (msg) => api.runtime.sendMessage({ ...msg, id });
const shut = () => { finished = true; window.close(); };

async function init() {
  const d = await send({ type: 'prompt-describe' });
  if (!d) return shut();
  $('origem').textContent = `O site ${d.origin} está pedindo autorização.`;
  if (d.needs.site) {
    $('site').hidden = false;
    $('site').textContent = `Permitir que ${d.origin} veja e use os certificados importados no Jamegão?`;
  }
  if (d.needs.sign) {
    const n = d.needs.sign.count;
    $('assinatura').hidden = false;
    $('assinatura').textContent = `Assinar ${n} ${n === 1 ? 'documento' : 'documentos'} com o certificado de ${d.subject ?? 'titular desconhecido'}.`;
    const aviso = d.validityEnd ? avisoValidade(d.validityEnd) : null;
    if (aviso) {
      $('vencimento').hidden = false;
      $('vencimento').textContent = 'Atenção: ' + aviso.texto;
    }
  }
  if (d.needs.unlock) {
    $('bloco-senha').hidden = false;
    $('senha').focus();
  }
}

async function responder(allow) {
  $('confirmar').disabled = $('recusar').disabled = true;
  try {
    const r = await send({ type: 'prompt-answer', allow, password: $('senha').value });
    if (r && r.error === 'senha') {
      const espera = r.waitMs > 0 ? ` Aguarde ${Math.ceil(r.waitMs / 1000)} s para tentar de novo.` : '';
      status('erro', 'Senha do cofre incorreta.' + espera);
      $('senha').value = '';
      $('senha').focus();
      $('confirmar').disabled = $('recusar').disabled = false;
      return;
    }
    $('senha').value = '';
    shut();
  } catch {
    status('erro', 'Falha ao falar com a extensão.');
    $('confirmar').disabled = $('recusar').disabled = false;
  }
}

$('confirmar').addEventListener('click', () => responder(true));
$('recusar').addEventListener('click', () => responder(false));
$('senha').addEventListener('keydown', (e) => { if (e.key === 'Enter') responder(true); });
// Fechar a janela sem responder equivale a recusar.
window.addEventListener('pagehide', () => {
  if (!finished) api.runtime.sendMessage({ type: 'prompt-abandon', id }).catch(() => {});
});
init().catch(() => status('erro', 'Falha ao carregar o pedido.'));
