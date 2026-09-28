// Deity catalogue, devotional library and editorial workflow (proposal §1, §7, §8 calendar).
import { type Actor, type Ctx, all, audit, conflict, invalid, json, newId, notFound, nowIso, one, requireRole, run, tx } from '../core.ts';
import { hasPremium } from './identity.ts';

export function listDeities(ctx: Ctx) {
  return all(ctx, 'SELECT * FROM deities WHERE published = 1 ORDER BY name').map(shapeDeity);
}

export function getDeity(ctx: Ctx, id: string) {
  const d = one(ctx, 'SELECT * FROM deities WHERE id = ? AND published = 1', id);
  if (!d) throw notFound('deity');
  const related = json<string[]>(d.related, []).map(r => one(ctx, 'SELECT id, name, name_hi FROM deities WHERE id = ? AND published = 1', r)).filter(Boolean);
  const counts = all(ctx, `SELECT format, COUNT(*) n FROM content_items WHERE deity_id = ? AND editorial_status = 'published' GROUP BY format`, id);
  return { ...shapeDeity(d), related, contentCounts: Object.fromEntries(counts.map(c => [c.format, c.n])) };
}

const shapeDeity = (d: any) => ({ id: d.id, name: d.name, nameHi: d.name_hi, aliases: json<string[]>(d.aliases, []) });

export function requestDeity(ctx: Ctx, actor: Actor | null, input: { name: string; aliases?: string; region?: string; language?: string }) {
  if (!input.name?.trim()) throw invalid('name_required');
  const id = newId('drq');
  run(ctx, 'INSERT INTO deity_requests (id, user_id, name, aliases, region, language, created_at) VALUES (?,?,?,?,?,?,?)',
    id, actor?.id ?? null, input.name.trim(), input.aliases ?? null, input.region ?? null, input.language ?? null, nowIso(ctx));
  return { id, status: 'received' };
}

export interface ContentFilter {
  deity?: string; format?: string; language?: string; maxMinutes?: number; tradition?: string; difficulty?: string; q?: string;
}

/** Published items only. Premium bodies are withheld unless the viewer has an active membership. */
export function listContent(ctx: Ctx, viewerId: string | undefined, f: ContentFilter = {}) {
  const where = [`editorial_status = 'published'`];
  const params: any[] = [];
  if (f.deity) { where.push('deity_id = ?'); params.push(f.deity); }
  if (f.format) { where.push('format = ?'); params.push(f.format); }
  if (f.language) { where.push('language = ?'); params.push(f.language); }
  if (f.tradition) { where.push('(tradition = ? OR tradition IS NULL)'); params.push(f.tradition); }
  if (f.difficulty) { where.push('difficulty = ?'); params.push(f.difficulty); }
  if (f.maxMinutes) { where.push('duration_sec <= ?'); params.push(f.maxMinutes * 60); }
  if (f.q) { where.push('title LIKE ?'); params.push(`%${f.q}%`); }
  const premium = hasPremium(ctx, viewerId);
  return all(ctx, `SELECT * FROM content_items WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 200`, ...params)
    .map(i => shapeItem(i, premium, false));
}

export function getContent(ctx: Ctx, viewerId: string | undefined, id: string) {
  const i = one(ctx, `SELECT * FROM content_items WHERE id = ? AND editorial_status = 'published'`, id);
  if (!i) throw notFound('content');
  return shapeItem(i, hasPremium(ctx, viewerId), true);
}

function shapeItem(i: any, premium: boolean, withBody: boolean) {
  const locked = i.tier === 'premium' && !premium;
  return {
    id: i.id, deityId: i.deity_id, title: i.title, language: i.language, format: i.format, kind: i.kind,
    // Source scripture is always distinguished from translation, commentary and storytelling.
    isSourceText: i.kind === 'source', durationSec: i.duration_sec, tradition: i.tradition, difficulty: i.difficulty,
    tier: i.tier, locked, credits: i.credits, version: i.current_version,
    ...(withBody ? { body: locked ? null : i.body } : {}),
  };
}

export function recordPlay(ctx: Ctx, actor: Actor, itemId: string, completed: boolean) {
  if (!one(ctx, `SELECT 1 FROM content_items WHERE id = ? AND editorial_status = 'published'`, itemId)) throw notFound('content');
  run(ctx, 'INSERT INTO plays (user_id, item_id, at, completed) VALUES (?,?,?,?)', actor.id, itemId, nowIso(ctx), completed ? 1 : 0);
  return { ok: true };
}

export function saveItem(ctx: Ctx, actor: Actor, itemId: string, saved: boolean) {
  if (saved) run(ctx, 'INSERT OR IGNORE INTO saved_items (user_id, item_id, at) VALUES (?,?,?)', actor.id, itemId, nowIso(ctx));
  else run(ctx, 'DELETE FROM saved_items WHERE user_id = ? AND item_id = ?', actor.id, itemId);
  return all(ctx, 'SELECT item_id FROM saved_items WHERE user_id = ? ORDER BY at DESC', actor.id).map(r => r.item_id);
}

// Editorial workflow ------------------------------------------------------

const FLOW = ['brief', 'draft', 'religious_review', 'recording', 'language_review', 'rights_clearance', 'metadata', 'published'] as const;

