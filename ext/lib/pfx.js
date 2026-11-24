// Leitura de PFX/P12: devolve a chave RSA em PKCS#8 DER e o certificado
// correspondente. O forge é recebido por parâmetro.

const E = {
  senha: 'Senha incorreta ou arquivo corrompido.',
  naoPfx: 'Este arquivo não é um certificado PFX ou P12.',
  naoRsa: 'O certificado usa uma chave que não é RSA. O Jamegão só trabalha com RSA.',
  semCert: 'Não achei no arquivo o certificado que corresponde à chave.',
};

const bytesToBin = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return bin;
};

const binToBytes = (bin) => {
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
};

export function parsePfx(forge, bytes, password) {
  let asn1;
  try {
    asn1 = forge.asn1.fromDer(forge.util.createBuffer(bytesToBin(bytes)));
  } catch {
    throw new Error(E.naoPfx);
  }

  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
  } catch (err) {
    const msg = String((err && err.message) || err);
    if (/password|MAC/i.test(msg)) throw new Error(E.senha);
    // Chave que o forge não sabe ler (EC, por exemplo) falha ao decodificar o saco da chave.
    if (/RSAPrivateKey|private key|PrivateKeyInfo|algorithm/i.test(msg) && !/PKCS#12/i.test(msg)) throw new Error(E.naoRsa);
    throw new Error(E.naoPfx);
  }

  const oids = forge.pki.oids;
  const keyBags = [
    ...(p12.getBags({ bagType: oids.pkcs8ShroudedKeyBag })[oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: oids.keyBag })[oids.keyBag] || []),
  ];
  const keyBag = keyBags.find((bag) => bag.key && bag.key.n && bag.key.d);
  if (!keyBag) throw new Error(E.naoRsa);
  const key = keyBag.key;

  const certBags = p12.getBags({ bagType: oids.certBag })[oids.certBag] || [];
  const certBag = certBags.find(
    (bag) => bag.cert && bag.cert.publicKey && bag.cert.publicKey.n && bag.cert.publicKey.n.equals(key.n),
  );
  if (!certBag) throw new Error(E.semCert);
  const cert = certBag.cert;

  const toDer = (c) => binToBytes(forge.asn1.toDer(forge.pki.certificateToAsn1(c)).getBytes());
  const certDer = toDer(cert);

  // Cadeia do titular para a raiz, com as autoridades que vierem no arquivo
  // (o PJe pede a cadeia inteira). Para na raiz ou quando falta o emissor.
  const others = certBags.map((bag) => bag.cert).filter((c) => c && c !== cert);
  const chain = [cert];
  for (let atual = cert; chain.length < 10;) {
    if (atual.isIssuer(atual)) break; // autoassinado: raiz
    const emissor = others.find((c) => !chain.includes(c) && atual.isIssuer(c));
    if (!emissor) break;
    chain.push(emissor);
    atual = emissor;
  }
  const chainDer = chain.map(toDer);
  const pkcs8 = binToBytes(
    forge.asn1.toDer(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(key))).getBytes(),
  );
  return { pkcs8, certDer, cert, chainDer };
}
