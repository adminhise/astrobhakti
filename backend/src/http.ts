import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { type Actor, type Ctx, AppError } from './core.ts';
import { actorFromToken } from './modules/identity.ts';

export interface Req {
  ctx: Ctx;
  actor: Actor | null;
  params: Record<string, string>;
  query: URLSearchParams;
  body: any;
  raw: string;
  headers: IncomingMessage['headers'];
}

type Handler = (r: Req) => unknown;
interface Route { method: string; parts: string[]; handler: Handler; public: boolean }

export class Router {
  routes: Route[] = [];
  add(method: string, path: string, handler: Handler, opts: { public?: boolean } = {}) {
    this.routes.push({ method, parts: path.split('/').filter(Boolean), handler, public: !!opts.public });
    return this;
  }
  get(p: string, h: Handler, o?: { public?: boolean }) { return this.add('GET', p, h, o); }
  post(p: string, h: Handler, o?: { public?: boolean }) { return this.add('POST', p, h, o); }
  put(p: string, h: Handler, o?: { public?: boolean }) { return this.add('PUT', p, h, o); }
  del(p: string, h: Handler, o?: { public?: boolean }) { return this.add('DELETE', p, h, o); }

  match(method: string, path: string) {
    const parts = path.split('/').filter(Boolean);
    for (const r of this.routes) {
      if (r.method !== method || r.parts.length !== parts.length) continue;
      const params: Record<string, string> = {};
      if (r.parts.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = decodeURIComponent(parts[i])), true) : p === parts[i])))
        return { route: r, params };
    }
    return null;
  }
}

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, x-signature' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 1_000_000) throw new AppError(413, 'too_large');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Verifies an HMAC-SHA256 signature over the raw request body (payment provider webhooks). */
export function verifySignature(raw: string, signature: string | undefined, secret: string) {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function serve(ctx: Ctx, router: Router, opts: { port: number; staticDir?: string }) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'OPTIONS') return send(res, 204, null);
    try {
      if (opts.staticDir && req.method === 'GET' && !url.pathname.startsWith('/api/')) {
        const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        const file = normalize(join(opts.staticDir, rel));
        if (file.startsWith(normalize(opts.staticDir))) {
          try {
            const data = await readFile(file);
            res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
            return res.end(data);
          } catch { /* fall through to the API router */ }
        }
      }
      const path = url.pathname.replace(/^\/api/, '');
      const m = router.match(req.method ?? 'GET', path);
      if (!m) return send(res, 404, { error: 'not_found' });
      const raw = req.method === 'GET' ? '' : await readBody(req);
      let body: any = {};
      if (raw) {
        try { body = JSON.parse(raw); } catch { throw new AppError(400, 'bad_json'); }
      }
      const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || undefined;
      const actor = actorFromToken(ctx, token);
      if (!m.route.public && !actor) throw new AppError(401, 'unauthenticated');
      const out = await m.route.handler({ ctx, actor, params: m.params, query: url.searchParams, body, raw, headers: req.headers });
      send(res, 200, out ?? { ok: true });
    } catch (err) {
      if (err instanceof AppError) return send(res, err.status, { error: err.code, message: err.message });
      console.error(err);
      send(res, 500, { error: 'internal' });
    }
  });
  server.listen(opts.port);
  return server;
}
