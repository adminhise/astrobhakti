// Priest platform: application, verification lifecycle, availability and matching (proposal §5, §6).
import { type Actor, type Ctx, addMinutes, all, audit, conflict, forbidden, invalid, json, newId, notFound, notify, nowIso, one, requireRole, run, tx } from '../core.ts';

export type PriestStatus = 'applied' | 'under_review' | 'approved' | 'active' | 'paused' | 'suspended';

const TRANSITIONS: Record<PriestStatus, PriestStatus[]> = {
  applied: ['under_review'],
  under_review: ['approved', 'applied'],       // back to applied = correction requested
  approved: ['active', 'paused'],
  active: ['paused', 'suspended'],
  paused: ['active', 'suspended'],
  suspended: ['active'],                       // after an upheld appeal
};

const REQUIRED_FOR_APPROVAL = ['identity', 'references', 'interview', 'sample_ritual'];

export function apply(ctx: Ctx, actor: Actor, input: { displayName: string; languages: string[]; rituals: string[]; city: string; travelRadiusKm?: number }) {
  if (one(ctx, 'SELECT 1 FROM priests WHERE user_id = ?', actor.id)) throw conflict('already_applied');
  if (!input.displayName || !input.city) throw invalid('missing_fields');
  const id = newId('prs');
  // Registration creates an application, not permission to accept bookings.
  run(ctx, `INSERT INTO priests (id, user_id, display_name, status, languages, rituals, city, travel_radius_km, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`, id, actor.id, input.displayName, 'applied', JSON.stringify(input.languages ?? []),
    JSON.stringify(input.rituals ?? []), input.city, input.travelRadiusKm ?? 10, nowIso(ctx));
  audit(ctx, actor, 'priest.applied', 'priest', id);
  return id;
}

export function getPriest(ctx: Ctx, id: string) {
  const p = one(ctx, 'SELECT * FROM priests WHERE id = ?', id);
  if (!p) throw notFound('priest');
  return shape(ctx, p);
}

export function priestForUser(ctx: Ctx, userId: string) {
  const p = one(ctx, 'SELECT * FROM priests WHERE user_id = ?', userId);
  if (!p) throw forbidden('not a priest');
  return p;
}

function shape(ctx: Ctx, p: any) {
  const checks = all(ctx, 'SELECT kind, completed_at FROM verification_checks WHERE priest_id = ? ORDER BY completed_at', p.id);
  return {
    id: p.id, displayName: p.display_name, status: p.status, languages: json<string[]>(p.languages, []),
    rituals: json<string[]>(p.rituals, []), city: p.city, travelRadiusKm: p.travel_radius_km, bufferMin: p.buffer_min,
    // A badge records which checks were completed and when; it does not guarantee conduct.
    verification: checks.map(c => ({ kind: c.kind, completedAt: c.completed_at })),
  };
}

export function recordCheck(ctx: Ctx, actor: Actor, priestId: string, kind: string) {
  requireRole(actor, 'verification');
  if (!['identity', 'references', 'interview', 'sample_ritual', 'payout_details'].includes(kind)) throw invalid('bad_check');
  run(ctx, `INSERT INTO verification_checks (priest_id, kind, completed_at, by_user) VALUES (?,?,?,?)
    ON CONFLICT(priest_id, kind) DO UPDATE SET completed_at = excluded.completed_at, by_user = excluded.by_user`, priestId, kind, nowIso(ctx), actor.id);
  audit(ctx, actor, 'priest.check', 'priest', priestId, { kind });
  return getPriest(ctx, priestId);
}

/**
 * Moves a priest through Applied → Under review → Approved → Active ⇄ Paused → Suspended.
 * Pausing or suspending surfaces every future booking to operations for reassignment.
 */
export function setStatus(ctx: Ctx, actor: Actor, priestId: string, to: PriestStatus, reason?: string) {
  requireRole(actor, 'verification', 'ops');
  const p = one(ctx, 'SELECT * FROM priests WHERE id = ?', priestId);
  if (!p) throw notFound('priest');
  if (!TRANSITIONS[p.status as PriestStatus].includes(to)) throw invalid('bad_transition', `Cannot move from ${p.status} to ${to}`);
  const done = new Set(all(ctx, 'SELECT kind FROM verification_checks WHERE priest_id = ?', priestId).map(c => c.kind));
  if (to === 'approved' && !REQUIRED_FOR_APPROVAL.every(k => done.has(k))) throw conflict('checks_incomplete', 'Identity, references, interview and sample ritual review are required');
  if (to === 'active' && !done.has('payout_details')) throw conflict('payout_unverified');
  let surfaced: any[] = [];
  tx(ctx, () => {
    run(ctx, 'UPDATE priests SET status = ? WHERE id = ?', to, priestId);
    if (to === 'paused' || to === 'suspended') {
      surfaced = all(ctx, `SELECT id, code, starts_at FROM bookings WHERE priest_id = ? AND status IN ('held','confirmed') AND starts_at > ?`, priestId, nowIso(ctx));
      for (const ops of all(ctx, `SELECT id FROM users WHERE role IN ('ops','admin') AND deleted_at IS NULL`))
        for (const b of surfaced) notify(ctx, ops.id, 'ops.reassign', `Booking ${b.code} needs a new priest (priest ${to})`);
    }
    audit(ctx, actor, `priest.${to}`, 'priest', priestId, { reason, surfaced: surfaced.map(b => b.id) });
  });
  return { priest: getPriest(ctx, priestId), bookingsNeedingReassignment: surfaced };
}

