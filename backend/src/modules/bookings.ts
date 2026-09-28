// Bookings for online pooja, group ceremonies and home visits (proposal §4, §5, §9).
import { randomInt } from 'node:crypto';
import {
  type Actor, type Ctx, AppError, addMinutes, all, audit, bps, conflict, forbidden, invalid, json, newId, notFound, notify, nowIso, one,
  requireRole, run, translateDbError, tx,
} from '../core.ts';
import { bufferFor, canAccept, eligiblePriests } from './priests.ts';
import { type Platform, accruePayout, checkoutRoute, createPayment, recordProviderEvent, refund } from './payments.ts';

export const HOLD_MINUTES = 10;

export interface QuoteInput { dakshina?: number; additions?: { label: string; amount: number }[] }

/** Itemized amount shown before payment: every charge is a separate line (proposal §5 "What a package must show"). */
export function quote(ctx: Ctx, serviceId: string, opts: QuoteInput = {}) {
  const s = one(ctx, 'SELECT * FROM services WHERE id = ? AND active = 1', serviceId);
  if (!s) throw notFound('service');
  if (s.quote_only) throw conflict('quote_only', 'This ceremony needs a reviewed quotation');
  const items: { label: string; amount: number; kind: string }[] = [];
  items.push({ label: 'Priest fee', amount: s.priest_fee, kind: 'priest' });
  if (s.extras_fee) items.push({ label: s.extras_label ?? 'Extras', amount: s.extras_fee, kind: 'extras' });
  if (s.travel_fee) items.push({ label: 'Travel', amount: s.travel_fee, kind: 'travel' });
  items.push({ label: 'Platform charge', amount: s.platform_fee, kind: 'platform' });
  const taxable = s.platform_fee + s.extras_fee;
  items.push({ label: `GST ${s.gst_bps / 100}% on platform and extras`, amount: bps(taxable, s.gst_bps), kind: 'tax' });
  for (const a of opts.additions ?? []) {
    if (!(a.amount > 0)) throw invalid('bad_addition');
    items.push({ label: a.label, amount: a.amount, kind: 'addition' });
  }
  // Optional dakshina is genuinely optional and goes fully to the priest.
  if (opts.dakshina) {
    if (opts.dakshina < 0) throw invalid('bad_dakshina');
    items.push({ label: 'Dakshina (optional)', amount: opts.dakshina, kind: 'dakshina' });
  }
  return { service: shapeService(s), items, total: items.reduce((a, i) => a + i.amount, 0) };
}

export function shapeService(s: any) {
  return {
    id: s.id, code: s.code, name: s.name, format: s.format, deityId: s.deity_id, tradition: s.tradition,
    durationMin: s.duration_min, durationMax: s.duration_max, priestsRequired: s.priests_required, capacity: s.capacity,
    scope: json<string[]>(s.scope, []), exclusions: json<string[]>(s.exclusions, []),
    namesReadIndividually: s.names_read_individually === null ? null : s.names_read_individually === 1, quoteOnly: s.quote_only === 1,
  };
}

export function listServices(ctx: Ctx, f: { format?: string; deity?: string } = {}) {
  const where = ['active = 1'];
  const params: any[] = [];
  if (f.format) { where.push('format = ?'); params.push(f.format); }
  if (f.deity) { where.push('(deity_id = ? OR deity_id IS NULL)'); params.push(f.deity); }
  return all(ctx, `SELECT * FROM services WHERE ${where.join(' AND ')} ORDER BY name`, ...params).map(s => ({
    ...shapeService(s), fromPrice: s.quote_only ? null : quote(ctx, s.id).total,
  }));
}

/** Releases held slots whose payment never arrived, so abandoned reservations do not block priests. */
export function expireHolds(ctx: Ctx) {
  const expired = all(ctx, `SELECT id FROM bookings WHERE status = 'held' AND hold_expires_at < ?`, nowIso(ctx));
  for (const b of expired) {
    run(ctx, `UPDATE bookings SET status = 'expired' WHERE id = ?`, b.id);
    run(ctx, 'UPDATE priest_reservations SET active = 0 WHERE booking_id = ?', b.id);
    audit(ctx, null, 'booking.expired', 'booking', b.id);
  }
  return expired.length;
}

