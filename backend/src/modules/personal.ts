// Private ceremonies, private notes, reminders, mantra counts and support (proposal §2, §4, §8).
import { type Actor, type Ctx, addMinutes, all, audit, conflict, forbidden, invalid, newId, newToken, notFound, nowIso, one, run } from '../core.ts';

// Private ceremony rooms -------------------------------------------------

/** Invitations expire when the room closes and are single-claim, not a public reusable link. */
export function inviteToRoom(ctx: Ctx, actor: Actor, bookingId: string) {
  const room = one(ctx, 'SELECT r.*, b.user_id FROM ceremony_rooms r JOIN bookings b ON b.id = r.booking_id WHERE r.booking_id = ?', bookingId);
  if (!room) throw notFound('room');
  if (room.user_id !== actor.id) throw forbidden('only the booking owner can invite');
  const claimed = one(ctx, 'SELECT COUNT(*) c FROM ceremony_invites WHERE room_id = ? AND revoked = 0', room.id).c;
  if (claimed + 1 >= room.max_participants) throw conflict('room_full', `A private room holds up to ${room.max_participants} participants`);
  const token = newToken();
  run(ctx, 'INSERT INTO ceremony_invites (token, room_id, invited_by, expires_at) VALUES (?,?,?,?)', token, room.id, actor.id, room.closes_at);
  return { token, expiresAt: room.closes_at };
}

export function revokeInvite(ctx: Ctx, actor: Actor, token: string) {
  const inv = one(ctx, 'SELECT * FROM ceremony_invites WHERE token = ?', token);
  if (!inv || inv.invited_by !== actor.id) throw notFound('invite');
  run(ctx, 'UPDATE ceremony_invites SET revoked = 1 WHERE token = ?', token);
  return { revoked: true };
}

/**
 * Authorises joining a private ceremony. Allowed: the booking owner, the assigned priest (host), or the
 * account that claimed a valid unexpired invite. Everyone else, including holders of an expired or
 * revoked invite, is refused.
 */
export function joinRoom(ctx: Ctx, actor: Actor, bookingId: string, inviteToken?: string) {
  const room = one(ctx, `SELECT r.*, b.user_id, b.status, b.priest_id FROM ceremony_rooms r JOIN bookings b ON b.id = r.booking_id WHERE r.booking_id = ?`, bookingId);
  if (!room) throw notFound('room');
  if (!['confirmed', 'in_progress'].includes(room.status)) throw conflict('not_active');
  const now = nowIso(ctx);
  if (now < room.opens_at || now > room.closes_at) throw forbidden('room is not open');
  const hostUser = room.priest_id ? one(ctx, 'SELECT user_id FROM priests WHERE id = ?', room.priest_id)?.user_id : null;
  if (actor.id === hostUser) return { role: 'host', roomId: room.id, recording: room.recording === 1 };
  if (actor.id === room.user_id) return { role: 'owner', roomId: room.id, recording: room.recording === 1 };
  const already = one(ctx, 'SELECT * FROM ceremony_invites WHERE room_id = ? AND claimed_by = ? AND revoked = 0 AND expires_at > ?', room.id, actor.id, now);
  if (already) return { role: 'guest', roomId: room.id, recording: room.recording === 1 };
  if (!inviteToken) throw forbidden('invitation required');
  const inv = one(ctx, 'SELECT * FROM ceremony_invites WHERE token = ? AND room_id = ?', inviteToken, room.id);
  if (!inv || inv.revoked || inv.expires_at <= now) throw forbidden('invitation expired or revoked');
  if (inv.claimed_by && inv.claimed_by !== actor.id) throw forbidden('invitation already used');
  run(ctx, 'UPDATE ceremony_invites SET claimed_by = ? WHERE token = ?', actor.id, inviteToken);
  return { role: 'guest', roomId: room.id, recording: room.recording === 1 };
}

/** Recording is off by default and needs every participant's consent. */
export function setRecording(ctx: Ctx, actor: Actor, bookingId: string, on: boolean, consentFromAll: boolean) {
  const room = one(ctx, 'SELECT r.*, b.user_id FROM ceremony_rooms r JOIN bookings b ON b.id = r.booking_id WHERE r.booking_id = ?', bookingId);
  if (!room || room.user_id !== actor.id) throw notFound('room');
  if (on && !consentFromAll) throw conflict('consent_required', 'Every participant must agree before recording');
  run(ctx, 'UPDATE ceremony_rooms SET recording = ? WHERE id = ?', on ? 1 : 0, room.id);
  audit(ctx, actor, on ? 'recording.on' : 'recording.off', 'booking', bookingId);
  return { recording: on };
}

// Private notes: readable only by their author, never by staff roles -------

export function listNotes(ctx: Ctx, actor: Actor) {
  return all(ctx, 'SELECT id, body, created_at FROM notes WHERE user_id = ? ORDER BY created_at DESC', actor.id);
}

export function addNote(ctx: Ctx, actor: Actor, body: string) {
  if (!body?.trim()) throw invalid('empty_note');
  const id = newId('note');
  run(ctx, 'INSERT INTO notes (id, user_id, body, created_at) VALUES (?,?,?,?)', id, actor.id, body.trim(), nowIso(ctx));
  return id;
}

