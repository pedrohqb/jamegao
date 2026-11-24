// Cadeia de certificados no formato PkiPath (SEQUENCE OF Certificate), como o
// PJeOffice envia ao PJe. Recebe os DER do titular para a raiz e emite na
// ordem do Java: a autoridade mais alta primeiro, o titular por último.

const derLength = (n) => {
  if (n < 0x80) return [n];
  const out = [];
  while (n > 0) { out.unshift(n & 0xff); n = Math.floor(n / 256); }
  return [0x80 | out.length, ...out];
};

export function pkiPath(cadeiaDoTitularParaARaiz) {
  const certs = [...cadeiaDoTitularParaARaiz].reverse();
  const body = certs.reduce((n, c) => n + c.length, 0);
  const head = [0x30, ...derLength(body)];
  const out = new Uint8Array(head.length + body);
  out.set(head);
  let off = head.length;
  for (const c of certs) { out.set(c, off); off += c.length; }
  return out;
}
