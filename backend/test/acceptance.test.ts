// The eight "Priority acceptance checks" from proposal §12, one describe block each.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../src/core.ts';
import { world, capture, count } from './helpers.ts';
import * as id from '../src/modules/identity.ts';
import * as cat from '../src/modules/catalogue.ts';
import * as live from '../src/modules/live.ts';
import * as pr from '../src/modules/priests.ts';
import * as bk from '../src/modules/bookings.ts';
import * as pay from '../src/modules/payments.ts';
import * as me from '../src/modules/personal.ts';
import * as rep from '../src/modules/reporting.ts';

const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: unknown) => e instanceof AppError && e.code === code, `expected ${code}`);

// Wed 1 Oct 2026, 9:30 AM IST = 04:00 UTC
const WED_0930 = '2026-10-01T04:00:00.000Z';

describe('1. Deity selection: one to five, one default, recoverable after sign-in', () => {
  it('accepts one to five deities with exactly one default and rejects a sixth', () => {
    const w = world(); const u = w.devotee();
    assert.equal(id.setDeities(w.ctx, u, { deities: ['shiva'], defaultDeity: 'shiva' }).length, 1);
    const five = id.setDeities(w.ctx, u, { deities: ['shiva', 'ganesha', 'krishna', 'rama', 'hanuman'], defaultDeity: 'ganesha' });
    assert.equal(five.filter(d => d.isDefault).length, 1);
    rejects(() => id.setDeities(w.ctx, u, { deities: ['shiva', 'ganesha', 'krishna', 'rama', 'hanuman', 'durga'], defaultDeity: 'shiva' }), 'deity_limit');
    rejects(() => id.setDeities(w.ctx, u, { deities: [], defaultDeity: 'shiva' }), 'deity_required');
    rejects(() => id.setDeities(w.ctx, u, { deities: ['shiva'], defaultDeity: 'krishna' }), 'default_not_selected');
    // The database trigger is the backstop even if application checks were bypassed.
    assert.throws(() => w.ctx.db.prepare('INSERT INTO user_deities (user_id, deity_id, position) VALUES (?,?,?)').run(u.id, 'durga', 9), /deity_limit/);
  });

  it('switches the default and replaces a deity when a sixth is chosen', () => {
    const w = world(); const u = w.devotee();
    id.setDeities(w.ctx, u, { deities: ['shiva', 'ganesha', 'krishna', 'hanuman', 'durga'], defaultDeity: 'shiva' });
    const after = id.replaceDeity(w.ctx, u, { remove: 'krishna', add: 'lakshmi' });
    assert.deepEqual(after.map(d => d.id), ['shiva', 'ganesha', 'lakshmi', 'hanuman', 'durga']);
    const switched = id.setDeities(w.ctx, u, { deities: after.map(d => d.id), defaultDeity: 'lakshmi' });
    assert.equal(switched.find(d => d.isDefault)!.id, 'lakshmi');
  });

  it('restores guest choices after sign-in without touching saved items or notes', () => {
    const w = world();
    const { devCode } = id.requestOtp(w.ctx, '+919812345678', { dev: true }) as any;
    const { user, token } = id.verifyOtp(w.ctx, '+919812345678', devCode, 'Rakhi');
    const actor = id.actorFromToken(w.ctx, token)!;
    assert.equal(actor.id, user.id);
    const item = cat.listContent(w.ctx, actor.id, { deity: 'shiva' })[0];
    cat.saveItem(w.ctx, actor, item.id, true);
    me.addNote(w.ctx, actor, 'Learn verse two');
    // Guest had chosen these on the device before signing in; the app syncs them now.
    id.setDeities(w.ctx, actor, { deities: ['shiva', 'ganesha', 'krishna'], defaultDeity: 'shiva' });
    const profile = id.me(w.ctx, actor);
    assert.deepEqual(profile.deities.map((d: any) => d.id), ['shiva', 'ganesha', 'krishna']);
    assert.equal(count(w, 'SELECT COUNT(*) c FROM saved_items WHERE user_id = ?', actor.id), 1);
    assert.equal(me.listNotes(w.ctx, actor).length, 1);
    // A failed update leaves the previous selection intact (atomic replace).
    assert.throws(() => id.setDeities(w.ctx, actor, { deities: ['shiva', 'nope'], defaultDeity: 'shiva' }));
    assert.equal(id.me(w.ctx, actor).deities.length, 3);
  });
});

