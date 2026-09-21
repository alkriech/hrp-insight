export class HttpError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export function fail(status: number, message: string): never { throw new HttpError(status, message); }
export function requireMutationOrigin(request: Request, allowedOrigin: string) { if (request.headers.get('origin') !== allowedOrigin || request.headers.get('sec-fetch-site') === 'cross-site' || request.headers.get('x-hrp-insight-request') !== '1')
    fail(403, 'Permintaan tidak dapat diverifikasi. Muat ulang halaman dan coba lagi.'); }
export const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), v => v.toString(16).padStart(2, '0')).join('');
export async function sha256(s: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), v => v.toString(16).padStart(2, '0')).join(''); }
function keyBytes(secret: string) { if (!/^[a-f0-9]{64}$/i.test(secret))
    throw new HttpError(503, 'Konfigurasi pelindungan data belum tersedia. Hubungi administrator.'); return new Uint8Array(secret.match(/.{2}/g)!.map(h => parseInt(h, 16))); }
export async function keyedHash(secret: string, value: string) { const key = await crypto.subtle.importKey('raw', keyBytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))), v => v.toString(16).padStart(2, '0')).join(''); }
export async function encrypt(secret: string, data: unknown, context: string) { const key = await crypto.subtle.importKey('raw', keyBytes(secret), 'AES-GCM', false, ['encrypt']); const iv = crypto.getRandomValues(new Uint8Array(12)); const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) }, key, new TextEncoder().encode(JSON.stringify(data)))); return 'v1.' + btoa(String.fromCharCode(...iv)) + '.' + btoa(Array.from(cipher, b => String.fromCharCode(b)).join('')); }
export async function decrypt<T = any>(secret: string, value: string, context: string): Promise<T> { const [version, i, c] = value.split('.'); if (version !== 'v1')
    throw new Error('Unsupported ciphertext version'); const bytes = (s: string) => Uint8Array.from(atob(s), v => v.charCodeAt(0)); const key = await crypto.subtle.importKey('raw', keyBytes(secret), 'AES-GCM', false, ['decrypt']); return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(i), additionalData: new TextEncoder().encode(context) }, key, bytes(c)))); }
export async function readJson(request: Request) { if (!request.headers.get('content-type')?.startsWith('application/json'))
    fail(415, 'Gunakan format JSON.'); const reader = request.body?.getReader(); if (!reader)
    return fail(400, 'Data tidak tersedia.'); let size = 0; const chunks: Uint8Array[] = []; while (true) {
    const { done, value } = await reader.read();
    if (done)
        break;
    size += value.length;
    if (size > 256 * 1024) {
        await reader.cancel();
        fail(413, 'Data terlalu besar.');
    }
    chunks.push(value);
} const data = new Uint8Array(size); let offset = 0; for (const c of chunks) {
    data.set(c, offset);
    offset += c.length;
} try {
    return JSON.parse(new TextDecoder().decode(data));
}
catch {
    fail(400, 'Format data tidak dapat dibaca.');
} }
export function secureResponse(res: Response) { const headers = new Headers(res.headers); headers.set('Cache-Control', 'no-store, max-age=0'); headers.set('Referrer-Policy', 'no-referrer'); headers.set('X-Content-Type-Options', 'nosniff'); headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive'); headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()'); headers.set('X-Frame-Options', 'SAMEORIGIN'); headers.set('Cross-Origin-Opener-Policy', 'same-origin'); headers.set('Cross-Origin-Resource-Policy', 'same-origin'); headers.set('Origin-Agent-Cluster', '?1'); headers.set('X-Permitted-Cross-Domain-Policies', 'none'); return new Response(res.body, { status: res.status, statusText: res.statusText, headers }); }
