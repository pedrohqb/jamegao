// Constantes e formatos do protocolo Web PKI / WebSigner.

// Versão declarada à página. Os SDKs recusam extensão/componente "antigos";
// declarar uma versão alta passa nessa conferência.
export const COMPAT_VERSION = '2.99.0';

// Marcas (prefixo dos eventos e IDs de extensão que o SDK procura na página).
// O protocolos/esaj/conteudo.js, que não é módulo, mantém uma cópia literal idêntica; o teste
// de unidade confere as duas.
export const BRANDS = [
  {
    prefix: 'br.com.softplan.WebPKI',
    ids: ['bbafmabaelnnkondpfpjmdklbmfnbmol', 'websigner_softplan_com_br'],
  },
  {
    prefix: 'com.lacunasoftware.WebPKI',
    ids: [
      'dcngeagmmhegagicpcmpinaoklddcgon',
      'nedeegdmhlnmboboahchfpkmdnnemapd',
      'webpki_lacunasoftware_com',
      'webpki_beta_lacunasoftware_com',
    ],
  },
];

export const CODES = {
  cancelled: 'user_cancelled',
  badRequest: 'bad_request',
  notFound: 'certificate_not_found',
  unsupported: 'command_not_supported',
  internal: 'undefined',
};

export const ok = (response) => ({ success: true, response });

export const fail = (code, message) => ({
  success: false,
  exception: { message, complete: message, origin: 'extension', code },
});

export class PkiError extends Error {
  constructor(message, code = CODES.internal) {
    super(message);
    this.code = code;
  }
}
