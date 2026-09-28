import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';

export type Role = 'devotee' | 'priest' | 'editor' | 'support' | 'finance' | 'verification' | 'ops' | 'admin';

export interface Actor {
  id: string;
  role: Role;
}

export interface Ctx {
  db: DatabaseSync;
  now: () => Date;
}

export class AppError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

export const notFound = (what: string) => new AppError(404, 'not_found', `${what} not found`);
export const forbidden = (why = 'forbidden') => new AppError(403, 'forbidden', why);
export const invalid = (code: string, message?: string) => new AppError(400, code, message);
export const conflict = (code: string, message?: string) => new AppError(409, code, message);

export function openDb(file = ':memory:'): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  return db;
}

export function createCtx(opts: { file?: string; now?: () => Date } = {}): Ctx {
  return { db: openDb(opts.file), now: opts.now ?? (() => new Date()) };
}

export const iso = (d: Date) => d.toISOString();
export const nowIso = (ctx: Ctx) => iso(ctx.now());
export const addMinutes = (isoTime: string, minutes: number) =>
  new Date(new Date(isoTime).getTime() + minutes * 60_000).toISOString();

export const newId = (prefix: string) => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
export const newToken = () => randomBytes(24).toString('base64url');

/** Runs fn inside BEGIN IMMEDIATE so concurrent writers serialise; rolls back on any throw. */
export function tx<T>(ctx: Ctx, fn: () => T): T {
  ctx.db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    ctx.db.exec('COMMIT');
    return out;
  } catch (err) {
    ctx.db.exec('ROLLBACK');
    throw translateDbError(err);
  }
}

/** Turns constraint failures raised by schema triggers into typed API errors. */
export function translateDbError(err: unknown): unknown {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('priest_overlap')) return conflict('priest_unavailable', 'The priest already has a booking or travel buffer in that period');
  if (msg.includes('deity_limit')) return invalid('deity_limit', 'Choose at most five deities');
  if (msg.includes('UNIQUE constraint failed: user_deities.user_id')) return invalid('one_default', 'Exactly one default deity is allowed');
  return err;
}

export function one<T = any>(ctx: Ctx, sql: string, ...params: any[]): T | undefined {
  return ctx.db.prepare(sql).get(...params) as T | undefined;
}

export function all<T = any>(ctx: Ctx, sql: string, ...params: any[]): T[] {
  return ctx.db.prepare(sql).all(...params) as T[];
}

export function run(ctx: Ctx, sql: string, ...params: any[]) {
  return ctx.db.prepare(sql).run(...params);
}

export function audit(ctx: Ctx, actor: Actor | null, action: string, entity: string, entityId: string | null, detail?: unknown) {
  run(ctx, 'INSERT INTO audit_log (at, actor_id, action, entity, entity_id, detail) VALUES (?,?,?,?,?,?)',
    nowIso(ctx), actor?.id ?? null, action, entity, entityId, detail === undefined ? null : JSON.stringify(detail));
}

export function notify(ctx: Ctx, userId: string, kind: string, body: string) {
  run(ctx, 'INSERT INTO notifications (id, user_id, kind, body, created_at) VALUES (?,?,?,?,?)',
    newId('ntf'), userId, kind, body, nowIso(ctx));
}

export function requireRole(actor: Actor, ...roles: Role[]) {
  if (actor.role === 'admin') return;
  if (!roles.includes(actor.role)) throw forbidden(`requires role ${roles.join(' or ')}`);
}

export const json = <T>(text: string | null | undefined, fallback: T): T => (text ? JSON.parse(text) as T : fallback);

/** GST and other percentages are stored in basis points; round half up to the paisa. */
export const bps = (amount: number, basisPoints: number) => Math.round((amount * basisPoints) / 10_000);