const bookingCode = (ctx: Ctx) => `AB-${nowIso(ctx).slice(0, 7).replace('-', '')}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;

export interface HoldInput {
  serviceId: string; startsAt: string; priestId?: string; language?: string; city?: string;
  participants?: { name: string; relation?: string; pronunciationNote?: string }[];
  gotra?: string | null; priestAssistGotra?: boolean; addressId?: string; bookedFor?: string; notes?: string;
  dakshina?: number; additions?: { label: string; amount: number }[]; platform?: Platform; groupPrivacy?: boolean;
}

/**
 * Holds a slot for a short time and creates a pending payment. The priest reservation (with travel
 * buffers) is inserted under the database overlap trigger, so two simultaneous requests can never
 * reserve the same priest for overlapping periods.
 */
export function hold(ctx: Ctx, actor: Actor, input: HoldInput) {
  expireHolds(ctx);
  const s = one(ctx, 'SELECT * FROM services WHERE id = ? AND active = 1', input.serviceId);
  if (!s) throw notFound('service');
  if (s.quote_only) throw conflict('quote_only', 'Request a reviewed quotation for this ceremony');
  if (!input.startsAt || input.startsAt <= nowIso(ctx)) throw invalid('bad_start', 'Choose a future time');
  const endsAt = addMinutes(input.startsAt, s.duration_max);
  const q = quote(ctx, s.id, { dakshina: input.dakshina, additions: input.additions });
  if (s.format === 'home_visit') {
    const a = input.addressId ? one(ctx, 'SELECT * FROM addresses WHERE id = ?', input.addressId) : null;
    if (!a || a.user_id !== actor.id) throw invalid('address_required', 'An address you saved is needed for a home visit');
  }
  if (input.bookedFor) {
    const parent = one(ctx, 'SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', input.bookedFor);
    if (!parent) throw invalid('unknown_person');
  }

  const bookingId = newId('bkg');
  const code = bookingCode(ctx);
  let priestId: string | null = null;

  const result = tx(ctx, () => {
    let priest: any = null;
    if (s.format === 'group_live') {
      const taken = one(ctx, `SELECT COUNT(*) c FROM bookings WHERE service_id = ? AND starts_at = ? AND status IN ('held','confirmed','in_progress')`, s.id, input.startsAt).c;
      if (s.capacity && taken >= s.capacity) throw conflict('sold_out', 'No places left in this ceremony');
    } else {
      priest = input.priestId
        ? one(ctx, 'SELECT * FROM priests WHERE id = ?', input.priestId)
        : (() => {
            const best = eligiblePriests(ctx, { serviceCode: s.code, format: s.format, city: input.city, language: input.language, startsAt: input.startsAt, endsAt })[0];
            return best ? one(ctx, 'SELECT * FROM priests WHERE id = ?', best.id) : null;
          })();
      if (!priest) throw conflict('no_priest_available', 'No qualified priest is free at that time');
      if (!canAccept(priest)) throw conflict('priest_not_active', 'This priest cannot accept new services');
      if (!json<string[]>(priest.rituals, []).includes(s.code)) throw conflict('priest_not_qualified');
      priestId = priest.id;
    }
    const needsConsent = !!input.bookedFor && input.bookedFor !== actor.id;
    const participants = (input.participants ?? []).map(pt => ({
      ...pt,
      // In a group ceremony the devotee may choose not to have their name spoken aloud.
      ...(s.format === 'group_live' && input.groupPrivacy ? { name: 'a devotee family' } : {}),
    }));
    run(ctx, `INSERT INTO bookings (id, code, user_id, service_id, priest_id, status, hold_expires_at, starts_at, ends_at, address_id,
      booked_for, consent_status, participants, notes, dakshina, total, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      bookingId, code, actor.id, s.id, priestId, 'held', addMinutes(nowIso(ctx), needsConsent ? 24 * 60 : HOLD_MINUTES), input.startsAt, endsAt,
      input.addressId ?? null, input.bookedFor ?? null, needsConsent ? 'pending' : null,
      JSON.stringify({ people: participants, gotra: input.gotra ?? null, priestAssistGotra: !!input.priestAssistGotra }),
      input.notes ?? null, input.dakshina ?? 0, q.total, nowIso(ctx));
    if (priest) {
      // The overlap trigger rejects this insert if the priest is committed anywhere in the buffered window.
      const buf = bufferFor(priest, s.format);
      run(ctx, 'INSERT INTO priest_reservations (id, priest_id, booking_id, starts_at, ends_at) VALUES (?,?,?,?,?)',
        newId('res'), priest.id, bookingId, addMinutes(input.startsAt, -buf), addMinutes(endsAt, buf));
    }
    for (const i of q.items) run(ctx, 'INSERT INTO booking_items (booking_id, label, amount, kind) VALUES (?,?,?,?)', bookingId, i.label, i.amount, i.kind);
    let paymentId: string | null = null;
    if (needsConsent) {
      notify(ctx, input.bookedFor!, 'booking.consent', `Please confirm the ${s.name} booked for you`);
    } else {
      paymentId = createPayment(ctx, { userId: actor.id, bookingId, purpose: 'booking', amount: q.total, checkout: checkoutRoute('booking', s.format, input.platform ?? 'android').route });
    }
    audit(ctx, actor, 'booking.held', 'booking', bookingId, { priestId, total: q.total });
    return { paymentId };
  });
  return { booking: bookingView(ctx, actor, bookingId), paymentId: result.paymentId, checkout: checkoutRoute('booking', s.format, input.platform ?? 'android') };
}

