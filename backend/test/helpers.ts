import { type Actor, type Ctx, createCtx, one } from '../src/core.ts';
import { createUser } from '../src/modules/identity.ts';
import { seed } from '../src/seed.ts';
import { paymentCallback } from '../src/modules/bookings.ts';

export interface World {
  ctx: Ctx;
  clock: { t: number; advance: (minutes: number) => void; at: (iso: string) => void };
  ids: ReturnType<typeof seed>;
  actor: (email: string) => Actor;
  devotee: (name?: string) => Actor;
  priestActor: (priestId: string) => Actor;
}

/** Fresh in-memory database with seed data and a controllable clock. */
export function world(startIso = '2026-09-28T04:30:00.000Z'): World {
  const clock = {
    t: new Date(startIso).getTime(),
    advance(minutes: number) { this.t += minutes * 60_000; },
    at(iso: string) { this.t = new Date(iso).getTime(); },
  };
  const ctx = createCtx({ now: () => new Date(clock.t) });
  const ids = seed(ctx);
  let n = 0;
  return {
    ctx, clock, ids,
    actor: (email: string) => { const u = one(ctx, 'SELECT id, role FROM users WHERE email = ?', email); return { id: u.id, role: u.role }; },
    devotee: (name = `Devotee ${++n}`) => ({ id: createUser(ctx, { name, phone: `+9190000${String(++n).padStart(5, '0')}` }), role: 'devotee' }),
    priestActor: (priestId: string) => { const p = one(ctx, 'SELECT user_id FROM priests WHERE id = ?', priestId); return { id: p.user_id, role: 'priest' }; },
  };
}

export function capture(w: World, paymentId: string, eventId = `evt_${paymentId}`) {
  const p = one(w.ctx, 'SELECT amount FROM payments WHERE id = ?', paymentId);
  return paymentCallback(w.ctx, { providerEventId: eventId, paymentId, type: 'captured', amount: p.amount });
}

export const count = (w: World, sql: string, ...params: any[]) => (one(w.ctx, sql, ...params) as any).c as number;
