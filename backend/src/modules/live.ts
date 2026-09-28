// Live darshan and temple partnerships (proposal §3).
import { type Actor, type Ctx, all, audit, conflict, invalid, newId, notFound, notify, nowIso, one, requireRole, run, tx } from '../core.ts';

type EventType = 'temple_live' | 'astrobhakti_live' | 'recorded';
type Status = 'scheduled' | 'live' | 'interrupted' | 'ended' | 'cancelled';

const TRANSITIONS: Record<Status, Status[]> = {
  scheduled: ['live', 'cancelled'],
  live: ['interrupted', 'ended'],
  interrupted: ['live', 'ended'],
  ended: [],
  cancelled: [],
};

/**
 * The label a viewer sees. A recording is never shown under a Live label, and an
 * interrupted feed says so instead of silently switching to a replay.
 */
export function viewerLabel(e: any): { badge: string; text: string } {
  if (e.type === 'recorded') return { badge: 'recorded', text: `Recorded · ${e.recorded_at.slice(0, 10)}` };
  if (e.status === 'interrupted') return { badge: 'interrupted', text: 'Feed interrupted' };
  if (e.status === 'live') return { badge: 'live', text: e.type === 'temple_live' ? 'LIVE · Temple' : 'LIVE · AstroBhakti' };
  if (e.status === 'ended') return { badge: 'ended', text: 'Ended' };
  if (e.status === 'cancelled') return { badge: 'cancelled', text: 'Cancelled' };
  return { badge: 'scheduled', text: 'Scheduled' };
}

function shape(ctx: Ctx, e: any) {
  const temple = e.temple_id ? one(ctx, 'SELECT id, name, city, tz FROM temples WHERE id = ?', e.temple_id) : null;
  return {
    id: e.id, type: e.type, title: e.title, deityId: e.deity_id, startsAt: e.starts_at, endsAt: e.ends_at,
    status: e.status, label: viewerLabel(e), temple, venue: e.venue, recordedAt: e.recorded_at,
    expectedReturnAt: e.expected_return_at,
    // Chat is off at launch; moderated chat only when staffing exists.
    chat: 'off',
  };
}

export function listEvents(ctx: Ctx, f: { deity?: string; temple?: string; liveNow?: boolean } = {}) {
  const where = [`(e.temple_id IS NULL OR t.published = 1)`, `e.status <> 'cancelled'`];
  const params: any[] = [];
  if (f.deity) { where.push('e.deity_id = ?'); params.push(f.deity); }
  if (f.temple) { where.push('e.temple_id = ?'); params.push(f.temple); }
  if (f.liveNow) where.push(`e.status IN ('live','interrupted')`);
  else { where.push('e.ends_at >= ?'); params.push(nowIso(ctx)); }
  return all(ctx, `SELECT e.* FROM live_events e LEFT JOIN temples t ON t.id = e.temple_id WHERE ${where.join(' AND ')} ORDER BY e.starts_at`, ...params)
    .map(e => shape(ctx, e));
}

export function getEvent(ctx: Ctx, id: string) {
  const e = one(ctx, 'SELECT * FROM live_events WHERE id = ?', id);
  if (!e) throw notFound('event');
  const replay = e.status === 'interrupted' && e.temple_id
    ? one(ctx, `SELECT * FROM live_events WHERE temple_id = ? AND type = 'recorded' ORDER BY recorded_at DESC LIMIT 1`, e.temple_id)
    : null;
  return { ...shape(ctx, e), labeledReplay: replay ? shape(ctx, replay) : null };
}

export function upsertTemple(ctx: Ctx, actor: Actor, input: {
  id?: string; name: string; city: string; tz: string; permissionLive?: boolean; permissionReplay?: boolean; replayDays?: number; tested?: boolean; published?: boolean;
}) {
  requireRole(actor, 'ops');
  // A temple listing is published only after written permission and testing are complete.
  if (input.published && !(input.permissionLive && input.tested)) throw conflict('not_ready', 'Record permission and complete testing before publishing a temple');
  const id = input.id ?? newId('tmp');
  run(ctx, `INSERT INTO temples (id, name, city, tz, permission_live, permission_replay, replay_days, tested, published) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, city=excluded.city, tz=excluded.tz, permission_live=excluded.permission_live,
    permission_replay=excluded.permission_replay, replay_days=excluded.replay_days, tested=excluded.tested, published=excluded.published`,
    id, input.name, input.city, input.tz, input.permissionLive ? 1 : 0, input.permissionReplay ? 1 : 0, input.replayDays ?? 0, input.tested ? 1 : 0, input.published ? 1 : 0);
  audit(ctx, actor, 'temple.upserted', 'temple', id);
  return id;
}

