// Payments, refunds, payouts and disputes (proposal §4 failure handling, §9 transactions, §10, §11).
import { type Actor, type Ctx, AppError, all, audit, bps, conflict, invalid, newId, notFound, notify, nowIso, one, requireRole, run, tx } from '../core.ts';

export const COMMISSION_BPS = 1500; // illustrative 15% service commission (proposal §10)

export type Platform = 'android' | 'ios' | 'web';
export type Purpose = 'booking' | 'membership' | 'extra_charge';

/**
 * Which checkout applies to a product category on a platform. Apple and Google treat digital
 * memberships, one-to-many live services, person-to-person real-time services and services consumed
 * outside the app differently (proposal §10 [1][2]). This table is an implementation dependency to be
 * re-checked before each store submission, not a legal determination.
 */
export function checkoutRoute(purpose: Purpose, format: string | null, platform: Platform) {
  if (platform === 'web') return { route: 'gateway', reviewed: true };
  if (purpose === 'membership') return { route: 'store_billing', reviewed: true };
  switch (format) {
    case 'group_live': return { route: 'store_billing', reviewed: true, note: 'one-to-many real-time digital service' };
    case 'private_online':
    case 'guided_home': return { route: platform === 'ios' ? 'external_permitted' : 'store_billing', reviewed: false, note: 'person-to-person real-time service: confirm current rules per country' };
    case 'home_visit':
    case 'temple_on_behalf': return { route: 'gateway', reviewed: true, note: 'service consumed outside the app' };
    default: return { route: 'store_billing', reviewed: false };
  }
}

export function createPayment(ctx: Ctx, input: { userId: string; bookingId?: string; purpose: Purpose; amount: number; checkout: string }) {
  if (input.amount <= 0) throw invalid('bad_amount');
  const id = newId('pay');
  run(ctx, 'INSERT INTO payments (id, booking_id, user_id, purpose, amount, status, checkout, created_at) VALUES (?,?,?,?,?,?,?,?)',
    id, input.bookingId ?? null, input.userId, input.purpose, input.amount, 'pending', input.checkout, nowIso(ctx));
  return id;
}

export function getPayment(ctx: Ctx, id: string) {
  const p = one(ctx, 'SELECT * FROM payments WHERE id = ?', id);
  if (!p) throw notFound('payment');
  return p;
}

/**
 * Records a verified provider callback exactly once. A repeated or delayed callback with the same
 * provider event id is a no-op, so it can never create a second charge, booking, refund or payout.
 * Returns whether this call was the first delivery.
 */
export function recordProviderEvent(ctx: Ctx, input: { providerEventId: string; paymentId: string; type: string; amount: number }): boolean {
  if (!input.providerEventId) throw invalid('event_id_required');
  const res = run(ctx, 'INSERT OR IGNORE INTO payment_events (provider_event_id, payment_id, type, amount, processed_at) VALUES (?,?,?,?,?)',
    input.providerEventId, input.paymentId, input.type, input.amount, nowIso(ctx));
  return Number(res.changes) === 1;
}

/**
 * Issues a refund under a disclosed policy. Idempotent by key: calling twice with the same key returns
 * the first refund. Never refunds more than was captured.
 */
