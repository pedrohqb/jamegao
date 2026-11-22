// Modelo do certificado no formato que o SDK de assinatura da página espera.
// O forge é recebido por parâmetro (vendor/forge.min.js na extensão).

const OID = {
  pfDados: '2.16.76.1.3.1',
  pjResponsavelNome: '2.16.76.1.3.2',
  pjCnpj: '2.16.76.1.3.3',
  pjResponsavelDados: '2.16.76.1.3.4',
  oab: '2.16.76.1.4.2.1.1',
  policyPrefix: '2.16.76.1.2.',
};

const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));

// Junta o texto de um nó ASN.1 (o valor pode ser string ou lista de nós).
const asn1Text = (node) => {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(asn1Text).join('');
  return asn1Text(node.value);
};

const onlyDigits = (s) => (s || '').replace(/\D/g, '');

// Texto de otherName pode vir como UTF8String; se não for UTF-8 válido, fica como está.
const decodeText = (forge, raw) => {
  try {
    return forge.util.decodeUtf8(raw);
  } catch {
    return raw;
  }
};

// CNPJ numérico ou alfanumérico (12 posições alfanuméricas + 2 dígitos).
const parseCnpj = (raw) => {
  const v = (raw || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  return /^[0-9A-Z]{12}\d{2}$/.test(v) ? v : null;
};

const readOtherNames = (forge, cert) => {
  const out = {};
  const san = cert.getExtension('subjectAltName');
  if (!san || !san.altNames) return { otherNames: out, email: null };
  let email = null;
  for (const alt of san.altNames) {
    if (alt.type === 1 && !email) email = alt.value;
    if (alt.type !== 0 || !Array.isArray(alt.value) || alt.value.length < 2) continue;
    try {
      const oid = forge.asn1.derToOid(alt.value[0].value);
      out[oid] = decodeText(forge, asn1Text(alt.value[1]));
    } catch {
      // otherName fora do padrão: ignora
    }
  }
  return { otherNames: out, email };
};

// Campo "dados do titular/responsável" da ICP-Brasil:
// nascimento (8, DDMMAAAA) + CPF (11) + NIS (11) + RG (15) + órgão/UF.
export const parseDadosPessoa = (raw) => {
  if (!raw || raw.length < 19) return {};
  const nasc = raw.slice(0, 8);
  const cpf = onlyDigits(raw.slice(8, 19));
  const nis = onlyDigits(raw.slice(19, 30));
  const rg = raw.slice(30, 45).replace(/^0+/, '').trim();
  const emissor = raw.slice(45).trim();
  const out = {};
  if (/^\d{8}$/.test(nasc) && nasc !== '00000000') {
    out.dateOfBirth = `${nasc.slice(4, 8)}-${nasc.slice(2, 4)}-${nasc.slice(0, 2)}T00:00:00`;
  }
  if (cpf.length === 11 && !/^0+$/.test(cpf)) out.cpf = cpf;
  if (nis && !/^0+$/.test(nis)) out.nis = nis;
  if (rg) out.rgNumero = rg;
  if (emissor) {
    // A UF só é separada quando as duas últimas letras são uma UF de verdade
    // e sobra órgão emissor antes delas: com separador ("SSP/SP", "SSP SP")
    // basta haver órgão; colada ("SSPSP") o órgão precisa ter 2+ caracteres,
    // para "SSP" e "SES" não virarem "S"/"SP" e "S"/"ES".
    const m = emissor.match(/^(.*?)([\s/-]*)([A-Za-z]{2})$/);
    const uf = m && m[1].trim() && (m[2] || m[1].length >= 2) && UFS.has(m[3].toUpperCase()) ? m[3].toUpperCase() : null;
    out.rgEmissor = (uf ? m[1] : emissor).trim() || null;
    out.rgEmissorUF = uf;
  }
  return out;
};

const keyUsageMask = (cert) => {
  const ku = cert.getExtension('keyUsage');
  if (!ku) return 0;
  const bits = {
    digitalSignature: 128, nonRepudiation: 64, keyEncipherment: 32, dataEncipherment: 16,
    keyAgreement: 8, keyCertSign: 4, cRLSign: 2, encipherOnly: 1, decipherOnly: 32768,
  };
  let mask = 0;
  for (const [name, bit] of Object.entries(bits)) if (ku[name]) mask |= bit;
  return mask;
};

const certificateType = (forge, cert) => {
  const pol = cert.getExtension('certificatePolicies');
  if (!pol || !pol.value) return 'Unknown';
  try {
    const seq = forge.asn1.fromDer(pol.value);
    for (const info of seq.value) {
      const oid = forge.asn1.derToOid(info.value[0].value);
      if (!oid.startsWith(OID.policyPrefix)) continue;
      const kind = oid.split('.')[5];
      const types = { 1: 'A1', 2: 'A2', 3: 'A3', 4: 'A4', 101: 'S1', 102: 'S2', 103: 'S3', 104: 'S4' };
      if (types[kind]) return types[kind];
    }
  } catch {
    // extensão fora do padrão
  }
  return 'Unknown';
};

const cnOf = (forge, name) => {
  const field = name.getField('CN');
  if (!field) return name.attributes.map((a) => `${a.shortName || a.name}=${a.value}`).join(', ');
  // forge devolve UTF8String como bytes; converte quando for o caso.
  try {
    return field.valueTagClass === forge.asn1.Type.UTF8 ? forge.util.decodeUtf8(field.value) : field.value;
  } catch {
    return field.value;
  }
};

export function buildModel(forge, cert, thumbprint) {
  const { otherNames, email } = readOtherNames(forge, cert);
  const subjectName = cnOf(forge, cert.subject);
  const cnpj = parseCnpj(otherNames[OID.pjCnpj]);
  const isPJ = cnpj !== null;
  const pessoa = parseDadosPessoa(otherNames[isPJ ? OID.pjResponsavelDados : OID.pfDados]);

  let pkiBrazil = null;
  if (pessoa.cpf || isPJ) {
    const oabRaw = (otherNames[OID.oab] || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    const oabTail = oabRaw.slice(-2);
    const oabUF = oabRaw.length > 2 && UFS.has(oabTail) ? oabTail : null;
    const oabNumero = (oabUF ? oabRaw.slice(0, -2) : oabRaw).replace(/^0+/, '');
    pkiBrazil = {
      cpf: pessoa.cpf || null,
      cnpj: isPJ ? cnpj : null,
      responsavel: isPJ ? (otherNames[OID.pjResponsavelNome] || '').trim() || null : null,
      dateOfBirth: pessoa.dateOfBirth || null,
      certificateType: certificateType(forge, cert),
      isAplicacao: false,
      isPessoaFisica: !isPJ,
      isPessoaJuridica: isPJ,
      companyName: isPJ
        ? (subjectName.includes(':') ? subjectName.slice(0, subjectName.lastIndexOf(':')) : subjectName).trim()
        : null,
      nis: pessoa.nis || null,
      rgNumero: pessoa.rgNumero || null,
      rgEmissor: pessoa.rgEmissor || null,
      rgEmissorUF: pessoa.rgEmissorUF || null,
      oabNumero: oabNumero || null,
      oabUF,
    };
  }

  return {
    subjectName,
    issuerName: cnOf(forge, cert.issuer),
    isRemote: false,
    canRemove: false,
    email: email || null,
    thumbprint,
    keyUsage: keyUsageMask(cert),
    pkiBrazil,
    pkiItaly: null,
    validityStart: cert.validity.notBefore.toISOString(),
    validityEnd: cert.validity.notAfter.toISOString(),
  };
}

// SHA-256 do DER do certificado, em Base64.
export async function thumbprintOf(certDer) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', certDer));
  let bin = '';
  for (const b of digest) bin += String.fromCharCode(b);
  return btoa(bin);
}
