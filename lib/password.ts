import { scrypt, timingSafeEqual } from 'node:crypto';
import { randomToken } from './security';
const derive = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 32, { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
export async function hashPassword(password: string) { const salt = randomToken(); const key = await derive(password, salt); return `scrypt:16384:8:5:${salt}:${key.toString('hex')}`; }
export async function verifyPassword(password: string, encoded: string) { const parts = encoded.split(':'); if (parts.length !== 6 || parts.slice(0, 4).join(':') !== 'scrypt:16384:8:5')
    return false; const expected = Buffer.from(parts[5], 'hex'); const actual = await derive(password, parts[4]); return expected.length === actual.length && timingSafeEqual(expected, actual); }