/** A parent confirms a booking made for them before any payment is taken (proposal §8 family). */
export function consent(ctx: Ctx, actor: Actor, bookingId: string, grant: boolean) {
  const b = one(ctx, 'SELECT * FROM bookings WHERE id = ?', bookingId);
  if (!b || b.booked_for !== actor.id) throw notFound('booking');
  if (b.consent_status !== 'pending' || b.status !== 'held') throw conflict('not_pending');
  const s = one(ctx, 'SELECT format FROM services WHERE id = ?', b.service_id);
  return tx(ctx, () => {
    run(ctx, 'UPDATE bookings SET consent_status = ?, hold_expires_at = ? WHERE id = ?', grant ? 'granted' : 'declined', addMinutes(nowIso(ctx), HOLD_MINUTES), bookingId);
    let paymentId: string | null = null;
    if (grant) paymentId = createPayment(ctx, { userId: b.user_id, bookingId, purpose: 'booking', amount: b.total, checkout: checkoutRoute('booking', s.format, 'android').route });
    else {
      run(ctx, `UPDATE bookings SET status = 'cancelled' WHERE id = ?`, bookingId);
      run(ctx, 'UPDATE priest_reservations SET active = 0 WHERE booking_id = ?', bookingId);
    }
    notify(ctx, b.user_id, 'booking.consent', grant ? 'Consent received. Complete payment to confirm.' : 'The booking was declined.');
    audit(ctx, actor, grant ? 'booking.consent_granted' : 'booking.consent_declined', 'booking', bookingId);
    return { status: grant ? 'granted' : 'declined', paymentId };
  });
}

/**
 * Applies a verified payment provider callback. Confirmation happens only after payment capture AND a
 * valid reservation. Safe to repeat: duplicates change nothing.
 */
