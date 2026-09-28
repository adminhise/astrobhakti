// Identity and preferences (proposal §1 "five deity experience", §2 "First visit", §9).
import {
  type Actor, type Ctx, type Role, AppError, all, audit, forbidden, invalid, newId, newToken, notFound,
  nowIso, one, run, tx, addMinutes,
} from '../core.ts';

const OTP_TTL_MIN = 10;
const SESSION_DAYS = 90;
const otpStore = new Map<string, { code: string; expires: string }>();

/** Starts phone sign-in. In development the code is returned so the app can auto-fill it. */
export function requestOtp(ctx: Ctx, phone: string, opts: { dev?: boolean } = {}) {
  if (!/^\+?[0-9]{10,15}$/.test(phone)) throw invalid('bad_phone');
  const code = opts.dev ? '123456' : String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(phone, { code, expires: addMinutes(nowIso(ctx), OTP_TTL_MIN) });
  return opts.dev ? { sent: true, devCode: code } : { sent: true };
}

export function verifyOtp(ctx: Ctx, phone: string, code: string, name?: string) {
  const entry = otpStore.get(phone);
  if (!entry || entry.code !== code || entry.expires < nowIso(ctx)) throw new AppError(401, 'bad_code');
  otpStore.delete(phone);
  let user = one(ctx, 'SELECT * FROM users WHERE phone = ? AND deleted_at IS NULL', phone);
  if (!user) {
    const id = newId('usr');
    run(ctx, 'INSERT INTO users (id, phone, name, created_at) VALUES (?,?,?,?)', id, phone, name ?? null, nowIso(ctx));
    user = one(ctx, 'SELECT * FROM users WHERE id = ?', id);
  }
  return { token: createSession(ctx, user.id), user: publicUser(user) };
}

export function createUser(ctx: Ctx, input: { name?: string; phone?: string; email?: string; role?: Role; language?: 'hi' | 'en' }) {
  const id = newId('usr');
  run(ctx, 'INSERT INTO users (id, phone, email, name, role, language, created_at) VALUES (?,?,?,?,?,?,?)',
    id, input.phone ?? null, input.email ?? null, input.name ?? null, input.role ?? 'devotee', input.language ?? 'hi', nowIso(ctx));
  return id;
}

export function createSession(ctx: Ctx, userId: string) {
  const token = newToken();
  run(ctx, 'INSERT INTO auth_sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)',
    token, userId, nowIso(ctx), addMinutes(nowIso(ctx), SESSION_DAYS * 24 * 60));
  return token;
}

export function actorFromToken(ctx: Ctx, token: string | undefined): Actor | null {
  if (!token) return null;
  const row = one(ctx, `SELECT u.id, u.role FROM auth_sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ? AND u.deleted_at IS NULL`, token, nowIso(ctx));
  return row ? { id: row.id, role: row.role } : null;
}

const publicUser = (u: any) => ({ id: u.id, name: u.name, role: u.role, language: u.language });

export function me(ctx: Ctx, actor: Actor) {
  const user = one(ctx, 'SELECT * FROM users WHERE id = ?', actor.id);
  if (!user) throw notFound('user');
  const membership = one(ctx, 'SELECT plan, status, renews_at, store FROM memberships WHERE user_id = ?', actor.id) ?? null;
  return { ...publicUser(user), deities: getDeities(ctx, actor.id), membership, consents: getConsents(ctx, actor.id) };
}

export function updateProfile(ctx: Ctx, actor: Actor, input: { name?: string; language?: 'hi' | 'en' }) {
  if (input.language && !['hi', 'en'].includes(input.language)) throw invalid('bad_language');
  run(ctx, 'UPDATE users SET name = COALESCE(?, name), language = COALESCE(?, language) WHERE id = ?',
    input.name ?? null, input.language ?? null, actor.id);
  return me(ctx, actor);
}

export function getDeities(ctx: Ctx, userId: string) {
  return all(ctx, `SELECT d.id, d.name, d.name_hi, ud.position, ud.is_default FROM user_deities ud
    JOIN deities d ON d.id = ud.deity_id WHERE ud.user_id = ? ORDER BY ud.position`, userId)
    .map(r => ({ id: r.id, name: r.name, nameHi: r.name_hi, position: r.position, isDefault: r.is_default === 1 }));
}

/**
 * Replaces a user's selection atomically: one to five published deities, exactly one default.
 * Used both for first-visit onboarding and for syncing a guest's local choices after sign-in,
 * so saved items, notes and playlists are never touched.
 */
