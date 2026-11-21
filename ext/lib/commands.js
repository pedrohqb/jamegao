// Decisão dos comandos: dado um comando e a origem, devolve a resposta do
// protocolo ou {needs} (o que o usuário precisa fazer antes). Não abre janela
// nem toca em interface; quem pede a confirmação é o chamador.
import { COMPAT_VERSION, CODES, PkiError, fail, ok } from './protocol.js';
import { b64ToBytes, bytesToB64 } from './bytes.js';
import { HASH_LEN, normalizeHash, signData, signHash } from './rsa.js';
import { MAX_SIGNATURES } from './credits.js';

const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export function createCommands({ vault, certs, sites, credits, platformOs }) {
  // Comandos que não olham a origem.
  const open = {
    getExtensionVersion: async () => COMPAT_VERSION,
    getVersion: async () => COMPAT_VERSION,
    async initialize() {
      const os = platformOs;
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

  const findCert = async (thumbprint) => {
    if (typeof thumbprint !== 'string' || !thumbprint) {
      throw new PkiError('Certificado não encontrado', CODES.notFound);
    }
    const entry = await certs.get(thumbprint);
    if (!entry) throw new PkiError('Certificado não encontrado', CODES.notFound);
    return entry;
  };

  const siteOk = async (origin) => (await sites.get(origin)).allowed === true;

  const sign = (kind) => async (request, origin) => {
    // Valida tudo antes de qualquer pedido ao usuário.
    const entry = await findCert(request.certificateThumbprint);
    const input = b64ToBytes(kind === 'data' ? request.data : request.hash);
    const hashName = normalizeHash(request.digestAlgorithm);
    if (kind === 'hash' && input.length !== HASH_LEN[hashName]) {
      throw new PkiError(`Resumo com tamanho errado para ${hashName}`, CODES.badRequest);
    }
    const thumbprint = entry.thumbprint;
    const needs = {};
    if (!(await siteOk(origin))) needs.site = true;
    if (!(await vault.isUnlocked())) needs.unlock = true;
    if (!(await credits.has(origin, thumbprint))) needs.sign = { count: 1, thumbprint };
    if (Object.keys(needs).length) return { needs };
    if (!(await credits.consume(origin, thumbprint))) {
      return { needs: { sign: { count: 1, thumbprint } } };
    }
    const pkcs8 = await vault.decrypt(entry.key);
    try {
      const sig = kind === 'data'
        ? await signData(pkcs8, input, hashName)
        : await signHash(pkcs8, input, hashName);
      await vault.touch();
      return ok(bytesToB64(sig));
    } finally {
      pkcs8.fill(0);
    }
  };

  const guarded = {
    async listCertificates(_request, origin) {
      if (!(await siteOk(origin))) return { needs: { site: true } };
      return ok((await certs.list()).map((e) => e.model));
    },
    async readCertificate(request, origin) {
      const entry = await findCert(request.certificateThumbprint);
      if (!(await siteOk(origin))) return { needs: { site: true } };
      return ok(entry.certB64);
    },
    async preauthorizeSignatures(request, origin) {
      const entry = await findCert(request.certificateThumbprint);
      const count = request.signatureCount;
      if (!Number.isInteger(count) || count < 1 || count > MAX_SIGNATURES) {
        throw new PkiError('Quantidade de assinaturas inválida', CODES.badRequest);
      }
      const needs = {};
      if (!(await siteOk(origin))) needs.site = true;
      if (!(await vault.isUnlocked())) needs.unlock = true;
      needs.sign = { count, thumbprint: entry.thumbprint };
      return { needs };
    },
    signData: sign('data'),
    signHash: sign('hash'),
  };

  async function handle({ command, request }, origin) {
    try {
      if (own(open, command)) return ok(await open[command](request));
      if (origin === null || origin === undefined) return fail(CODES.cancelled, 'Origem não identificada.');
      if ((await sites.get(origin)).allowed === false) {
        return fail(CODES.cancelled, 'Este site está bloqueado no Jamegão.');
      }
      if (!own(guarded, command)) {
        return fail(CODES.unsupported, `O Jamegão não atende o comando "${command}".`);
      }
      return await guarded[command](request ?? {}, origin);
    } catch (e) {
      if (e instanceof PkiError) return fail(e.code, e.message);
      return fail(CODES.internal, e?.message || 'Erro interno.');
    }
  }

  return { handle };
}