export function createEvent(ctx: Ctx, actor: Actor, input: {
  type: EventType; title: string; templeId?: string; deityId?: string; venue?: string; startsAt: string; endsAt: string;
  recordedAt?: string; ownerId?: string; backupId?: string;
}) {
  requireRole(actor, 'ops');
  if (input.endsAt <= input.startsAt) throw invalid('bad_times');
  if (input.type === 'temple_live' || input.type === 'recorded') {
    const t = input.templeId ? one(ctx, 'SELECT * FROM temples WHERE id = ?', input.templeId) : null;
    if (!t) throw invalid('temple_required');
    if (input.type === 'temple_live' && !(t.permission_live && t.tested)) throw conflict('no_permission', 'Temple live requires written permission and a completed test');
    if (input.type === 'recorded' && !t.permission_replay) throw conflict('no_replay_rights', 'Replay rights are recorded separately from live rights');
  }
  if (input.type === 'astrobhakti_live' && !input.venue) throw invalid('venue_required', 'Our own broadcasts must identify the venue');
  if (input.type === 'recorded' && !input.recordedAt) throw invalid('recorded_at_required');
  if (input.type !== 'recorded' && !(input.ownerId && input.backupId)) throw invalid('owner_required', 'Assign an event owner and a backup contact');
  const id = newId('evt');
  run(ctx, `INSERT INTO live_events (id, temple_id, type, title, deity_id, venue, starts_at, ends_at, status, recorded_at, owner_id, backup_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, id, input.templeId ?? null, input.type, input.title, input.deityId ?? null, input.venue ?? null,
    input.startsAt, input.endsAt, input.type === 'recorded' ? 'ended' : 'scheduled', input.recordedAt ?? null, input.ownerId ?? null, input.backupId ?? null);
  audit(ctx, actor, 'event.created', 'event', id);
  return id;
}

/** Changes the visible status. Interruptions are logged and followers are told when it returns. */
export function setStatus(ctx: Ctx, actor: Actor, eventId: string, to: Status, opts: { note?: string; expectedReturnAt?: string } = {}) {
  requireRole(actor, 'ops');
  const e = one(ctx, 'SELECT * FROM live_events WHERE id = ?', eventId);
  if (!e) throw notFound('event');
  if (e.type === 'recorded') throw invalid('recorded_has_no_live_state');
  if (!TRANSITIONS[e.status as Status].includes(to)) throw invalid('bad_transition', `Cannot move from ${e.status} to ${to}`);
  tx(ctx, () => {
    run(ctx, 'UPDATE live_events SET status = ?, expected_return_at = ? WHERE id = ?', to, to === 'interrupted' ? opts.expectedReturnAt ?? null : null, eventId);
    run(ctx, 'INSERT INTO event_incidents (id, event_id, at, note, by_user) VALUES (?,?,?,?,?)', newId('inc'), eventId, nowIso(ctx),
      opts.note ?? `status → ${to}`, actor.id);
    if (e.temple_id && (to === 'live' || to === 'cancelled')) {
      for (const f of all(ctx, 'SELECT user_id FROM follows WHERE temple_id = ?', e.temple_id))
        notify(ctx, f.user_id, `event.${to}`, to === 'live' ? `${e.title} is live now` : `${e.title} is cancelled today`);
    }
    audit(ctx, actor, `event.${to}`, 'event', eventId, opts);
  });
  return getEvent(ctx, eventId);
}

export function incidents(ctx: Ctx, actor: Actor, eventId: string) {
  requireRole(actor, 'ops');
  return all(ctx, 'SELECT at, note, by_user FROM event_incidents WHERE event_id = ? ORDER BY at', eventId);
}

export function follow(ctx: Ctx, actor: Actor, templeId: string, on: boolean) {
  if (on) run(ctx, 'INSERT OR IGNORE INTO follows (user_id, temple_id) VALUES (?,?)', actor.id, templeId);
  else run(ctx, 'DELETE FROM follows WHERE user_id = ? AND temple_id = ?', actor.id, templeId);
  return { following: on };
}