export function setDeities(ctx: Ctx, actor: Actor, input: { deities: string[]; defaultDeity: string }) {
  const ids = input.deities ?? [];
  if (ids.length < 1) throw invalid('deity_required', 'Choose at least one deity');
  if (ids.length > 5) throw invalid('deity_limit', 'Choose at most five deities');
  if (new Set(ids).size !== ids.length) throw invalid('duplicate_deity');
  if (!ids.includes(input.defaultDeity)) throw invalid('default_not_selected', 'The default deity must be one of the selected deities');
  for (const id of ids) {
    if (!one(ctx, 'SELECT 1 FROM deities WHERE id = ? AND published = 1', id)) throw invalid('unknown_deity', `Unknown deity ${id}`);
  }
  tx(ctx, () => {
    run(ctx, 'DELETE FROM user_deities WHERE user_id = ?', actor.id);
    ids.forEach((id, i) => run(ctx, 'INSERT INTO user_deities (user_id, deity_id, position, is_default) VALUES (?,?,?,?)',
      actor.id, id, i, id === input.defaultDeity ? 1 : 0));
  });
  return getDeities(ctx, actor.id);
}

/** Selecting a sixth deity: the app asks which one to replace, then calls this. */
export function replaceDeity(ctx: Ctx, actor: Actor, input: { remove: string; add: string }) {
  const current = getDeities(ctx, actor.id);
  if (!current.some(d => d.id === input.remove)) throw invalid('not_selected');
  const ids = current.map(d => (d.id === input.remove ? input.add : d.id));
  const def = current.find(d => d.isDefault)!.id;
  return setDeities(ctx, actor, { deities: ids, defaultDeity: def === input.remove ? input.add : def });
}

export function setConsent(ctx: Ctx, actor: Actor, kind: string, granted: boolean) {
  // Devotional preferences can never be used for advertising audiences (proposal §9).
  if (kind === 'advertising_preferences' && granted) throw invalid('not_allowed', 'Devotional preferences are never used for advertising');
  run(ctx, `INSERT INTO consents (user_id, kind, granted, at) VALUES (?,?,?,?)
    ON CONFLICT(user_id, kind) DO UPDATE SET granted = excluded.granted, at = excluded.at`, actor.id, kind, granted ? 1 : 0, nowIso(ctx));
  return getConsents(ctx, actor.id);
}

export function getConsents(ctx: Ctx, userId: string) {
  const out: Record<string, boolean> = { notes_for_recommendations: false, history_for_recommendations: true, advertising_preferences: false };
  for (const c of all(ctx, 'SELECT kind, granted FROM consents WHERE user_id = ?', userId)) out[c.kind] = c.granted === 1;
  return out;
}

/** Account deletion keeps only the transaction records the law requires, detached from personal data. */
export function deleteAccount(ctx: Ctx, actor: Actor) {
  const active = one(ctx, `SELECT COUNT(*) c FROM bookings WHERE user_id = ? AND status IN ('held','confirmed','in_progress')`, actor.id);
  if (active.c > 0) throw invalid('active_bookings', 'Cancel or complete upcoming bookings first');
  tx(ctx, () => {
    for (const t of ['notes', 'playlists', 'saved_items', 'reminders', 'mantra_counts', 'user_deities', 'consents', 'follows', 'auth_sessions', 'plays'])
      run(ctx, `DELETE FROM ${t} WHERE user_id = ?`, actor.id);
    run(ctx, `UPDATE addresses SET line1 = '[deleted]', line2 = NULL, access_notes = NULL WHERE user_id = ?`, actor.id);
    run(ctx, 'UPDATE users SET name = NULL, phone = NULL, email = NULL, deleted_at = ? WHERE id = ?', nowIso(ctx), actor.id);
    audit(ctx, actor, 'account.deleted', 'user', actor.id);
  });
  return { deleted: true };
}

export function setMembership(ctx: Ctx, userId: string, plan: 'monthly' | 'annual', store: string) {
  const renews = addMinutes(nowIso(ctx), (plan === 'annual' ? 365 : 30) * 24 * 60);
  run(ctx, `INSERT INTO memberships (user_id, plan, status, renews_at, store) VALUES (?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, status = 'active', renews_at = excluded.renews_at, store = excluded.store`,
    userId, plan, 'active', renews, store);
}

export function cancelMembership(ctx: Ctx, actor: Actor) {
  const m = one(ctx, 'SELECT * FROM memberships WHERE user_id = ?', actor.id);
  if (!m) throw notFound('membership');
  run(ctx, `UPDATE memberships SET status = 'cancelled' WHERE user_id = ?`, actor.id);
  return { status: 'cancelled', accessUntil: m.renews_at };
}

export function hasPremium(ctx: Ctx, userId: string | undefined) {
  if (!userId) return false;
  const m = one(ctx, 'SELECT status, renews_at FROM memberships WHERE user_id = ?', userId);
  return !!m && m.renews_at > nowIso(ctx) && (m.status === 'active' || m.status === 'cancelled');
}

export function assertSelf(actor: Actor, userId: string) {
  if (actor.id !== userId) throw forbidden();
}