export function canAccept(p: { status: string }) {
  return p.status === 'active';
}

export function updateProfile(ctx: Ctx, actor: Actor, input: { languages?: string[]; rituals?: string[]; travelRadiusKm?: number; bufferMin?: number }) {
  const p = priestForUser(ctx, actor.id);
  // Material changes (rituals, languages) need approval before going live; buffers and radius apply immediately.
  const material = input.languages || input.rituals;
  run(ctx, 'UPDATE priests SET travel_radius_km = COALESCE(?, travel_radius_km), buffer_min = COALESCE(?, buffer_min) WHERE id = ?',
    input.travelRadiusKm ?? null, input.bufferMin ?? null, p.id);
  if (material) audit(ctx, actor, 'priest.change_requested', 'priest', p.id, { languages: input.languages, rituals: input.rituals });
  return { ...getPriest(ctx, p.id), pendingApproval: !!material };
}

export function approveProfileChange(ctx: Ctx, actor: Actor, priestId: string, change: { languages?: string[]; rituals?: string[] }) {
  requireRole(actor, 'verification');
  run(ctx, 'UPDATE priests SET languages = COALESCE(?, languages), rituals = COALESCE(?, rituals) WHERE id = ?',
    change.languages ? JSON.stringify(change.languages) : null, change.rituals ? JSON.stringify(change.rituals) : null, priestId);
  audit(ctx, actor, 'priest.change_approved', 'priest', priestId, change);
  return getPriest(ctx, priestId);
}

export function addTimeOff(ctx: Ctx, actor: Actor, input: { startsAt: string; endsAt: string }) {
  const p = priestForUser(ctx, actor.id);
  const id = newId('res');
  tx(ctx, () => run(ctx, `INSERT INTO priest_reservations (id, priest_id, kind, starts_at, ends_at) VALUES (?,?,?,?,?)`, id, p.id, 'time_off', input.startsAt, input.endsAt));
  return id;
}

export function schedule(ctx: Ctx, actor: Actor, from: string, to: string) {
  const p = priestForUser(ctx, actor.id);
  return all(ctx, `SELECT r.id, r.kind, r.starts_at, r.ends_at, b.code, b.starts_at AS service_starts_at, b.ends_at AS service_ends_at, s.name AS service
    FROM priest_reservations r LEFT JOIN bookings b ON b.id = r.booking_id LEFT JOIN services s ON s.id = b.service_id
    WHERE r.priest_id = ? AND r.active = 1 AND r.ends_at > ? AND r.starts_at < ? ORDER BY r.starts_at`, p.id, from, to);
}

/** Travel buffer applied around a booking for this service format. */
export function bufferFor(priest: any, format: string) {
  return format === 'home_visit' ? priest.buffer_min : 10;
}

/**
 * Qualified, active priests who are free for the whole window including buffers,
 * ordered by fewest commitments that day (spreads load) then name.
 */
export function eligiblePriests(ctx: Ctx, input: { serviceCode: string; format: string; city?: string; language?: string; startsAt: string; endsAt: string }) {
  const candidates = all(ctx, `SELECT * FROM priests WHERE status = 'active'`).filter(p =>
    json<string[]>(p.rituals, []).includes(input.serviceCode)
    && (!input.language || json<string[]>(p.languages, []).includes(input.language))
    && (input.format !== 'home_visit' || !input.city || p.city === input.city));
  const day = input.startsAt.slice(0, 10);
  return candidates
    .filter(p => {
      const buf = bufferFor(p, input.format);
      const s = addMinutes(input.startsAt, -buf), e = addMinutes(input.endsAt, buf);
      return !one(ctx, 'SELECT 1 FROM priest_reservations WHERE priest_id = ? AND active = 1 AND starts_at < ? AND ? < ends_at', p.id, e, s);
    })
    .map(p => ({ p, load: one(ctx, `SELECT COUNT(*) c FROM priest_reservations WHERE priest_id = ? AND active = 1 AND substr(starts_at,1,10) = ?`, p.id, day).c }))
    .sort((a, b) => a.load - b.load || a.p.display_name.localeCompare(b.p.display_name))
    .map(({ p }) => shape(ctx, p));
}

export function coverage(ctx: Ctx, actor: Actor) {
  requireRole(actor, 'ops', 'verification');
  const services = all(ctx, `SELECT code, name, priests_required FROM services WHERE active = 1 AND format <> 'group_live'`);
  const active = all(ctx, `SELECT rituals FROM priests WHERE status = 'active'`);
  return services.map(s => {
    const eligible = active.filter(p => json<string[]>(p.rituals, []).includes(s.code)).length;
    // Planning rule: at least two eligible options per actively marketed core service.
    return { code: s.code, name: s.name, eligible, ok: eligible >= Math.max(2, s.priests_required * 2) };
  });
}