export function paymentCallback(ctx: Ctx, input: { providerEventId: string; paymentId: string; type: 'captured' | 'failed'; amount: number }) {
  return tx(ctx, () => {
    const first = recordProviderEvent(ctx, input);
    const pay = one(ctx, 'SELECT * FROM payments WHERE id = ?', input.paymentId);
    if (!pay) throw notFound('payment');
    if (!first) return { duplicate: true, payment: pay.status };
    if (input.type === 'failed') {
      if (pay.status === 'pending') run(ctx, `UPDATE payments SET status = 'failed' WHERE id = ?`, pay.id);
      return { duplicate: false, payment: 'failed' };
    }
    if (pay.status !== 'pending') return { duplicate: false, payment: pay.status, ignored: 'already_settled' };
    if (input.amount !== pay.amount) throw invalid('amount_mismatch');
    run(ctx, `UPDATE payments SET status = 'captured' WHERE id = ?`, pay.id);
    audit(ctx, null, 'payment.captured', 'payment', pay.id, { amount: pay.amount });
    if (pay.purpose === 'extra_charge') return { duplicate: false, payment: 'captured' };
    if (pay.purpose !== 'booking') return { duplicate: false, payment: 'captured' };

    const b = one(ctx, 'SELECT * FROM bookings WHERE id = ?', pay.booking_id);
    let confirmed = false;
    if (b.status === 'held' && b.hold_expires_at >= nowIso(ctx)) confirmed = true;
    else if (b.status === 'held' || b.status === 'expired') {
      // Delayed callback after the hold lapsed: try to take the slot again, otherwise refund in full.
      try {
        run(ctx, 'UPDATE priest_reservations SET active = 1 WHERE booking_id = ?', b.id);
        confirmed = true;
      } catch (err) {
        const e = translateDbError(err);
        if (!(e instanceof AppError && e.code === 'priest_unavailable')) throw e;
      }
    }
    if (!confirmed) {
      run(ctx, `UPDATE bookings SET status = 'cancelled' WHERE id = ?`, b.id);
      refund(ctx, null, { paymentId: pay.id, amount: pay.amount, reason: 'slot_lost', policy: 'reservation_unavailable', note: 'Payment arrived after the held slot was taken; full refund issued automatically', idempotencyKey: `slot_lost:${b.id}` });
      return { duplicate: false, payment: 'refunded', booking: 'cancelled' };
    }
    const svc = one(ctx, 'SELECT * FROM services WHERE id = ?', b.service_id);
    const arrival = svc.format === 'home_visit' ? String(randomInt(0, 10_000)).padStart(4, '0') : null;
    run(ctx, `UPDATE bookings SET status = 'confirmed', hold_expires_at = NULL, arrival_code = ? WHERE id = ?`, arrival, b.id);
    if (svc.format === 'private_online' || svc.format === 'guided_home') {
      run(ctx, 'INSERT OR IGNORE INTO ceremony_rooms (id, booking_id, opens_at, closes_at) VALUES (?,?,?,?)',
        newId('room'), b.id, addMinutes(b.starts_at, -15), addMinutes(b.ends_at, 30));
    }
    notify(ctx, b.user_id, 'booking.confirmed', `${svc.name} is confirmed. Your preparation guide is ready.`);
    if (b.priest_id) {
      const pu = one(ctx, 'SELECT user_id FROM priests WHERE id = ?', b.priest_id);
      if (pu?.user_id) notify(ctx, pu.user_id, 'booking.assigned', `New confirmed booking ${b.code}`);
    }
    audit(ctx, null, 'booking.confirmed', 'booking', b.id);
    return { duplicate: false, payment: 'captured', booking: 'confirmed' };
  });
}

/**
 * Role-aware view. Household addresses are shown only to the owner and to the assigned priest once the
 * booking is confirmed; support sees the area only; nobody else sees the booking at all.
 */
export function bookingView(ctx: Ctx, actor: Actor, bookingId: string) {
  const b = one(ctx, 'SELECT * FROM bookings WHERE id = ?', bookingId);
  if (!b) throw notFound('booking');
  const priestUser = b.priest_id ? one(ctx, 'SELECT user_id FROM priests WHERE id = ?', b.priest_id)?.user_id : null;
  const isOwner = actor.id === b.user_id || actor.id === b.booked_for;
  const isPriest = !!priestUser && actor.id === priestUser;
  const isStaff = ['support', 'ops', 'finance', 'admin'].includes(actor.role);
  if (!isOwner && !isPriest && !isStaff) throw notFound('booking');
  const s = one(ctx, 'SELECT * FROM services WHERE id = ?', b.service_id);
  const addr = b.address_id ? one(ctx, 'SELECT * FROM addresses WHERE id = ?', b.address_id) : null;
  const fullAddress = addr && (isOwner || (isPriest && ['confirmed', 'in_progress'].includes(b.status)));
  const payment = one(ctx, `SELECT id, status, amount, refunded, checkout FROM payments WHERE booking_id = ? AND purpose = 'booking' ORDER BY created_at DESC`, b.id);
  const view: any = {
    id: b.id, code: b.code, status: b.status, service: shapeService(s), priestId: b.priest_id, startsAt: b.starts_at, endsAt: b.ends_at,
    holdExpiresAt: b.hold_expires_at, consentStatus: b.consent_status, total: b.total,
    items: all(ctx, 'SELECT label, amount, kind FROM booking_items WHERE booking_id = ?', b.id),
    payment: payment ?? null,
    address: addr ? (fullAddress
      ? { line1: addr.line1, line2: addr.line2, city: addr.city, postalCode: addr.postal_code, accessNotes: addr.access_notes }
      : { city: addr.city, postalCode: addr.postal_code }) : null,
  };
  if (actor.role === 'finance' && !isOwner) return { id: view.id, code: view.code, status: view.status, total: view.total, items: view.items, payment: view.payment };
  view.participants = json(b.participants, { people: [] });
  view.notes = b.notes;
  if (isOwner) view.arrivalCode = b.arrival_code;
  return view;
}

