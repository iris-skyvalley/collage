/** URL-safe, unambiguous alphabet: no 0/O/I/l. Short ids are the share URL. */
const ALPHABET = '23456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

export function shortId(len = 9): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

export function isShortId(v: unknown, len = 9): v is string {
  if (typeof v !== 'string' || v.length !== len) return false;
  for (const ch of v) if (!ALPHABET.includes(ch)) return false;
  return true;
}

/** Opaque token for anonymous sessions and claim links. */
export function token(bytes = 24): string {
  return Array.from(randomBytes(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