export function createItem(ctx: Ctx, actor: Actor, input: {
  deityId?: string; title: string; language: string; format: string; kind: string; durationSec?: number;
  tradition?: string; difficulty?: string; tier?: 'free' | 'premium'; credits?: string; body?: string; aiAssisted?: boolean;
}) {
  requireRole(actor, 'editor');
  const id = newId('cnt');
  tx(ctx, () => {
    run(ctx, `INSERT INTO content_items (id, deity_id, title, language, format, kind, duration_sec, tradition, difficulty, tier, credits, body, ai_assisted, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, input.deityId ?? null, input.title, input.language, input.format, input.kind,
      input.durationSec ?? null, input.tradition ?? null, input.difficulty ?? null, input.tier ?? 'free', input.credits ?? null,
      input.body ?? null, input.aiAssisted ? 1 : 0, nowIso(ctx));
    run(ctx, 'INSERT INTO content_versions (item_id, version, note, by_user, at) VALUES (?,?,?,?,?)', id, 1, 'created', actor.id, nowIso(ctx));
    audit(ctx, actor, 'content.created', 'content', id);
  });
  return id;
}

/** Moves an item one step forward. Publishing requires every rights element to be cleared. */
export function advance(ctx: Ctx, actor: Actor, itemId: string, to: string, note?: string) {
  requireRole(actor, 'editor');
  const item = one(ctx, 'SELECT * FROM content_items WHERE id = ?', itemId);
  if (!item) throw notFound('content');
  const from = item.editorial_status === 'unpublished' ? 'metadata' : item.editorial_status;
  const iFrom = FLOW.indexOf(from), iTo = FLOW.indexOf(to as any);
  if (iTo !== iFrom + 1) throw invalid('bad_transition', `Cannot move from ${item.editorial_status} to ${to}`);
  if (to === 'published') {
    const rights = all(ctx, 'SELECT status FROM rights_records WHERE item_id = ?', itemId);
    if (rights.length === 0 || rights.some(r => r.status !== 'cleared')) throw conflict('rights_not_cleared', 'Clear every rights element before publishing');
  }
  tx(ctx, () => {
    run(ctx, 'UPDATE content_items SET editorial_status = ? WHERE id = ?', to, itemId);
    audit(ctx, actor, `content.${to}`, 'content', itemId, note ? { note } : undefined);
  });
  return { id: itemId, status: to };
}

/** Takes an item down promptly without deleting its history or audit trail. */
export function unpublish(ctx: Ctx, actor: Actor, itemId: string, reason: string) {
  requireRole(actor, 'editor');
  if (!reason) throw invalid('reason_required');
  run(ctx, `UPDATE content_items SET editorial_status = 'unpublished' WHERE id = ?`, itemId);
  audit(ctx, actor, 'content.unpublished', 'content', itemId, { reason });
  return { id: itemId, status: 'unpublished' };
}

export function addVersion(ctx: Ctx, actor: Actor, itemId: string, note: string, body?: string) {
  requireRole(actor, 'editor');
  const item = one(ctx, 'SELECT current_version FROM content_items WHERE id = ?', itemId);
  if (!item) throw notFound('content');
  const v = item.current_version + 1;
  tx(ctx, () => {
    run(ctx, 'INSERT INTO content_versions (item_id, version, note, by_user, at) VALUES (?,?,?,?,?)', itemId, v, note, actor.id, nowIso(ctx));
    run(ctx, 'UPDATE content_items SET current_version = ?, body = COALESCE(?, body) WHERE id = ?', v, body ?? null, itemId);
  });
  return { id: itemId, version: v };
}

export function setRights(ctx: Ctx, actor: Actor, itemId: string, element: string, status: 'pending' | 'cleared' | 'rejected', reference?: string) {
  requireRole(actor, 'editor');
  const existing = one(ctx, 'SELECT id FROM rights_records WHERE item_id = ? AND element = ?', itemId, element);
  if (existing) run(ctx, 'UPDATE rights_records SET status = ?, reference = ? WHERE id = ?', status, reference ?? null, existing.id);
  else run(ctx, 'INSERT INTO rights_records (id, item_id, element, status, reference) VALUES (?,?,?,?,?)', newId('rgt'), itemId, element, status, reference ?? null);
  audit(ctx, actor, 'rights.updated', 'content', itemId, { element, status });
  return all(ctx, 'SELECT element, status, reference FROM rights_records WHERE item_id = ?', itemId);
}

export function pipeline(ctx: Ctx, actor: Actor) {
  requireRole(actor, 'editor', 'ops');
  return all(ctx, 'SELECT editorial_status status, COUNT(*) n FROM content_items GROUP BY editorial_status');
}

// Observances -------------------------------------------------------------

/** Returns observances for the viewer's tradition plus any differing dates in other traditions. */
export function observances(ctx: Ctx, input: { tradition: string; from: string; to: string }) {
  const mine = all(ctx, 'SELECT * FROM observances WHERE reviewed = 1 AND tradition = ? AND date BETWEEN ? AND ? ORDER BY date', input.tradition, input.from, input.to);
  return mine.map(o => {
    const others = all(ctx, 'SELECT tradition, date FROM observances WHERE reviewed = 1 AND name = ? AND tradition <> ? AND date <> ?', o.name, o.tradition, o.date);
    return { id: o.id, name: o.name, deityId: o.deity_id, date: o.date, tradition: o.tradition, location: o.location, tz: o.tz, source: o.source, differsIn: others };
  });
}
