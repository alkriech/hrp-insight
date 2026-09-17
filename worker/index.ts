import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
interface Env {
    ASSETS: Fetcher;
    DB: D1Database;
    IMAGES: {
        input(stream: ReadableStream): {
            transform(options: Record<string, unknown>): {
                output(options: {
                    format: string;
                    quality: number;
                }): Promise<{
                    response(): Response;
                }>;
            };
        };
    };
}
interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
}
const worker = {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);
        if (url.pathname === "/_vinext/image") {
            const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
            return handleImageOptimization(request, {
                fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
                transformImage: async (body, { width, format, quality }) => {
                    const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
                    return result.response();
                },
            }, allowedWidths);
        }
        const response = await handler.fetch(request, env, ctx);
        const secured = new Response(response.body, response);
        secured.headers.set('Cache-Control', 'no-store, max-age=0');
        secured.headers.set('X-Content-Type-Options', 'nosniff');
        secured.headers.set('Referrer-Policy', 'no-referrer');
        secured.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
        secured.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        secured.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        secured.headers.set('X-Frame-Options', 'SAMEORIGIN');
        secured.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        secured.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
        secured.headers.set('Origin-Agent-Cluster', '?1');
        secured.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
        secured.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
        return secured;
    },
};
export default worker;
