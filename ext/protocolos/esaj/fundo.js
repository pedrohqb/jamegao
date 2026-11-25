// Protocolo e-SAJ (Web PKI): comandos que o script de conteúdo repassa da
// página. A decisão é pura; a chave só é usada por `assinar`.
import { COMPAT_VERSION, CODES, PkiError, ok } from '../../lib/protocol.js';
import { b64ToBytes, bytesToB64 } from '../../lib/bytes.js';
import { HASH_LEN, normalizeHash, signData, signHash } from '../../lib/rsa.js';

// `matches` é a lista de padrões do script de conteúdo no manifesto
// (content_scripts[0].matches); injetável para os testes.
export function createEsaj({ matches }) {
  const hosts = new Set();
  for (const m of matches) {
    const r = /^(https?):\/\/([^/*]+)\//.exec(m);
    if (r) hosts.add(`${r[1]}://${r[2]}`);
  }

  const aceitaOrigem = (origin) => {
    if (typeof origin !== 'string') return false;
    try {
      const u = new URL(origin);
      return hosts.has(`${u.protocol.slice(0, -1)}://${u.hostname}`);
    } catch {
      return false;
    }
  };

  const abertos = {
    getExtensionVersion: async () => COMPAT_VERSION,
    getVersion: async () => COMPAT_VERSION,
    async initialize(_request, { platformOs: os }) {
      return {
        isReady: true,
        status: 0,
        message: null,
        nativeInfo: { os, installedVersion: COMPAT_VERSION, essentialFeaturesOnly: false },
        platformInfo: { os },
      };
    },
    pollNative: async () => true,
  };

  const findCert = async (certs, thumbprint) => {
    if (typeof thumbprint !== 'string' || !thumbprint) {
      throw new PkiError('Certificado não encontrado', CODES.notFound);
    }
    const entry = await certs.get(thumbprint);
    if (!entry) throw new PkiError('Certificado não encontrado', CODES.notFound);
    return entry;
  };

  const sign = (kind) => async (request, { origin, certs, assinar }) => {
    // Valida tudo antes de qualquer pedido ao usuário.
    const entry = await findCert(certs, request.certificateThumbprint);
    const input = b64ToBytes(kind === 'data' ? request.data : request.hash);
    const hashName = normalizeHash(request.digestAlgorithm);
    if (kind === 'hash' && input.length !== HASH_LEN[hashName]) {
      throw new PkiError(`Resumo com tamanho errado para ${hashName}`, CODES.badRequest);
    }
    const r = await assinar({ origin, thumbprint: entry.thumbprint }, async (pkcs8) =>
      bytesToB64(kind === 'data' ? await signData(pkcs8, input, hashName) : await signHash(pkcs8, input, hashName)));
    return r.needs ? r : ok(r.valor);
  };

  const comandos = {
    async listCertificates(_request, { origin, certs, sites }) {
      if ((await sites.get(origin)).allowed !== true) return { needs: { site: true } };
      return ok((await certs.list()).map((e) => e.model));
    },
    async readCertificate(request, { origin, certs, sites }) {
      const entry = await findCert(certs, request.certificateThumbprint);
      if ((await sites.get(origin)).allowed !== true) return { needs: { site: true } };
      return ok(entry.certB64);
    },
    // Não assina: sempre abre a confirmação (novoLote), que concede o lote.
    async preauthorizeSignatures(request, { origin, certs, assinar }) {
      const entry = await findCert(certs, request.certificateThumbprint);
      // `?? NaN`: ausente não pode cair no padrão (1) de `assinar`.
      const r = await assinar(
        { origin, thumbprint: entry.thumbprint, quantidade: request.signatureCount ?? NaN, novoLote: true },
        async () => { throw new PkiError('Falha ao decifrar a chave.', CODES.internal); },
      );
      return { needs: r.needs };
    },
    signData: sign('data'),
    signHash: sign('hash'),
  };

  return { id: 'esaj', aceitaOrigem, abertos, comandos };
}
