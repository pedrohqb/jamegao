// Protocolo PJe (substituto do assinador local): comandos que o script da
// página repassa. A decisão é pura; a chave só é usada por `assinar`.
import { CODES, PkiError, ok } from '../../lib/protocol.js';
import { b64ToBytes, bytesToB64 } from '../../lib/bytes.js';
import { md5 } from '../../lib/md5.js';
import { signData, signHash, signMd5Hash } from '../../lib/rsa.js';
import { MAX_SIGNATURES } from '../../lib/credits.js';
import { createExclusive } from '../../lib/exclusive.js';

const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const MAX_MENSAGEM = 8192;
const MAX_TAREFA = 200;
const MAX_RECUSADAS = 20;

// Login: a mensagem inteira é assinada. Documentos: o PJe manda o resumo.
const ALGORITMOS = {
  login: {
    padrao: 'MD5withRSA',
    MD5withRSA: (pkcs8, dados) => signMd5Hash(pkcs8, md5(dados)),
    SHA1withRSA: (pkcs8, dados) => signData(pkcs8, dados, 'SHA-1'),
    SHA256withRSA: (pkcs8, dados) => signData(pkcs8, dados, 'SHA-256'),
  },
  documentos: {
    padrao: 'ASN1MD5withRSA',
    ASN1MD5withRSA: { tamanho: 16, assinar: (pkcs8, resumo) => signMd5Hash(pkcs8, resumo) },
    ASN1SHA256withRSA: { tamanho: 32, assinar: (pkcs8, resumo) => signHash(pkcs8, resumo, 'SHA-256') },
  },
};

const ruim = (msg) => new PkiError(msg, CODES.badRequest);
const hexBytes = (h) => Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16));

// Resumo em hexadecimal (o comum, em qualquer caixa) ou em Base64.
function lerResumo(r, tamanho, i) {
  const t = typeof r === 'string' ? r.trim() : '';
  if (t.length === tamanho * 2 && /^[0-9a-f]+$/i.test(t)) return hexBytes(t);
  let b = null;
  try { b = b64ToBytes(t); } catch { /* não é Base64 */ }
  if (t && b && b.length === tamanho) return b;
  throw ruim(`Resumo ${i + 1} do PJe em formato inesperado`);
}

// Valida o pedido e devolve o que assinar, sem tocar em certificado nem chave.
function lerPedido(request) {
  const { tipo } = request;
  if (tipo !== 'login' && tipo !== 'documentos') throw ruim('Tipo de pedido do PJe inválido');
  const tabela = ALGORITMOS[tipo];
  const nome = request.algoritmo ?? tabela.padrao;
  if (typeof nome !== 'string' || nome === 'padrao' || !own(tabela, nome)) {
    throw ruim('Algoritmo não suportado: ' + String(nome));
  }
  if (tipo === 'login') {
    const { mensagem } = request;
    if (typeof mensagem !== 'string' || !mensagem || mensagem.length > MAX_MENSAGEM) {
      throw ruim('Mensagem do PJe inválida');
    }
    return { tipo, itens: [new TextEncoder().encode(mensagem)], assinarItem: tabela[nome] };
  }
  let { resumos } = request;
  if (typeof resumos === 'string') {
    try { resumos = JSON.parse(resumos); } catch { /* segue inválido */ }
  }
  if (!Array.isArray(resumos) || resumos.length < 1 || resumos.length > MAX_SIGNATURES) {
    throw ruim('Lista de resumos do PJe inválida');
  }
  const { tamanho, assinar } = tabela[nome];
  return { tipo, itens: resumos.map((r, i) => lerResumo(r, tamanho, i)), assinarItem: assinar };
}

export function createPje({ session }) {
  const exclusive = createExclusive('jamegao-pje-recusadas');

  const aceitaOrigem = (origin) => {
    if (typeof origin !== 'string') return false;
    try {
      const u = new URL(origin);
      return u.protocol === 'https:' && u.hostname.endsWith('.jus.br');
    } catch {
      return false;
    }
  };

  const comandos = {
    // Só lê: diz à página se o Jamegão atende ou se a chamada segue adiante.
    async estado(_request, { origin, certs, sites }) {
      const atender = (await certs.count()) > 0 && (await sites.get(origin)).allowed !== false;
      return ok({ atender });
    },

    async assinar(request, { origin, certs, sites, assinar }) {
      // Valida tudo antes de qualquer pedido ao usuário.
      const { tipo, itens, assinarItem } = lerPedido(request);
      const lista = await certs.list();
      if (!lista.length) throw new PkiError('Nenhum certificado importado no Jamegão', CODES.notFound);
      const sign = { motivo: tipo, sistema: 'PJe' };
      // Só contam os certificados com cadeia: os importados antes do suporte
      // ao PJe não têm, e o PJe não os aceita.
      const comCadeia = lista.filter((e) => Array.isArray(e.chainB64) && e.chainB64.length > 0);
      // A janela avisa e oferece o programa instalado (o PJeOffice pode ter o
      // certificado com a cadeia).
      if (!comCadeia.length) {
        return { needs: { aviso: 'semCadeia', programa: true, sign: { ...sign, count: itens.length, thumbprint: lista[0].thumbprint } } };
      }
      // Com mais de um, vale o último escolhido nesta origem; sem ele (ou se
      // foi removido ou não tem cadeia), a janela abre para escolher.
      let entry = comCadeia[0];
      let escolher = null;
      let semPreferido = false;
      if (comCadeia.length > 1) {
        const preferido = await sites.certificado(origin);
        const achado = comCadeia.find((e) => e.thumbprint === preferido);
        semPreferido = !achado;
        entry = achado ?? comCadeia[0];
        escolher = { opcoes: comCadeia.map((e) => e.thumbprint), marcado: entry.thumbprint };
      }
      const r = await assinar(
        {
          origin,
          thumbprint: entry.thumbprint,
          quantidade: itens.length,
          novoLote: (tipo === 'documentos' && request.novo === true) || semPreferido,
          sign,
        },
        async (pkcs8) => {
          const assinaturas = [];
          for (const item of itens) assinaturas.push(bytesToB64(await assinarItem(pkcs8, item)));
          return assinaturas;
        },
      );
      if (r.needs) {
        r.needs.programa = true;
        if (escolher) r.needs.escolher = escolher;
        return r;
      }
      return ok({ assinaturas: r.valor, cadeia: entry.chainB64 });
    },

    // Tarefa que o Jamegão ainda não faz: fica na sessão para o popup avisar.
    registrarTarefa(request, { origin }) {
      const { tarefa } = request;
      if (typeof tarefa !== 'string' || !tarefa || tarefa.length > MAX_TAREFA) throw ruim('Tarefa do PJe inválida');
      return exclusive(async () => {
        const lista = await session.get('pjeRecusadas', []);
        if (!lista.some((e) => e.origin === origin && e.tarefa === tarefa)) {
          lista.push({ origin, tarefa });
          await session.set('pjeRecusadas', lista.slice(-MAX_RECUSADAS));
        }
        return ok(null);
      });
    },
  };

  return { id: 'pje', aceitaOrigem, abertos: {}, comandos };
}
