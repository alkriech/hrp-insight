import { env } from 'cloudflare:workers';
import { createService, type AppEnv } from '@/lib/service';
export const dynamic = 'force-dynamic';
const dispatch = (request: Request) => createService(env as unknown as AppEnv)(request);
export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const DELETE = dispatch;