export function getNote(ctx: Ctx, actor: Actor, id: string) {
  const n = one(ctx, 'SELECT * FROM notes WHERE id = ?', id);
  // Same response for missing and not-yours so note ids cannot be probed.
  if (!n || n.user_id !== actor.id) throw notFound('note');
  return { id: n.id, body: n.body, createdAt: n.created_at };
}

export function deleteNote(ctx: Ctx, actor: Actor, id: string) {
  getNote(ctx, actor, id);
  run(ctx, 'DELETE FROM notes WHERE id = ?', id);
  return { deleted: true };
}

// Addresses ------------------------------------------------------------------

export function addAddress(ctx: Ctx, actor: Actor, a: { line1: string; line2?: string; city: string; postalCode: string; accessNotes?: string }) {
  if (!a.line1 || !a.city || !/^[0-9]{6}$/.test(a.postalCode ?? '')) throw invalid('bad_address');
  const id = newId('adr');
  run(ctx, 'INSERT INTO addresses (id, user_id, line1, line2, city, postal_code, access_notes) VALUES (?,?,?,?,?,?,?)',
    id, actor.id, a.line1, a.line2 ?? null, a.city, a.postalCode, a.accessNotes ?? null);
  return id;
}

export function listAddresses(ctx: Ctx, actor: Actor) {
  return all(ctx, 'SELECT id, line1, line2, city, postal_code postalCode, access_notes accessNotes FROM addresses WHERE user_id = ?', actor.id);
}

// Reminders, mantra counts, playlists ----------------------------------------

export function setReminder(ctx: Ctx, actor: Actor, r: { kind: string; refId?: string; localTime: string; days?: number[] }) {
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(r.localTime)) throw invalid('bad_time');
  const id = newId('rem');
  run(ctx, 'INSERT INTO reminders (id, user_id, kind, ref_id, local_time, days) VALUES (?,?,?,?,?,?)',
    id, actor.id, r.kind, r.refId ?? null, r.localTime, JSON.stringify(r.days ?? [0, 1, 2, 3, 4, 5, 6]));
  return id;
}

export function listReminders(ctx: Ctx, actor: Actor) {
  return all(ctx, 'SELECT id, kind, ref_id refId, local_time localTime, days FROM reminders WHERE user_id = ?', actor.id)
    .map(r => ({ ...r, days: JSON.parse(r.days) }));
}

export function deleteReminder(ctx: Ctx, actor: Actor, id: string) {
  run(ctx, 'DELETE FROM reminders WHERE id = ? AND user_id = ?', id, actor.id);
  return { deleted: true };
}

/** Private and optional: there are no leaderboards and no streak messages. */
export function countMantra(ctx: Ctx, actor: Actor, mantra: string, by = 1) {
  const day = nowIso(ctx).slice(0, 10);
  run(ctx, `INSERT INTO mantra_counts (user_id, mantra, day, count) VALUES (?,?,?,?)
    ON CONFLICT(user_id, mantra, day) DO UPDATE SET count = count + excluded.count`, actor.id, mantra, day, by);
  return one(ctx, 'SELECT count FROM mantra_counts WHERE user_id = ? AND mantra = ? AND day = ?', actor.id, mantra, day);
}

export function practiceHistory(ctx: Ctx, actor: Actor, month: string) {
  return all(ctx, `SELECT day, SUM(count) count FROM mantra_counts WHERE user_id = ? AND substr(day,1,7) = ? GROUP BY day ORDER BY day`, actor.id, month);
}

export function savePlaylist(ctx: Ctx, actor: Actor, p: { id?: string; name: string; items: string[] }) {
  const id = p.id ?? newId('pl');
  run(ctx, `INSERT INTO playlists (id, user_id, name, items) VALUES (?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, items = excluded.items WHERE playlists.user_id = excluded.user_id`,
    id, actor.id, p.name, JSON.stringify(p.items));
  return id;
}

// Support ---------------------------------------------------------------------

export function openCase(ctx: Ctx, actor: Actor, c: { topic: string; body: string; bookingId?: string; safety?: boolean }) {
  if (!c.topic || !c.body) throw invalid('missing_fields');
  const id = newId('case');
  run(ctx, 'INSERT INTO support_cases (id, user_id, booking_id, topic, body, safety, status, created_at) VALUES (?,?,?,?,?,?,?,?)',
    id, actor.id, c.bookingId ?? null, c.topic, c.body, c.safety ? 1 : 0, 'open', nowIso(ctx));
  audit(ctx, actor, c.safety ? 'safety.reported' : 'case.opened', 'case', id);
  return id;
}

export function requestQuotation(ctx: Ctx, actor: Actor, q: { ceremony: string; dates: string; guests?: string; tradition?: string; notes?: string }) {
  return openCase(ctx, actor, { topic: 'quotation', body: JSON.stringify(q) });
}

export function notificationsFor(ctx: Ctx, actor: Actor) {
  return all(ctx, 'SELECT id, kind, body, created_at createdAt, read_at readAt FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', actor.id);
}

export const roomWindow = (startsAt: string, endsAt: string) => ({ opensAt: addMinutes(startsAt, -15), closesAt: addMinutes(endsAt, 30) });
