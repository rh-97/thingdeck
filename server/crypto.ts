import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';

/* ----------------------------- Passwords ----------------------------- */

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 64 };

function scryptAsync(password: string, salt: Buffer, N: number, r: number, p: number, keylen: number) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, keylen, { N, r, p, maxmem: 128 * N * r * 2 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

/** Hashes a password with scrypt (memory-hard, built into Node). Format: scrypt$N$r$p$salt$hash */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p, SCRYPT.keylen);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(
    password,
    Buffer.from(salt, 'base64'),
    Number(n),
    Number(r),
    Number(p),
    expected.length,
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/* ----------------------------- Sessions ----------------------------- */

export function newSessionToken() {
  return randomBytes(32).toString('base64url');
}

/** Sessions are stored hashed, so a leaked database can't be used to log in. */
export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

/* ----------------------------- Token encryption ----------------------------- */

export interface Sealed {
  ciphertext: string;
  iv: string;
  tag: string;
}

/** AES-256-GCM: confidentiality plus tamper detection for stored SmartThings tokens. */
export function seal(plaintext: string, key: Buffer): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function open(sealed: Sealed, key: Buffer): string {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Accepts a 32-byte key as base64 or hex. */
export function parseKey(value: string): Buffer {
  const trimmed = value.trim();
  const key = /^[0-9a-f]{64}$/i.test(trimmed) ? Buffer.from(trimmed, 'hex') : Buffer.from(trimmed, 'base64');
  if (key.length !== 32) throw new Error('THINGSDECK_SECRET must be 32 bytes (base64 or hex)');
  return key;
}
