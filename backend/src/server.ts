import { fileURLToPath } from 'node:url';
import { createCtx } from './core.ts';
import { serve } from './http.ts';
import { buildRouter } from './routes.ts';
import { seed } from './seed.ts';
import { expireHolds } from './modules/bookings.ts';

const dev = process.env.NODE_ENV !== 'production';
const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET ?? (dev ? 'dev-webhook-secret' : '');
if (!webhookSecret) throw new Error('PAYMENT_WEBHOOK_SECRET is required in production');

const ctx = createCtx({ file: process.env.DB_FILE ?? 'astrobhakti.db' });
if ((ctx.db.prepare('SELECT COUNT(*) c FROM deities').get() as any).c === 0 && dev) seed(ctx);

const port = Number(process.env.PORT ?? 8787);
const staticDir = fileURLToPath(new URL('../../web/', import.meta.url));
serve(ctx, buildRouter({ dev, webhookSecret }), { port, staticDir });

// Release abandoned slot holds every minute.
setInterval(() => expireHolds(ctx), 60_000).unref();

console.log(`AstroBhakti API on http://localhost:${port}/api  ·  consoles on http://localhost:${port}/`);
