// Despacho por protocolo: escolhe o módulo do protocolo, confere origem e
// site e chama o comando. Não abre janela nem toca em interface: devolve a
// resposta do protocolo ou {needs}, e quem chama pede a confirmação.
import { CODES, PkiError, fail, ok } from './protocol.js';

const own = (obj, key) => obj != null && Object.prototype.hasOwnProperty.call(obj, key);

export function createDespacho({ protocolos, certs, sites, assinar, platformOs }) {
  const porId = new Map(protocolos.map((p) => [p.id, p]));

  async function handle({ protocolo = 'esaj', command, request }, origin) {
    try {
      const p = porId.get(protocolo);
      if (!p) return fail(CODES.unsupported, 'Protocolo não suportado pelo Jamegão.');
      const ctx = { origin, certs, sites, assinar, platformOs };
      if (own(p.abertos, command)) return ok(await p.abertos[command](request, ctx));
      if (origin === null || origin === undefined) return fail(CODES.cancelled, 'Origem não identificada.');
      if (!p.aceitaOrigem(origin)) {
        return fail(CODES.unsupported, `O Jamegão não atende o comando "${command}".`);
      }
      if ((await sites.get(origin)).allowed === false) {
        return fail(CODES.cancelled, 'Este site está bloqueado no Jamegão.');
      }
      if (!own(p.comandos, command)) {
        return fail(CODES.unsupported, `O Jamegão não atende o comando "${command}".`);
      }
      return await p.comandos[command](request ?? {}, ctx);
    } catch (e) {
      if (e instanceof PkiError) return fail(e.code, e.message);
      return fail(CODES.internal, 'Erro interno do Jamegão.');
    }
  }

  return { handle };
}