describe('2. Payment callbacks are idempotent', () => {
  it('a repeated callback never duplicates a charge, booking, refund or payout', () => {
    const w = world(); const u = w.devotee();
    const { booking, paymentId } = bk.hold(w.ctx, u, { serviceId: w.ids.svcIds['rudrabhishek-online'], startsAt: WED_0930, priestId: w.ids.priestIds[0] });
    assert.equal(booking.status, 'held');
    const first = capture(w, paymentId!, 'prov_evt_1');
    const again = capture(w, paymentId!, 'prov_evt_1');
    assert.equal(first.booking, 'confirmed');
    assert.equal(again.duplicate, true);
    // A different event id for an already-captured payment is ignored too.
    assert.equal((capture(w, paymentId!, 'prov_evt_2') as any).ignored, 'already_settled');
    assert.equal(count(w, 'SELECT COUNT(*) c FROM payments WHERE booking_id = ?', booking.id), 1);
    assert.equal(count(w, `SELECT COUNT(*) c FROM priest_reservations WHERE booking_id = ? AND active = 1`, booking.id), 1);

    // Complete the service twice over: one payout only.
    w.clock.at('2026-10-01T04:00:00.000Z');
    const priest = w.priestActor(w.ids.priestIds[0]);
    bk.checkIn(w.ctx, priest, booking.id);
    bk.complete(w.ctx, priest, booking.id, { stepsCompleted: ['sankalp', 'abhishek', 'aarti'] });
    pay.accruePayout(w.ctx, booking.id);
    assert.equal(count(w, 'SELECT COUNT(*) c FROM payouts WHERE booking_id = ?', booking.id), 1);

    // Refunds with the same idempotency key happen once.
    const support = w.actor('support@dev.astrobhakti.local');
    const r1 = pay.refund(w.ctx, support, { paymentId: paymentId!, amount: 5000, reason: 'goodwill', policy: 'goodwill', note: 'Audio issue', idempotencyKey: 'k1' });
    const r2 = pay.refund(w.ctx, support, { paymentId: paymentId!, amount: 5000, reason: 'goodwill', policy: 'goodwill', note: 'Audio issue', idempotencyKey: 'k1' });
    assert.equal(r1.id, r2.id);
    assert.equal(count(w, 'SELECT COUNT(*) c FROM refunds'), 1);
  });

  it('a callback that arrives after the hold lapsed confirms if the slot is still free, otherwise refunds in full', () => {
    const w = world();
    const a = w.devotee(), b = w.devotee();
    const svc = w.ids.svcIds['rudrabhishek-online'], priest = w.ids.priestIds[0];
    const h1 = bk.hold(w.ctx, a, { serviceId: svc, startsAt: WED_0930, priestId: priest });
    w.clock.advance(bk.HOLD_MINUTES + 1);
    bk.expireHolds(w.ctx);
    const h2 = bk.hold(w.ctx, b, { serviceId: svc, startsAt: WED_0930, priestId: priest });   // takes the freed slot
    capture(w, h2.paymentId!);
    const late = capture(w, h1.paymentId!);
    assert.equal(late.booking, 'cancelled');
    assert.equal(late.payment, 'refunded');
    assert.equal(count(w, `SELECT COUNT(*) c FROM refunds WHERE policy = 'reservation_unavailable'`), 1);
  });

  it('rejects a callback amount that does not match the payment', () => {
    const w = world(); const u = w.devotee();
    const { paymentId } = bk.hold(w.ctx, u, { serviceId: w.ids.svcIds['rudrabhishek-online'], startsAt: WED_0930, priestId: w.ids.priestIds[0] });
    rejects(() => bk.paymentCallback(w.ctx, { providerEventId: 'x', paymentId: paymentId!, type: 'captured', amount: 1 }), 'amount_mismatch');
  });
});