export function myBookings(ctx: Ctx, actor: Actor) {
  return all(ctx, `SELECT id FROM bookings WHERE (user_id = ? OR booked_for = ?) AND status <> 'expired' ORDER BY starts_at DESC`, actor.id, actor.id)
    .map(r => bookingView(ctx, actor, r.id));
}

function assertPriestOf(ctx: Ctx, actor: Actor, b: any) {
  const p = b.priest_id ? one(ctx, 'SELECT * FROM priests WHERE id = ?', b.priest_id) : null;
  if (!p || p.user_id !== actor.id) throw forbidden('not the assigned priest');
  return p;
}

/** Home visit check-in: the household's arrival code starts the service. */
export function checkIn(ctx: Ctx, actor: Actor, bookingId: string, code?: string) {
  const b = one(ctx, 'SELECT * FROM bookings WHERE id = ?', bookingId);
  if (!b) throw notFound('booking');
  assertPriestOf(ctx, actor, b);
  if (b.status !== 'confirmed') throw conflict('not_confirmed');
  if (b.arrival_code && b.arrival_code !== code) throw invalid('bad_arrival_code');
  run(ctx, `UPDATE bookings SET status = 'in_progress', started_at = ? WHERE id = ?`, nowIso(ctx), bookingId);
  audit(ctx, actor, 'booking.started', 'booking', bookingId);
  return { status: 'in_progress' };
}

/** The priest submits completion against the published scope; the payout accrues once. */
export function complete(ctx: Ctx, actor: Actor, bookingId: string, input: { stepsCompleted: string[] }) {
  const b = one(ctx, 'SELECT * FROM bookings WHERE id = ?', bookingId);
  if (!b) throw notFound('booking');
  assertPriestOf(ctx, actor, b);
  if (b.status !== 'in_progress') throw conflict('not_in_progress');
  return tx(ctx, () => {
    run(ctx, `UPDATE bookings SET status = 'completed', completed_at = ? WHERE id = ?`, nowIso(ctx), bookingId);
    const payout = accruePayout(ctx, bookingId);
    notify(ctx, b.user_id, 'booking.completed', 'Your service summary and receipt are ready.');
    audit(ctx, actor, 'booking.completed', 'booking', bookingId, { steps: input.stepsCompleted });
    return { status: 'completed', payout };
  });
}

/** The priest did not attend: the customer chooses a refund or a replacement they accept. */
export function markNoShow(ctx: Ctx, actor: Actor, bookingId: string) {
  requireRole(actor, 'support', 'ops');
  const b = one(ctx, 'SELECT * FROM bookings WHERE id = ?', bookingId);
  if (!b || b.status !== 'confirmed') throw conflict('not_confirmed');
  run(ctx, `UPDATE bookings SET status = 'no_show' WHERE id = ?`, bookingId);
  run(ctx, 'UPDATE priest_reservations SET active = 0 WHERE booking_id = ?', bookingId);
  notify(ctx, b.user_id, 'booking.no_show', 'Your priest could not attend. Choose a full refund or a replacement slot.');
  audit(ctx, actor, 'booking.no_show', 'booking', bookingId);
  return { status: 'no_show' };
}

export function offerReplacement(ctx: Ctx, actor: Actor, bookingId: string, input: { toPriestId: string; newStartsAt?: string }) {
  requireRole(actor, 'support', 'ops');
  const b = one(ctx, 'SELECT * FROM bookings WHERE id = ?', bookingId);
  if (!b || !['confirmed', 'no_show', 'held'].includes(b.status)) throw conflict('not_replaceable');
  const p = one(ctx, 'SELECT * FROM priests WHERE id = ?', input.toPriestId);
  const s = one(ctx, 'SELECT * FROM services WHERE id = ?', b.service_id);
  if (!p || !canAccept(p) || !json<string[]>(p.rituals, []).includes(s.code)) throw conflict('priest_not_eligible');
  const id = newId('rpl');
  run(ctx, 'INSERT INTO replacement_offers (id, booking_id, from_priest, to_priest, new_starts_at, status, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)',
    id, bookingId, b.priest_id, p.id, input.newStartsAt ?? null, 'offered', actor.id, nowIso(ctx));
  notify(ctx, b.user_id, 'booking.replacement_offer', `${p.display_name} can take your booking. Nothing changes unless you accept.`);
  audit(ctx, actor, 'replacement.offered', 'booking', bookingId, { to: p.id, newStartsAt: input.newStartsAt });
  return id;
}

