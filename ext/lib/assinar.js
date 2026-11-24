// Porta única para usar a chave privada: confere site, cofre e crédito,
// decifra a chave só pelo tempo de `fazer` e a zera no fim. Não abre janela:
// devolve {needs} (o que o usuário precisa fazer) e quem chama pede.
import { CODES, PkiError } from './protocol.js';
import { MAX_SIGNATURES } from './credits.js';

export function createAssinar({ vault, sites, credits, certs }) {
  return async function assinar(
    { origin, thumbprint, quantidade = 1, novoLote = false, sign = {} },
    fazer,
  ) {
    // A chave vem do armazém, pela impressão digital: o chamador não escolhe
    // a chave separadamente do crédito que gasta.
    const entry = await certs.get(thumbprint);
    if (!entry) throw new PkiError('Certificado não encontrado', CODES.notFound);
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > MAX_SIGNATURES) {
      throw new PkiError('Quantidade de assinaturas inválida', CODES.badRequest);
    }
    const pedido = { ...sign, count: quantidade, thumbprint };
    const needs = {};
    if ((await sites.get(origin)).allowed !== true) needs.site = true;
    if (!(await vault.isUnlocked())) needs.unlock = true;
    // Se alguma janela vai abrir (site novo, cofre travado ou lote novo), ela
    // mostra de novo o que vai ser assinado, mesmo que sobre crédito (que é
    // substituído).
    if (needs.site || needs.unlock || novoLote || !(await credits.has(origin, thumbprint))) {
      needs.sign = pedido;
    }
    if (Object.keys(needs).length) return { needs };
    for (let i = 0; i < quantidade; i++) {
      if (!(await credits.consume(origin, thumbprint))) return { needs: { sign: pedido } };
    }
    let pkcs8;
    try {
      pkcs8 = await vault.decrypt(entry.key);
    } catch {
      // O cofre travou entre a conferência e a decifragem.
      if (!(await vault.isUnlocked())) return { needs: { unlock: true, sign: pedido } };
      throw new PkiError('Falha ao decifrar a chave.', CODES.internal);
    }
    try {
      const valor = await fazer(pkcs8);
      await vault.touch();
      return { valor };
    } finally {
      pkcs8.fill(0);
    }
  };
}
