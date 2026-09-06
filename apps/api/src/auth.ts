import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

function deriveKey(password: string, salt: Buffer, keyLength: number, options: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      keyLength,
      { ...options, maxmem: 128 * 1024 * 1024 },
      (error, derivedKey) => (error ? reject(error) : resolve(derivedKey))
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, rawN, rawR, rawP, rawSalt, rawKey] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !rawN || !rawR || !rawP || !rawSalt || !rawKey) return false;
  const expected = Buffer.from(rawKey, 'base64url');
  const derivedKey = await deriveKey(password, Buffer.from(rawSalt, 'base64url'), expected.length, {
    N: Number(rawN),
    r: Number(rawR),
    p: Number(rawP)
  });
  return expected.length === derivedKey.length && timingSafeEqual(expected, derivedKey);
}

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
