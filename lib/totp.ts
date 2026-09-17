const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function generateTotpSecret() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => alphabet[b % 32]).join(''); }
function decode(s: string) { let buffer = 0, bits = 0; const out: number[] = []; for (const c of s) {
    const n = alphabet.indexOf(c);
    if (n < 0)
        throw new Error('Invalid TOTP secret');
    buffer = (buffer << 5) | n;
    bits += 5;
    if (bits >= 8) {
        bits -= 8;
        out.push((buffer >>> bits) & 255);
    }
} return new Uint8Array(out); }
export async function totpCode(secret: string, counter: number) { const key = await crypto.subtle.importKey('raw', decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']); const msg = new Uint8Array(8); new DataView(msg.buffer).setBigUint64(0, BigInt(counter)); const hash = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg)); const offset = hash[hash.length - 1] & 15; const n = ((hash[offset] & 127) << 24) | (hash[offset + 1] << 16) | (hash[offset + 2] << 8) | hash[offset + 3]; return String(n % 1000000).padStart(6, '0'); }
export async function totpCounter(secret: string, code: string, time = Date.now()) { if (!/^\d{6}$/.test(code))
    return null; const c = Math.floor(time / 30000); for (const n of [c - 1, c, c + 1])
    if (await totpCode(secret, n) === code)
        return n; return null; }
