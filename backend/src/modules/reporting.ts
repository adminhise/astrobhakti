// Commercial reporting and pilot measures (proposal §10 "Commercial reporting", §11, §13).
import { type Actor, type Ctx, all, one, requireRole } from '../core.ts';

/**
 * Keeps gross booking value, refunds, priest payouts, platform revenue and contribution separate:
 * a customer payment is not automatically company revenue.
 */
export function financeSummary(ctx: Ctx, actor: Actor, month: string) {
  requireRole(actor, 'finance', 'ops');
  const inMonth = `substr(created_at,1,7) = ?`;
  const sum = (sql: string, ...p: any[]) => (one(ctx, sql, ...p)?.v ?? 0) as number;
  const gbv = sum(`SELECT SUM(amount) v FROM payments WHERE purpose = 'booking' AND status IN ('captured','partially_refunded','refunded') AND ${inMonth}`, month);
  const membership = sum(`SELECT SUM(amount - refunded) v FROM payments WHERE purpose = 'membership' AND status IN ('captured','partially_refunded') AND ${inMonth}`, month);
  const refunds = sum(`SELECT SUM(amount) v FROM refunds WHERE ${inMonth}`, month);
  const payouts = all(ctx, `SELECT p.status, SUM(p.net) net, SUM(p.commission) commission FROM payouts p JOIN bookings b ON b.id = p.booking_id
    WHERE substr(b.completed_at,1,7) = ? GROUP BY p.status`, month);
  const commission = payouts.filter(p => p.status !== 'cancelled').reduce((a, p) => a + p.commission, 0);
  const platformItems = sum(`SELECT SUM(i.amount) v FROM booking_items i JOIN bookings b ON b.id = i.booking_id
    WHERE i.kind = 'platform' AND b.status = 'completed' AND substr(b.completed_at,1,7) = ?`, month);
  const liabilities = payouts.filter(p => ['accrued', 'scheduled', 'disputed'].includes(p.status)).reduce((a, p) => a + p.net, 0);
  const paid = payouts.filter(p => p.status === 'paid').reduce((a, p) => a + p.net, 0);
  return {
    month, grossBookingValue: gbv, refunds, membershipReceipts: membership,
    priestPayoutsPaid: paid, priestLiabilities: liabilities,
    platformRevenue: commission + platformItems + membership,
    note: 'Before store or gateway charges, taxes, media, staff, content, support and marketing. Not profit.',
  };
}

/** Pilot measures with their provisional targets. Baselines are established during the pilot. */
export function pilotMeasures(ctx: Ctx, actor: Actor) {
  requireRole(actor, 'ops', 'finance');
  const users = one(ctx, `SELECT COUNT(*) c FROM users WHERE role = 'devotee' AND deleted_at IS NULL`).c || 0;
  const activated = one(ctx, `SELECT COUNT(DISTINCT ud.user_id) c FROM user_deities ud JOIN plays p ON p.user_id = ud.user_id WHERE ud.is_default = 1`).c || 0;
  const confirmed = one(ctx, `SELECT COUNT(*) c FROM bookings WHERE status IN ('completed','no_show','cancelled') AND priest_id IS NOT NULL AND id IN (SELECT booking_id FROM payments WHERE status <> 'pending')`).c || 0;
  const completed = one(ctx, `SELECT COUNT(*) c FROM bookings WHERE status = 'completed'`).c || 0;
  const noShows = one(ctx, `SELECT COUNT(*) c FROM bookings WHERE status = 'no_show'`).c || 0;
  const cases = one(ctx, `SELECT COUNT(*) c FROM support_cases WHERE topic <> 'quotation'`).c || 0;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
  return [
    { measure: 'Preference activation', target: '60% of new accounts', value: pct(activated, users) },
    { measure: 'Service fulfillment', target: '≥ 98%', value: pct(completed, completed + noShows) },
    { measure: 'Refund and complaint cases', target: 'Review every week', value: cases },
    { measure: 'Confirmed services', target: 'Baseline', value: confirmed },
  ];
}

export function auditLog(ctx: Ctx, actor: Actor, limit = 100) {
  requireRole(actor, 'admin', 'ops');
  return all(ctx, 'SELECT at, actor_id, action, entity, entity_id, detail FROM audit_log ORDER BY id DESC LIMIT ?', limit);
}
