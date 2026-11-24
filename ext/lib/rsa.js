// Assinatura RSASSA-PKCS1-v1_5 com chave PKCS#8 em memória.
// signData usa o WebCrypto; signHash (resumo já calculado) faz EMSA-PKCS1-v1_5
// e a exponenciação em BigInt, com cegamento da base e conferência pela chave pública.
import { PkiError, CODES } from './protocol.js';

export const HASH_LEN = { 'SHA-1': 20, 'SHA-256': 32, 'SHA-384': 48, 'SHA-512': 64 };

const PREFIX = {
  'SHA-1': '3021300906052b0e03021a05000414',
  'SHA-256': '3031300d060960864801650304020105000420',
  'SHA-384': '3041300d060960864801650304020205000430',
  'SHA-512': '3051300d060960864801650304020305000440',
};

const ALIASES = {
  'sha1': 'SHA-1', 'sha-1': 'SHA-1', '1.3.14.3.2.26': 'SHA-1',
  'sha256': 'SHA-256', 'sha-256': 'SHA-256', '2.16.840.1.101.3.4.2.1': 'SHA-256',
  'sha384': 'SHA-384', 'sha-384': 'SHA-384', '2.16.840.1.101.3.4.2.2': 'SHA-384',
  'sha512': 'SHA-512', 'sha-512': 'SHA-512', '2.16.840.1.101.3.4.2.3': 'SHA-512',
};

export const normalizeHash = (name) => {
  const key = String(name ?? 'SHA-256').trim().toLowerCase();
  const hash = Object.prototype.hasOwnProperty.call(ALIASES, key) ? ALIASES[key] : null;
  if (!hash) throw new PkiError('Algoritmo de resumo não suportado: ' + name, CODES.badRequest);
  return hash;
};

const hexToBytes = (hex) => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
};

const bytesToBigInt = (bytes) => {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return BigInt('0x' + (hex || '0'));
};

const bigIntToBytes = (value, length) => hexToBytes(value.toString(16).padStart(length * 2, '0'));

const b64urlToBigInt = (s) => {
  const std = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(std + '='.repeat((4 - (std.length % 4)) % 4));
  return bytesToBigInt(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

const modPow = (base, exp, mod) => {
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return result;
};

const modInv = (a, mod) => {
  let [oldR, r] = [a % mod, mod];
  let [oldS, s] = [1n, 0n];
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  if (oldR !== 1n) return null;
  return ((oldS % mod) + mod) % mod;
};

const importRsa = async (pkcs8, hashName, extractable, usages) => {
  try {
    return await globalThis.crypto.subtle.importKey(
      'pkcs8', pkcs8, { name: 'RSASSA-PKCS1-v1_5', hash: hashName }, extractable, usages,
    );
  } catch {
    throw new PkiError('A chave privada não é uma chave RSA válida', CODES.badRequest);
  }
};

export const signData = async (pkcs8, data, hashName) => {
  const hash = normalizeHash(hashName);
  const key = await importRsa(pkcs8, hash, false, ['sign']);
  const sig = await globalThis.crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, data);
  return new Uint8Array(sig);
};

// MD5 fica fora de HASH_LEN/ALIASES: o e-SAJ nunca pode pedir MD5. Só o
// login do PJe (MD5withRSA) usa, por signMd5Hash.
const MD5_PREFIX = '3020300c06082a864886f70d020505000410';

export const signHash = async (pkcs8, hash, hashName) => {
  const name = normalizeHash(hashName);
  return rawSign(pkcs8, hash, name, HASH_LEN[name], PREFIX[name]);
};

export const signMd5Hash = (pkcs8, hash) => rawSign(pkcs8, hash, 'MD5', 16, MD5_PREFIX);

const rawSign = async (pkcs8, hash, name, len, prefix) => {
  if (!(hash instanceof Uint8Array) || hash.length !== len) {
    throw new PkiError(`Resumo com tamanho errado para ${name}: ${hash?.length} bytes`, CODES.badRequest);
  }
  // O hash do importKey só importa para o WebCrypto; a exponenciação é nossa.
  const key = await importRsa(pkcs8, name === 'MD5' ? 'SHA-256' : name, true, ['sign']);
  const jwk = await globalThis.crypto.subtle.exportKey('jwk', key);
  const modulus = b64urlToBigInt(jwk.n);
  const pub = b64urlToBigInt(jwk.e);
  const priv = b64urlToBigInt(jwk.d);
  const k = Math.ceil(modulus.toString(2).length / 8);

  const digestInfo = new Uint8Array([...hexToBytes(prefix), ...hash]);
  if (k < digestInfo.length + 11) throw new PkiError('Chave RSA curta demais', CODES.badRequest);
  const em = new Uint8Array(k).fill(0xff);
  em[0] = 0x00;
  em[1] = 0x01;
  em[k - digestInfo.length - 1] = 0x00;
  em.set(digestInfo, k - digestInfo.length);

  const m = bytesToBigInt(em);
  let r;
  let rInv;
  do {
    r = bytesToBigInt(globalThis.crypto.getRandomValues(new Uint8Array(k))) % modulus;
    rInv = r > 1n ? modInv(r, modulus) : null;
  } while (rInv === null);
  const blinded = (m * modPow(r, pub, modulus)) % modulus;
  const s = (modPow(blinded, priv, modulus) * rInv) % modulus;
  if (modPow(s, pub, modulus) !== m) {
    throw new PkiError('Falha interna ao assinar o resumo', CODES.internal);
  }
  return bigIntToBytes(s, k);
};