/** Only the customer's acceptance swaps the priest; the new reservation still passes the overlap trigger. */
export function respondToOffer(ctx: Ctx, actor: Actor, offerId: string, accept: boolean) {
  const o = one(ctx, 'SELECT * FROM replacement_offers WHERE id = ?', offerId);
  if (!o || o.status !== 'offered') throw notFound('offer');
  const b = one(ctx, 'SELECT * FROM bookings WHERE id = ?', o.booking_id);
  if (b.user_id !== actor.id) throw forbidden();
  return tx(ctx, () => {
    run(ctx, 'UPDATE replacement_offers SET status = ? WHERE id = ?', accept ? 'accepted' : 'declined', offerId);
    if (!accept) { audit(ctx, actor, 'replacement.declined', 'booking', b.id); return bookingView(ctx, actor, b.id); }
    const s = one(ctx, 'SELECT * FROM services WHERE id = ?', b.service_id);
    const p = one(ctx, 'SELECT * FROM priests WHERE id = ?', o.to_priest);
    const startsAt = o.new_starts_at ?? b.starts_at;
    const endsAt = addMinutes(startsAt, s.duration_max);
    const buf = bufferFor(p, s.format);
    run(ctx, 'UPDATE priest_reservations SET active = 0 WHERE booking_id = ?', b.id);
    run(ctx, 'INSERT INTO priest_reservations (id, priest_id, booking_id, starts_at, ends_at) VALUES (?,?,?,?,?)',
      newId('res'), p.id, b.id, addMinutes(startsAt, -buf), addMinutes(endsAt, buf));
    run(ctx, `UPDATE bookings SET priest_id = ?, starts_at = ?, ends_at = ?, status = CASE WHEN status = 'no_show' THEN 'confirmed' ELSE status END WHERE id = ?`,
      p.id, startsAt, endsAt, b.id);
    audit(ctx, actor, 'replacement.accepted', 'booking', b.id, { from: o.from_priest, to: p.id });
    return bookingView(ctx, actor, b.id);
  });
}

/** Support (or the customer) moves a booking to a new time with the same priest. */
export function reschedule(ctx: Ctx, actor: Actor, bookingId: string, newStartsAt: string) {
  const b = one(ctx, 'SELECT * FROM bookings WHERE id = ?', bookingId);
  if (!b) throw notFound('booking');
  if (actor.id !== b.user_id) requireRole(actor, 'support', 'ops');
  if (b.status !== 'confirmed') throw conflict('not_confirmed');
  if (newStartsAt <= nowIso(ctx)) throw invalid('bad_start');
  const s = one(ctx, 'SELECT * FROM services WHERE id = ?', b.service_id);
  const endsAt = addMinutes(newStartsAt, s.duration_max);
  return tx(ctx, () => {
    if (b.priest_id) {
      const p = one(ctx, 'SELECT * FROM priests WHERE id = ?', b.priest_id);
      const buf = bufferFor(p, s.format);
      run(ctx, 'UPDATE priest_reservations SET active = 0 WHERE booking_id = ?', b.id);
      run(ctx, 'INSERT INTO priest_reservations (id, priest_id, booking_id, starts_at, ends_at) VALUES (?,?,?,?,?)',
        newId('res'), p.id, b.id, addMinutes(newStartsAt, -buf), addMinutes(endsAt, buf));
    }
    run(ctx, 'UPDATE bookings SET starts_at = ?, ends_at = ? WHERE id = ?', newStartsAt, endsAt, b.id);
    run(ctx, 'UPDATE ceremony_rooms SET opens_at = ?, closes_at = ? WHERE booking_id = ?', addMinutes(newStartsAt, -15), addMinutes(endsAt, 30), b.id);
    notify(ctx, b.user_id, 'booking.rescheduled', `Your booking ${b.code} moved to ${newStartsAt}`);
    audit(ctx, actor, 'booking.rescheduled', 'booking', b.id, { from: b.starts_at, to: newStartsAt });
    return bookingView(ctx, actor, b.id);
  });
}