export function refund(ctx: Ctx, actor: Actor | null, input: {
  paymentId: string; amount: number; reason: string; policy: string; note: string; idempotencyKey: string;
}) {
  if (actor) requireRole(actor, 'support', 'finance', 'ops');
  if (!input.note) throw invalid('decision_note_required');
  const existing = one(ctx, 'SELECT * FROM refunds WHERE idempotency_key = ?', input.idempotencyKey);
  if (existing) return existing;
  const doIt = () => {
    const p = getPayment(ctx, input.paymentId);
    if (!['captured', 'partially_refunded'].includes(p.status)) throw conflict('not_refundable', `Payment is ${p.status}`);
    const remaining = p.amount - p.refunded;
    if (input.amount <= 0 || input.amount > remaining) throw invalid('bad_amount', `At most ₹${(remaining / 100).toFixed(2)} can be refunded`);
    const id = newId('rfd');
    run(ctx, `INSERT INTO refunds (id, payment_id, amount, reason, policy, decision_note, decided_by, idempotency_key, status, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, id, p.id, input.amount, input.reason, input.policy, input.note, actor?.id ?? null, input.idempotencyKey, 'issued', nowIso(ctx));
    const refunded = p.refunded + input.amount;
    run(ctx, 'UPDATE payments SET refunded = ?, status = ? WHERE id = ?', refunded, refunded === p.amount ? 'refunded' : 'partially_refunded', p.id);
    if (p.booking_id && refunded === p.amount) {
      run(ctx, `UPDATE bookings SET status = 'cancelled' WHERE id = ? AND status NOT IN ('completed')`, p.booking_id);
      run(ctx, 'UPDATE priest_reservations SET active = 0 WHERE booking_id = ?', p.booking_id);
      run(ctx, `UPDATE payouts SET status = 'cancelled' WHERE booking_id = ? AND status IN ('accrued','scheduled')`, p.booking_id);
    }
    notify(ctx, p.user_id, 'refund.issued', `Refund of ₹${(input.amount / 100).toFixed(2)} issued`);
    audit(ctx, actor, 'refund.issued', 'payment', p.id, { amount: input.amount, policy: input.policy, reason: input.reason });
    return one(ctx, 'SELECT * FROM refunds WHERE id = ?', id);
  };
  return ctx.db.isTransaction ? doIt() : tx(ctx, doIt);
}

/** Next Monday (UTC date) on or after completion: the published settlement day. */
export function settlementDate(fromIso: string) {
  const d = new Date(fromIso);
  const add = (8 - d.getUTCDay()) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

/** Accrues the priest's payout for a completed booking. The UNIQUE(priest, booking) key prevents duplicates. */
export function accruePayout(ctx: Ctx, bookingId: string) {
  const b = one(ctx, 'SELECT * FROM bookings WHERE id = ?', bookingId);
  if (!b?.priest_id) return null;
  const items = all(ctx, 'SELECT kind, amount FROM booking_items WHERE booking_id = ?', bookingId);
  const svc = one(ctx, 'SELECT format FROM services WHERE id = ?', b.service_id);
  const sum = (k: string) => items.filter(i => i.kind === k).reduce((a, i) => a + i.amount, 0);
  const gross = sum('priest') + sum('dakshina') + sum('addition');
  const commission = bps(sum('priest'), COMMISSION_BPS);         // dakshina goes fully to the priest
  const reimbursed = sum('travel') + (svc.format === 'home_visit' ? sum('extras') : 0);   // samagri kit supplied by priest
  const net = gross - commission + reimbursed;
  run(ctx, `INSERT OR IGNORE INTO payouts (id, priest_id, booking_id, gross, commission, reimbursed, net, status, settle_on)
    VALUES (?,?,?,?,?,?,?,?,?)`, newId('pyo'), b.priest_id, bookingId, gross, commission, reimbursed, net, 'accrued', settlementDate(nowIso(ctx)));
  return one(ctx, 'SELECT * FROM payouts WHERE priest_id = ? AND booking_id = ?', b.priest_id, bookingId);
}

export function markPayoutsPaid(ctx: Ctx, actor: Actor, ids: string[]) {
  requireRole(actor, 'finance');
  return tx(ctx, () => ids.map(id => {
    const p = one(ctx, 'SELECT * FROM payouts WHERE id = ?', id);
    if (!p) throw notFound('payout');
    if (!['accrued', 'scheduled'].includes(p.status)) throw conflict('not_payable', `Payout ${id} is ${p.status}`);
    run(ctx, `UPDATE payouts SET status = 'paid' WHERE id = ?`, id);
    audit(ctx, actor, 'payout.paid', 'payout', id, { net: p.net });
    return id;
  }));
}

export function priestEarnings(ctx: Ctx, priestId: string) {
  const rows = all(ctx, `SELECT p.*, b.code, s.name AS service, b.completed_at FROM payouts p JOIN bookings b ON b.id = p.booking_id
    JOIN services s ON s.id = b.service_id WHERE p.priest_id = ? ORDER BY b.completed_at DESC`, priestId);
  const total = (st: string[]) => rows.filter(r => st.includes(r.status)).reduce((a, r) => a + r.net, 0);
  return { paid: total(['paid']), pending: total(['accrued', 'scheduled']), disputed: total(['disputed']), items: rows };
}

export function openDispute(ctx: Ctx, actor: Actor, bookingId: string, reason: string) {
  const b = one(ctx, 'SELECT * FROM bookings WHERE id = ?', bookingId);
  if (!b) throw notFound('booking');
  const priest = b.priest_id ? one(ctx, 'SELECT user_id FROM priests WHERE id = ?', b.priest_id) : null;
  if (actor.id !== b.user_id && actor.id !== priest?.user_id) throw new AppError(403, 'forbidden');
  const id = newId('dsp');
  tx(ctx, () => {
    run(ctx, 'INSERT INTO disputes (id, booking_id, opened_by, reason, status, created_at) VALUES (?,?,?,?,?,?)', id, bookingId, actor.id, reason, 'open', nowIso(ctx));
    run(ctx, `UPDATE payouts SET status = 'disputed' WHERE booking_id = ? AND status IN ('accrued','scheduled')`, bookingId);
    audit(ctx, actor, 'dispute.opened', 'booking', bookingId, { reason });
  });
  return id;
}

/** Decides a dispute under the disclosed process; payouts never wait indefinitely on a user action. */
export function decideDispute(ctx: Ctx, actor: Actor, disputeId: string, input: { decision: string; refundAmount?: number; releasePayout: boolean }) {
  requireRole(actor, 'support', 'ops');
  const d = one(ctx, 'SELECT * FROM disputes WHERE id = ?', disputeId);
  if (!d || d.status !== 'open') throw notFound('open dispute');
  return tx(ctx, () => {
    run(ctx, `UPDATE disputes SET status = 'decided', decision = ? WHERE id = ?`, input.decision, disputeId);
    run(ctx, `UPDATE payouts SET status = ? WHERE booking_id = ? AND status = 'disputed'`, input.releasePayout ? 'accrued' : 'cancelled', d.booking_id);
    if (input.refundAmount) {
      const p = one(ctx, `SELECT id FROM payments WHERE booking_id = ? AND purpose = 'booking' AND status IN ('captured','partially_refunded')`, d.booking_id);
      if (p) refund(ctx, actor, { paymentId: p.id, amount: input.refundAmount, reason: 'dispute', policy: 'dispute_decision', note: input.decision, idempotencyKey: `dispute:${disputeId}` });
    }
    audit(ctx, actor, 'dispute.decided', 'booking', d.booking_id, input);
    return one(ctx, 'SELECT * FROM disputes WHERE id = ?', disputeId);
  });
}

export function refundQueue(ctx: Ctx, actor: Actor) {
  requireRole(actor, 'support', 'finance', 'ops');
  return {
    refunds: all(ctx, 'SELECT r.*, p.booking_id FROM refunds r JOIN payments p ON p.id = r.payment_id ORDER BY r.created_at DESC LIMIT 100'),
    disputes: all(ctx, `SELECT * FROM disputes WHERE status = 'open' ORDER BY created_at`),
  };
}
