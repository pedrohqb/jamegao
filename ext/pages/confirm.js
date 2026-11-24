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
// Numa aba (Firefox do Android, sem api.windows), window.close() não fecha o
// que o script não abriu; aí a própria aba se remove. No computador a
// confirmação é sempre uma janela, e basta window.close().
const fechar = () => {
  window.close();
  if (api.windows) return;
  setTimeout(() => {
    Promise.resolve(api.tabs?.getCurrent?.()).then((t) => t && api.tabs.remove(t.id)).catch(() => {});
  }, 200);
};
const shut = () => { finished = true; fechar(); };

// O texto do que será assinado; sem `sistema`, é o do e-SAJ.
function textoAssinatura(d, titular) {
  const { count: n, sistema, motivo } = d.needs.sign;
  if (!sistema) return `Assinar ${n} ${n === 1 ? 'documento' : 'documentos'} com o certificado de ${titular}.`;
  if (motivo === 'login') return `Entrar no ${sistema} de ${d.origin} com o certificado de ${titular}.`;
  return `Assinar ${n} ${n === 1 ? 'documento' : 'documentos'} no ${sistema} de ${d.origin} com o certificado de ${titular}.`;
}

function mostrarAssinatura(d, subject, validityEnd) {
  $('assinatura').hidden = false;
  $('assinatura').textContent = textoAssinatura(d, subject ?? 'titular desconhecido');
  const aviso = validityEnd ? avisoValidade(validityEnd) : null;
  $('vencimento').hidden = !aviso;
  $('vencimento').textContent = aviso ? 'Atenção: ' + aviso.texto : '';
}

// Certificado importado antes do suporte ao PJe: só o aviso e "Fechar".
function mostrarCadeia() {
  for (const b of ['origem', 'confirmar', 'recusar', 'bloquear']) $(b).hidden = true;
  $('cadeia').hidden = false;
  $('cadeia').textContent = 'Este certificado foi importado antes do suporte ao PJe. Importe o certificado de novo para usar no PJe.';
  $('fechar').hidden = false;
}

async function init() {
  const d = await send({ type: 'prompt-describe' });
  if (!d) return shut();
  if (d.needs.aviso) return mostrarCadeia();
  $('origem').textContent = `O site ${d.origin} está pedindo autorização.`;
  if (d.needs.site) {
    $('site').hidden = false;
    $('site').textContent = `Permitir que ${d.origin} veja e use os certificados importados no Jamegão?`;
  }
  let titular = { subject: d.subject, validityEnd: d.validityEnd };
  if (d.needs.escolher && Array.isArray(d.opcoes)) {
    const sel = $('certificado');
    for (const o of d.opcoes) {
      const opt = document.createElement('option');
      opt.value = o.thumbprint;
      opt.textContent = `${o.subject ?? 'titular desconhecido'} (válido até ${o.validityEnd ? o.validityEnd.slice(0, 10) : '?'})`;
      opt.selected = o.thumbprint === d.needs.escolher.marcado;
      sel.append(opt);
    }
    $('bloco-certificado').hidden = false;
    // O texto acompanha o certificado selecionado.
    const selecionado = () => d.opcoes.find((x) => x.thumbprint === sel.value);
    titular = selecionado() ?? titular;
    sel.addEventListener('change', () => {
      const o = selecionado();
      if (o && d.needs.sign) mostrarAssinatura(d, o.subject, o.validityEnd);
    });
  }
  if (d.needs.sign) mostrarAssinatura(d, titular.subject, titular.validityEnd);
  if (d.needs.programa) $('programa').hidden = false;
  if (d.needs.unlock) {
    $('bloco-senha').hidden = false;
    $('senha').focus();
  }
}

const botoes = (disabled) => {
  for (const b of ['confirmar', 'recusar', 'bloquear', 'programa', 'fechar', 'certificado']) $(b).disabled = disabled;
};

async function responder(allow, { block = false, programa = false } = {}) {
  answering = true;
  botoes(true);
  try {
    const r = await send({
      type: 'prompt-answer', allow, block, programa,
      password: allow ? $('senha').value : undefined,
      thumbprint: $('bloco-certificado').hidden ? undefined : $('certificado').value,
    });
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
      setTimeout(fechar, 4000);
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
$('bloquear').addEventListener('click', () => responder(false, { block: true }));
$('programa').addEventListener('click', () => responder(false, { programa: true }));
$('fechar').addEventListener('click', () => responder(false));
$('senha').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('confirmar').disabled) responder(true); });
// Fechar a janela sem responder equivale a recusar.
window.addEventListener('pagehide', () => {
  if (!finished) api.runtime.sendMessage({ type: 'prompt-abandon', id }).catch(() => {});
});
init().catch(() => status('erro', 'Falha ao carregar o pedido.'));
