// Conversões Base64 <-> bytes, sem APIs exclusivas de Node.
import { PkiError, CODES } from './protocol.js';

export const b64ToBytes = (s) => {
  if (typeof s !== 'string') throw new PkiError('Conteúdo em Base64 ausente', CODES.badRequest);
  let bin;
  try {
    bin = atob(s.replace(/\s+/g, ''));
  } catch {
    throw new PkiError('Conteúdo em Base64 inválido', CODES.badRequest);
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export const bytesToB64 = (bytes) => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < view.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, view.subarray(i, i + 0x8000));
  }
  return btoa(bin);
};