/** Customer cancellation under the published policy: full refund 24 h or more before, 50% after. */
export function cancel(ctx: Ctx, actor: Actor, bookingId: string) {
  const b = one(ctx, 'SELECT * FROM bookings WHERE id = ?', bookingId);
  if (!b || b.user_id !== actor.id) throw notFound('booking');
  if (!['held', 'confirmed'].includes(b.status)) throw conflict('not_cancellable');
  return tx(ctx, () => {
    const pay = one(ctx, `SELECT * FROM payments WHERE booking_id = ? AND purpose = 'booking' AND status = 'captured'`, b.id);
    run(ctx, `UPDATE bookings SET status = 'cancelled' WHERE id = ?`, b.id);
    run(ctx, 'UPDATE priest_reservations SET active = 0 WHERE booking_id = ?', b.id);
    let refunded = 0;
    if (pay) {
      const early = new Date(b.starts_at).getTime() - ctx.now().getTime() >= 24 * 3600_000;
      refunded = early ? pay.amount : Math.round(pay.amount / 2);
      refund(ctx, null, { paymentId: pay.id, amount: refunded, reason: 'customer_cancelled', policy: early ? 'cancel_24h_full' : 'cancel_late_50',
        note: early ? 'Cancelled at least 24 hours before' : 'Cancelled within 24 hours', idempotencyKey: `cancel:${b.id}` });
    }
    audit(ctx, actor, 'booking.cancelled', 'booking', b.id, { refunded });
    return { status: 'cancelled', refunded };
  });
}

/** Extra charges are recorded and approved by the household before anything is collected. */
export function requestExtra(ctx: Ctx, actor: Actor, bookingId: string, input: { label: string; amount: number }) {
  const b = one(ctx, 'SELECT * FROM bookings WHERE id = ?', bookingId);
  if (!b) throw notFound('booking');
  assertPriestOf(ctx, actor, b);
  if (!(input.amount > 0)) throw invalid('bad_amount');
  const id = newId('xtr');
  run(ctx, 'INSERT INTO extra_charges (id, booking_id, label, amount, status, requested_at) VALUES (?,?,?,?,?,?)', id, bookingId, input.label, input.amount, 'requested', nowIso(ctx));
  notify(ctx, b.user_id, 'booking.extra_requested', `${input.label}: ₹${(input.amount / 100).toFixed(2)} needs your approval`);
  return id;
}

export function decideExtra(ctx: Ctx, actor: Actor, extraId: string, approve: boolean) {
  const x = one(ctx, 'SELECT * FROM extra_charges WHERE id = ?', extraId);
  if (!x || x.status !== 'requested') throw notFound('extra charge');
  const b = one(ctx, 'SELECT * FROM bookings WHERE id = ?', x.booking_id);
  if (b.user_id !== actor.id) throw forbidden();
  return tx(ctx, () => {
    run(ctx, 'UPDATE extra_charges SET status = ?, decided_at = ? WHERE id = ?', approve ? 'approved' : 'declined', nowIso(ctx), extraId);
    let paymentId: string | null = null;
    if (approve) {
      run(ctx, 'INSERT INTO booking_items (booking_id, label, amount, kind) VALUES (?,?,?,?)', b.id, x.label, x.amount, 'addition');
      paymentId = createPayment(ctx, { userId: actor.id, bookingId: b.id, purpose: 'extra_charge', amount: x.amount, checkout: 'gateway' });
    }
    audit(ctx, actor, approve ? 'extra.approved' : 'extra.declined', 'booking', b.id, { amount: x.amount });
    return { status: approve ? 'approved' : 'declined', paymentId };
  });
}

export function opsBoard(ctx: Ctx, actor: Actor, day: string) {
  requireRole(actor, 'support', 'ops');
  expireHolds(ctx);
  const rows = all(ctx, `SELECT b.id, b.code, b.status, b.starts_at, b.priest_id, s.name service, s.format,
      (SELECT status FROM payments p WHERE p.booking_id = b.id AND p.purpose = 'booking' ORDER BY created_at DESC LIMIT 1) payment_status,
      pr.status priest_status
    FROM bookings b JOIN services s ON s.id = b.service_id LEFT JOIN priests pr ON pr.id = b.priest_id
    WHERE substr(b.starts_at,1,10) = ? ORDER BY b.starts_at`, day);
  return {
    bookings: rows,
    attention: rows.filter(r => (r.format !== 'group_live' && !r.priest_id) || ['paused', 'suspended'].includes(r.priest_status) || r.status === 'no_show'),
  };
}