describe('3. No double booking of a priest or overlapping travel period', () => {
  it('two simultaneous requests cannot reserve the same priest for overlapping periods', async () => {
    const w = world();
    const svc = w.ids.svcIds['satyanarayan-home'], priest = w.ids.priestIds[2];
    const mk = () => { const u = w.devotee(); return { u, addr: me.addAddress(w.ctx, u, { line1: 'B-704', city: 'Pune', postalCode: '411038' }) }; };
    const x = mk(), y = mk();
    const results = await Promise.allSettled([
      Promise.resolve().then(() => bk.hold(w.ctx, x.u, { serviceId: svc, startsAt: '2026-10-05T04:30:00.000Z', priestId: priest, addressId: x.addr })),
      Promise.resolve().then(() => bk.hold(w.ctx, y.u, { serviceId: svc, startsAt: '2026-10-05T06:00:00.000Z', priestId: priest, addressId: y.addr })),
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const failed = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    assert.equal((failed.reason as AppError).code, 'priest_unavailable');
  });

  it('enforces the travel buffer between home visits, and allows other priests', () => {
    const w = world();
    const svc = w.ids.svcIds['ganesh-home'];
    const u1 = w.devotee(), u2 = w.devotee();
    const a1 = me.addAddress(w.ctx, u1, { line1: 'A', city: 'Pune', postalCode: '411038' });
    const a2 = me.addAddress(w.ctx, u2, { line1: 'B', city: 'Pune', postalCode: '411045' });
    // Ganesh home is 120 min max: 04:30–06:30 UTC, plus a 30 min buffer until 07:00.
    bk.hold(w.ctx, u1, { serviceId: svc, startsAt: '2026-10-06T04:30:00.000Z', priestId: w.ids.priestIds[2], addressId: a1 });
    rejects(() => bk.hold(w.ctx, u2, { serviceId: svc, startsAt: '2026-10-06T06:45:00.000Z', priestId: w.ids.priestIds[2], addressId: a2 }), 'priest_unavailable');
    const ok = bk.hold(w.ctx, u2, { serviceId: svc, startsAt: '2026-10-06T07:30:00.000Z', priestId: w.ids.priestIds[2], addressId: a2 });
    assert.equal(ok.booking.status, 'held');
    // Automatic matching skips the busy priest instead of failing.
    const u3 = w.devotee(); const a3 = me.addAddress(w.ctx, u3, { line1: 'C', city: 'Pune', postalCode: '411001' });
    const auto = bk.hold(w.ctx, u3, { serviceId: svc, startsAt: '2026-10-06T04:30:00.000Z', addressId: a3, city: 'Pune' });
    assert.notEqual(auto.booking.priestId, w.ids.priestIds[2]);
  });

  it('priest time off blocks bookings', () => {
    const w = world();
    const p = w.priestActor(w.ids.priestIds[0]);
    pr.addTimeOff(w.ctx, p, { startsAt: '2026-10-03T00:00:00.000Z', endsAt: '2026-10-04T00:00:00.000Z' });
    rejects(() => bk.hold(w.ctx, w.devotee(), { serviceId: w.ids.svcIds['rudrabhishek-online'], startsAt: '2026-10-03T04:00:00.000Z', priestId: w.ids.priestIds[0] }), 'priest_unavailable');
  });
});

describe('4. Stream outages change the visible status; replays are labeled', () => {
  it('shows an interruption with an expected return and offers a dated replay', () => {
    const w = world();
    const ops = w.actor('ops@dev.astrobhakti.local');
    const ev = live.listEvents(w.ctx).find(e => e.type === 'temple_live')!;
    assert.equal(live.setStatus(w.ctx, ops, ev.id, 'live').label.text, 'LIVE · Temple');
    const out = live.setStatus(w.ctx, ops, ev.id, 'interrupted', { note: 'Encoder dropped', expectedReturnAt: '2026-09-28T13:35:00.000Z' });
    assert.equal(out.label.text, 'Feed interrupted');
    assert.equal(out.expectedReturnAt, '2026-09-28T13:35:00.000Z');
    assert.ok(out.labeledReplay);
    assert.match(out.labeledReplay!.label.text, /^Recorded · \d{4}-\d{2}-\d{2}$/);
    assert.equal(live.setStatus(w.ctx, ops, ev.id, 'live').label.text, 'LIVE · Temple');
    assert.equal(live.incidents(w.ctx, ops, ev.id).length, 3);
  });

  it('never gives a recording a live state and requires permission for temple feeds', () => {
    const w = world();
    const ops = w.actor('ops@dev.astrobhakti.local');
    const rec = w.ctx.db.prepare(`SELECT id FROM live_events WHERE type = 'recorded'`).get() as any;
    rejects(() => live.setStatus(w.ctx, ops, rec.id, 'live'), 'recorded_has_no_live_state');
    const t = live.upsertTemple(w.ctx, ops, { name: 'Unsigned Temple', city: 'Pune', tz: 'Asia/Kolkata' });
    rejects(() => live.createEvent(w.ctx, ops, { type: 'temple_live', title: 'Aarti', templeId: t, startsAt: WED_0930, endsAt: '2026-10-01T05:00:00.000Z', ownerId: ops.id, backupId: ops.id }), 'no_permission');
    rejects(() => live.upsertTemple(w.ctx, ops, { id: t, name: 'Unsigned Temple', city: 'Pune', tz: 'Asia/Kolkata', published: true }), 'not_ready');
  });
});

describe('5. Private ceremonies reject unauthorized accounts and expired invitations', () => {
  it('lets the owner, the host priest and one invited guest in, and nobody else', () => {
    const w = world(); const owner = w.devotee(); const guest = w.devotee(); const stranger = w.devotee();
    const { booking, paymentId } = bk.hold(w.ctx, owner, { serviceId: w.ids.svcIds['rudrabhishek-online'], startsAt: WED_0930, priestId: w.ids.priestIds[0] });
    capture(w, paymentId!);
    const { token } = me.inviteToRoom(w.ctx, owner, booking.id);
    w.clock.at('2026-10-01T03:50:00.000Z');   // room opens 15 min early
    assert.equal(me.joinRoom(w.ctx, owner, booking.id).role, 'owner');
    assert.equal(me.joinRoom(w.ctx, w.priestActor(w.ids.priestIds[0]), booking.id).role, 'host');
    rejects(() => me.joinRoom(w.ctx, stranger, booking.id), 'forbidden');
    assert.equal(me.joinRoom(w.ctx, guest, booking.id, token).role, 'guest');
    rejects(() => me.joinRoom(w.ctx, stranger, booking.id, token), 'forbidden');   // single-claim
    w.clock.at('2026-10-01T06:00:00.000Z');   // after close: invitation expired
    rejects(() => me.joinRoom(w.ctx, guest, booking.id, token), 'forbidden');
  });

  it('keeps recording off unless everyone consents', () => {
    const w = world(); const owner = w.devotee();
    const { booking, paymentId } = bk.hold(w.ctx, owner, { serviceId: w.ids.svcIds['rudrabhishek-online'], startsAt: WED_0930, priestId: w.ids.priestIds[0] });
    capture(w, paymentId!);
    rejects(() => me.setRecording(w.ctx, owner, booking.id, true, false), 'consent_required');
    assert.equal(me.setRecording(w.ctx, owner, booking.id, true, true).recording, true);
  });
});

describe('6. Unapproved or suspended priests cannot accept new services', () => {
  it('blocks new bookings and surfaces existing ones to operations', () => {
    const w = world(); const u = w.devotee();
    const ops = w.actor('ops@dev.astrobhakti.local');
    const p = w.ids.priestIds[0];
    const { booking, paymentId } = bk.hold(w.ctx, u, { serviceId: w.ids.svcIds['rudrabhishek-online'], startsAt: WED_0930, priestId: p });
    capture(w, paymentId!);
    const res = pr.setStatus(w.ctx, ops, p, 'suspended', 'Serious complaint under investigation');
    assert.deepEqual(res.bookingsNeedingReassignment.map((b: any) => b.id), [booking.id]);
    assert.ok(count(w, `SELECT COUNT(*) c FROM notifications WHERE kind = 'ops.reassign'`) >= 1);
    rejects(() => bk.hold(w.ctx, w.devotee(), { serviceId: w.ids.svcIds['rudrabhishek-online'], startsAt: '2026-10-02T04:00:00.000Z', priestId: p }), 'priest_not_active');
    assert.ok(bk.opsBoard(w.ctx, ops, '2026-10-01').attention.some((b: any) => b.id === booking.id));
  });

  it('requires every verification check before approval, and an applicant cannot take bookings', () => {
    const w = world();
    const ver = w.actor('verification@dev.astrobhakti.local');
    const applicant = w.devotee('New Priest');
    const pid = pr.apply(w.ctx, applicant, { displayName: 'Pt. New', languages: ['hi'], rituals: ['ganesh-home'], city: 'Pune' });
    rejects(() => bk.hold(w.ctx, w.devotee(), { serviceId: w.ids.svcIds['guided-ganesh'], startsAt: WED_0930, priestId: pid }), 'priest_not_active');
    pr.setStatus(w.ctx, ver, pid, 'under_review');
    pr.recordCheck(w.ctx, ver, pid, 'identity');
    rejects(() => pr.setStatus(w.ctx, ver, pid, 'approved'), 'checks_incomplete');
    for (const k of ['references', 'interview', 'sample_ritual']) pr.recordCheck(w.ctx, ver, pid, k);
    pr.setStatus(w.ctx, ver, pid, 'approved');
    rejects(() => pr.setStatus(w.ctx, ver, pid, 'active'), 'payout_unverified');
  });
});

describe('7. Support can reschedule, substitute with consent, refund and reconcile', () => {
  it('handles a no-show with a consented replacement, a reschedule and a refund, and the books balance', () => {
    const w = world(); const u = w.devotee();
    const support = w.actor('support@dev.astrobhakti.local');
    const finance = w.actor('finance@dev.astrobhakti.local');
    const { booking, paymentId } = bk.hold(w.ctx, u, { serviceId: w.ids.svcIds['rudrabhishek-online'], startsAt: WED_0930, priestId: w.ids.priestIds[0] });
    capture(w, paymentId!);

    // Reschedule keeps the same priest and moves the reservation.
    const moved = bk.reschedule(w.ctx, support, booking.id, '2026-10-02T04:00:00.000Z');
    assert.equal(moved.startsAt, '2026-10-02T04:00:00.000Z');
    assert.equal(count(w, 'SELECT COUNT(*) c FROM priest_reservations WHERE booking_id = ? AND active = 1', booking.id), 1);

    // No-show: the replacement only applies after the customer accepts.
    w.clock.at('2026-10-02T04:10:00.000Z');
    bk.markNoShow(w.ctx, support, booking.id);
    const offer = bk.offerReplacement(w.ctx, support, booking.id, { toPriestId: w.ids.priestIds[1], newStartsAt: '2026-10-02T06:00:00.000Z' });
    assert.equal(bk.bookingView(w.ctx, u, booking.id).priestId, w.ids.priestIds[0]);
    const after = bk.respondToOffer(w.ctx, u, offer, true);
    assert.equal(after.priestId, w.ids.priestIds[1]);
    assert.equal(after.status, 'confirmed');

    // Goodwill partial refund, then complete; reconciliation keeps each ledger separate.
    pay.refund(w.ctx, support, { paymentId: paymentId!, amount: 20000, reason: 'late start', policy: 'goodwill', note: 'Replacement started late', idempotencyKey: 'gw1' });
    w.clock.at('2026-10-02T06:00:00.000Z');
    const p2 = w.priestActor(w.ids.priestIds[1]);
    bk.checkIn(w.ctx, p2, booking.id);
    const done = bk.complete(w.ctx, p2, booking.id, { stepsCompleted: ['all'] }) as any;
    assert.equal(done.payout.commission, 25500);   // 15% of ₹1,700
    assert.equal(done.payout.net, 144500);
    const fin = rep.financeSummary(w.ctx, finance, '2026-10') as any;
    const sept = rep.financeSummary(w.ctx, finance, '2026-09') as any;
    assert.equal(sept.grossBookingValue, 217200);   // ₹1,700 + ₹200 + ₹200 + ₹72 GST, paid in September
    assert.equal(fin.refunds, 20000);
    assert.equal(fin.priestLiabilities, 144500);
    assert.equal(fin.platformRevenue, 25500 + 20000);   // commission + platform charge
  });

  it('cancellation refunds follow the published policy', () => {
    const w = world(); const u = w.devotee();
    const { booking, paymentId } = bk.hold(w.ctx, u, { serviceId: w.ids.svcIds['rudrabhishek-online'], startsAt: WED_0930, priestId: w.ids.priestIds[0] });
    capture(w, paymentId!);
    w.clock.at('2026-09-30T10:00:00.000Z');   // under 24 h before
    assert.equal(bk.cancel(w.ctx, u, booking.id).refunded, 108600);
  });
});

describe('8. Private notes and household addresses stay private', () => {
  it('hides notes from other users and staff, and full addresses from everyone but owner and assigned priest', () => {
    const w = world(); const u = w.devotee(); const other = w.devotee();
    const noteId = me.addNote(w.ctx, u, 'Questions for the priest');
    rejects(() => me.getNote(w.ctx, other, noteId), 'not_found');
    for (const staff of ['support', 'finance', 'editor', 'ops']) rejects(() => me.getNote(w.ctx, w.actor(`${staff}@dev.astrobhakti.local`), noteId), 'not_found');

    const addr = me.addAddress(w.ctx, u, { line1: 'B-704, Sample Residency', city: 'Pune', postalCode: '411038', accessNotes: 'Gate pass' });
    const { booking, paymentId } = bk.hold(w.ctx, u, { serviceId: w.ids.svcIds['satyanarayan-home'], startsAt: '2026-10-05T04:30:00.000Z', priestId: w.ids.priestIds[2], addressId: addr });
    const priest = w.priestActor(w.ids.priestIds[2]);
    assert.equal(bk.bookingView(w.ctx, priest, booking.id).address.line1, undefined);   // not before confirmation
    capture(w, paymentId!);
    assert.equal(bk.bookingView(w.ctx, priest, booking.id).address.line1, 'B-704, Sample Residency');
    assert.equal(bk.bookingView(w.ctx, w.actor('support@dev.astrobhakti.local'), booking.id).address.line1, undefined);
    assert.equal(bk.bookingView(w.ctx, w.actor('finance@dev.astrobhakti.local'), booking.id).address, undefined);
    rejects(() => bk.bookingView(w.ctx, other, booking.id), 'not_found');
    rejects(() => bk.bookingView(w.ctx, w.priestActor(w.ids.priestIds[1]), booking.id), 'not_found');
    // Devotional preferences can never be opted into advertising.
    rejects(() => id.setConsent(w.ctx, u, 'advertising_preferences', true), 'not_allowed');
  });
});
