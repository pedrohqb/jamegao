// Janela de confirmação. Só lê o pedido pelo id (origem e titular vêm do
// fundo, nunca da página) e responde com a decisão do usuário.
import { avisoValidade } from '../lib/validade.js';
const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get('id');
let finished = false;
let answering = false;

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

const botoes = (disabled) => { for (const b of ['confirmar', 'recusar', 'bloquear']) $(b).disabled = disabled; };

async function responder(allow, block = false) {
  answering = true;
  botoes(true);
  try {
    const r = await send({ type: 'prompt-answer', allow, block, password: allow ? $('senha').value : undefined });
    if (r && r.error === 'senha') {
      const espera = r.waitMs > 0 ? ` Aguarde ${Math.ceil(r.waitMs / 1000)} s para tentar de novo.` : '';
      status('erro', 'Senha do cofre incorreta.' + espera);
      $('senha').value = '';
      $('senha').focus();
      answering = false;
      botoes(false);
      return;
    }
    $('senha').value = '';
    const aviso = r?.expired ? 'O pedido expirou. Repita a operação no site.'
      : r?.error === 'bloqueio' ? 'Pedido recusado, mas não foi possível gravar o bloqueio. Bloqueie o site pelo ícone do Jamegão.'
        : r?.error === 'interno' ? 'Não foi possível registrar a autorização. Repita a operação no site.'
          : null;
    if (aviso) {
      status('erro', aviso);
      finished = true; // já resolvido no fundo; fechar não recusa de novo
      setTimeout(() => window.close(), 4000);
      return;
    }
    shut();
  } catch {
    status('erro', 'Falha ao falar com a extensão.');
    answering = false;
    botoes(false);
  }
}

// Evita clique duplo logo na abertura.
$('confirmar').disabled = true;
setTimeout(() => { if (!answering) $('confirmar').disabled = false; }, 500);
$('confirmar').addEventListener('click', () => responder(true));
$('recusar').addEventListener('click', () => responder(false));
$('bloquear').addEventListener('click', () => responder(false, true));
$('senha').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('confirmar').disabled) responder(true); });
// Fechar a janela sem responder equivale a recusar.
window.addEventListener('pagehide', () => {
  if (!finished) api.runtime.sendMessage({ type: 'prompt-abandon', id }).catch(() => {});
});
init().catch(() => status('erro', 'Falha ao carregar o pedido.'));
