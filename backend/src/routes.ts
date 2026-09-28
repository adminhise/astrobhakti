import { type Actor, AppError, forbidden, invalid, one, requireRole } from './core.ts';
import { Router, verifySignature, type Req } from './http.ts';
import * as id from './modules/identity.ts';
import * as cat from './modules/catalogue.ts';
import * as live from './modules/live.ts';
import * as pr from './modules/priests.ts';
import * as bk from './modules/bookings.ts';
import * as pay from './modules/payments.ts';
import * as me from './modules/personal.ts';
import * as rep from './modules/reporting.ts';

/** Development only: a realistic day of bookings so the consoles have something to show. */
function demoScenario(ctx: Req['ctx']) {
  if (one(ctx, `SELECT 1 FROM audit_log WHERE action = 'dev.scenario'`)) return { alreadyLoaded: true };
  const svc = (code: string) => one(ctx, 'SELECT id FROM services WHERE code = ?', code).id;
  const priest = (name: string) => one(ctx, 'SELECT id FROM priests WHERE display_name = ?', name).id;
  const at = (h: number) => new Date(ctx.now().getTime() + h * 3600_000).toISOString().replace(/:\d\d\.\d{3}Z$/, ':00.000Z');
  const pay = (paymentId: string) => {
    const p = one(ctx, 'SELECT amount FROM payments WHERE id = ?', paymentId);
    return bk.paymentCallback(ctx, { providerEventId: `demo_${paymentId}`, paymentId, type: 'captured', amount: p.amount });
  };
  const devotee = (name: string, phone: string) => ({ id: id.createUser(ctx, { name, phone }), role: 'devotee' as const });
  const rakhi = devotee('Rakhi Sharma', '+919800000001');
  const meera = devotee('Meera Kulkarni', '+919800000002');
  const neha = devotee('Neha Patil', '+919800000003');
  id.setDeities(ctx, rakhi, { deities: ['shiva', 'ganesha', 'krishna'], defaultDeity: 'shiva' });
  const a1 = me.addAddress(ctx, rakhi, { line1: 'B-704, Sample Residency', city: 'Pune', postalCode: '411038', accessNotes: 'Gate pass at security' });
  const a2 = me.addAddress(ctx, meera, { line1: '12 Sample Lane, Kothrud', city: 'Pune', postalCode: '411038' });
  const a3 = me.addAddress(ctx, neha, { line1: 'Flat 3, Sample Towers, Aundh', city: 'Pune', postalCode: '411007' });
  const priestA = { id: one(ctx, 'SELECT user_id FROM priests WHERE id = ?', priest('Pt. Sample Priest A')).user_id, role: 'priest' as const };

  // Completed earlier today, so there is a payout and finance data.
  const done = bk.hold(ctx, rakhi, { serviceId: svc('rudrabhishek-online'), startsAt: at(0.5), priestId: priest('Pt. Sample Priest A'), participants: [{ name: 'Rakhi Sharma' }] });
  pay(done.paymentId!); bk.checkIn(ctx, priestA, done.booking.id); bk.complete(ctx, priestA, done.booking.id, { stepsCompleted: ['sankalp', 'abhishek', 'aarti'] });
  // Upcoming confirmed bookings.
  const online = bk.hold(ctx, rakhi, { serviceId: svc('rudrabhishek-online'), startsAt: at(3), priestId: priest('Pt. Sample Priest A'), participants: [{ name: 'Rakhi Sharma' }, { name: 'Arun Sharma' }] });
  pay(online.paymentId!);
  const home = bk.hold(ctx, rakhi, { serviceId: svc('satyanarayan-home'), startsAt: at(26), priestId: priest('Pt. Sample Priest C'), addressId: a1, notes: 'First pooja in the new flat; please explain steps in simple Hindi.' });
  pay(home.paymentId!);
  const lakshmi = bk.hold(ctx, meera, { serviceId: svc('lakshmi-home'), startsAt: at(28), priestId: priest('Pt. Sample Priest A'), addressId: a2, participants: [{ name: 'Meera Kulkarni', pronunciationNote: 'voice note' }], priestAssistGotra: true });
  pay(lakshmi.paymentId!);
  const ganesh = bk.hold(ctx, neha, { serviceId: svc('ganesh-home'), startsAt: at(8), priestId: priest('Pt. Sample Priest D'), addressId: a3 });
  pay(ganesh.paymentId!);
  bk.hold(ctx, neha, { serviceId: svc('navaratri-group'), startsAt: at(50) });   // held, awaiting payment
  // A priest is paused (expired document): their booking surfaces for reassignment.
  const ops = { id: one(ctx, `SELECT id FROM users WHERE email = 'ops@dev.astrobhakti.local'`).id, role: 'ops' as const };
  pr.setStatus(ctx, ops, priest('Pt. Sample Priest D'), 'paused', 'Identity document expired');
  me.addNote(ctx, rakhi, 'Ask the priest about the order of offerings.');
  x_audit(ctx);
  return { loaded: true };
}
const x_audit = (ctx: Req['ctx']) => ctx.db.prepare(`INSERT INTO audit_log (at, action, entity) VALUES (?, 'dev.scenario', 'dev')`).run(ctx.now().toISOString());

const need = (r: Req): Actor => r.actor ?? (() => { throw new AppError(401, 'unauthenticated'); })();
const q = (r: Req, k: string) => r.query.get(k) ?? undefined;

export function buildRouter(opts: { dev: boolean; webhookSecret: string }) {
  const r = new Router();

  // Health and auth
  r.get('/health', () => ({ ok: true }), { public: true });
  r.post('/auth/otp', x => id.requestOtp(x.ctx, x.body.phone, { dev: opts.dev }), { public: true });
  r.post('/auth/verify', x => id.verifyOtp(x.ctx, x.body.phone, x.body.code, x.body.name), { public: true });
  if (opts.dev) {
    // Development sign-in for staff consoles and demos. Never enabled in production.
    r.post('/auth/dev-login', x => {
      const role = x.body.role ?? 'devotee';
      const existing = one(x.ctx, 'SELECT id FROM users WHERE email = ?', `${role}@dev.astrobhakti.local`);
      const uid = existing?.id ?? id.createUser(x.ctx, { name: x.body.name ?? role, email: `${role}@dev.astrobhakti.local`, role });
      return { token: id.createSession(x.ctx, uid), userId: uid };
    }, { public: true });
    // Signs in as a seeded priest (by display name) so the priest workspace shows real bookings.
    r.post('/auth/dev-priest', x => {
      const p = one(x.ctx, 'SELECT user_id FROM priests WHERE display_name = ?', x.body.name ?? 'Pt. Sample Priest A');
      if (!p) throw invalid('unknown_priest');
      return { token: id.createSession(x.ctx, p.user_id), userId: p.user_id };
    }, { public: true });
    r.post('/dev/scenario', x => demoScenario(x.ctx), { public: true });
    // Simulates the payment provider's capture webhook for the signed-in payer (no real money moves).
    r.post('/dev/pay/:id', x => {
      const p = one(x.ctx, 'SELECT * FROM payments WHERE id = ?', x.params.id);
      if (!p || p.user_id !== need(x).id) throw invalid('unknown_payment');
      return bk.paymentCallback(x.ctx, { providerEventId: `dev_${p.id}`, paymentId: p.id, type: 'captured', amount: p.amount });
    });
  }

  // Me and preferences
  r.get('/me', x => id.me(x.ctx, need(x)));
  r.put('/me', x => id.updateProfile(x.ctx, need(x), x.body));
  r.put('/me/deities', x => id.setDeities(x.ctx, need(x), x.body));
  r.post('/me/deities/replace', x => id.replaceDeity(x.ctx, need(x), x.body));
  r.put('/me/consents/:kind', x => id.setConsent(x.ctx, need(x), x.params.kind, !!x.body.granted));
  r.del('/me', x => id.deleteAccount(x.ctx, need(x)));
  r.post('/me/membership/cancel', x => id.cancelMembership(x.ctx, need(x)));
  r.get('/me/notes', x => me.listNotes(x.ctx, need(x)));
  r.post('/me/notes', x => ({ id: me.addNote(x.ctx, need(x), x.body.body) }));
  r.get('/me/notes/:id', x => me.getNote(x.ctx, need(x), x.params.id));
  r.del('/me/notes/:id', x => me.deleteNote(x.ctx, need(x), x.params.id));
  r.get('/me/addresses', x => me.listAddresses(x.ctx, need(x)));
  r.post('/me/addresses', x => ({ id: me.addAddress(x.ctx, need(x), x.body) }));
  r.get('/me/reminders', x => me.listReminders(x.ctx, need(x)));
  r.post('/me/reminders', x => ({ id: me.setReminder(x.ctx, need(x), x.body) }));
  r.del('/me/reminders/:id', x => me.deleteReminder(x.ctx, need(x), x.params.id));
  r.post('/me/mantra', x => me.countMantra(x.ctx, need(x), x.body.mantra, x.body.by ?? 1));
  r.get('/me/practice', x => me.practiceHistory(x.ctx, need(x), q(x, 'month') ?? x.ctx.now().toISOString().slice(0, 7)));
  r.post('/me/playlists', x => ({ id: me.savePlaylist(x.ctx, need(x), x.body) }));
  r.put('/me/saved/:item', x => cat.saveItem(x.ctx, need(x), x.params.item, !!x.body.saved));
  r.get('/me/bookings', x => bk.myBookings(x.ctx, need(x)));
  r.get('/me/notifications', x => me.notificationsFor(x.ctx, need(x)));
  r.post('/support/cases', x => ({ id: me.openCase(x.ctx, need(x), x.body) }));
  r.post('/quotations', x => ({ id: me.requestQuotation(x.ctx, need(x), x.body) }));

  // Catalogue (browsable without an account)
  r.get('/deities', x => cat.listDeities(x.ctx), { public: true });
  r.get('/deities/:id', x => cat.getDeity(x.ctx, x.params.id), { public: true });
  r.post('/deity-requests', x => cat.requestDeity(x.ctx, x.actor, x.body), { public: true });
  r.get('/content', x => cat.listContent(x.ctx, x.actor?.id, {
    deity: q(x, 'deity'), format: q(x, 'format'), language: q(x, 'language'), tradition: q(x, 'tradition'),
    difficulty: q(x, 'difficulty'), q: q(x, 'q'), maxMinutes: q(x, 'maxMinutes') ? Number(q(x, 'maxMinutes')) : undefined,
  }), { public: true });
  r.get('/content/:id', x => cat.getContent(x.ctx, x.actor?.id, x.params.id), { public: true });
  r.post('/content/:id/plays', x => cat.recordPlay(x.ctx, need(x), x.params.id, !!x.body.completed));
  r.get('/observances', x => cat.observances(x.ctx, { tradition: q(x, 'tradition') ?? 'North Indian', from: q(x, 'from') ?? '0000', to: q(x, 'to') ?? '9999' }), { public: true });

  // Live darshan
  r.get('/events', x => live.listEvents(x.ctx, { deity: q(x, 'deity'), temple: q(x, 'temple'), liveNow: q(x, 'live') === '1' }), { public: true });
  r.get('/events/:id', x => live.getEvent(x.ctx, x.params.id), { public: true });
  r.put('/temples/:id/follow', x => live.follow(x.ctx, need(x), x.params.id, !!x.body.on));

  // Services and bookings
  r.get('/services', x => bk.listServices(x.ctx, { format: q(x, 'format'), deity: q(x, 'deity') }), { public: true });
  r.post('/services/:id/quote', x => bk.quote(x.ctx, x.params.id, x.body), { public: true });
  r.get('/services/:id/priests', x => {
    const s = one(x.ctx, 'SELECT * FROM services WHERE id = ?', x.params.id);
    if (!s) throw invalid('unknown_service');
    const startsAt = q(x, 'startsAt');
    if (!startsAt) throw invalid('startsAt_required');
    return pr.eligiblePriests(x.ctx, { serviceCode: s.code, format: s.format, city: q(x, 'city'), language: q(x, 'language'), startsAt, endsAt: new Date(new Date(startsAt).getTime() + s.duration_max * 60000).toISOString() });
  }, { public: true });
  r.post('/bookings', x => bk.hold(x.ctx, need(x), x.body));
  r.get('/bookings/:id', x => bk.bookingView(x.ctx, need(x), x.params.id));
  r.post('/bookings/:id/consent', x => bk.consent(x.ctx, need(x), x.params.id, !!x.body.grant));
  r.post('/bookings/:id/cancel', x => bk.cancel(x.ctx, need(x), x.params.id));
  r.post('/bookings/:id/reschedule', x => bk.reschedule(x.ctx, need(x), x.params.id, x.body.startsAt));
  r.post('/bookings/:id/invites', x => me.inviteToRoom(x.ctx, need(x), x.params.id));
  r.post('/bookings/:id/join', x => me.joinRoom(x.ctx, need(x), x.params.id, x.body.invite));
  r.put('/bookings/:id/recording', x => me.setRecording(x.ctx, need(x), x.params.id, !!x.body.on, !!x.body.consentFromAll));
  r.post('/bookings/:id/disputes', x => ({ id: pay.openDispute(x.ctx, need(x), x.params.id, x.body.reason) }));
  r.post('/replacement-offers/:id/respond', x => bk.respondToOffer(x.ctx, need(x), x.params.id, !!x.body.accept));
  r.post('/extra-charges/:id/decide', x => bk.decideExtra(x.ctx, need(x), x.params.id, !!x.body.approve));

  // Payment provider webhook: signature-verified and idempotent.
  r.post('/payments/callback', x => {
    if (!verifySignature(x.raw, x.headers['x-signature'] as string | undefined, opts.webhookSecret)) throw forbidden('bad signature');
    return bk.paymentCallback(x.ctx, x.body);
  }, { public: true });

  // Priest workspace
  r.post('/priest/apply', x => ({ id: pr.apply(x.ctx, need(x), x.body) }));
  r.get('/priest/me', x => pr.getPriest(x.ctx, pr.priestForUser(x.ctx, need(x).id).id));
  r.put('/priest/me', x => pr.updateProfile(x.ctx, need(x), x.body));
  r.get('/priest/schedule', x => pr.schedule(x.ctx, need(x), q(x, 'from') ?? '0000', q(x, 'to') ?? '9999'));
  r.post('/priest/time-off', x => ({ id: pr.addTimeOff(x.ctx, need(x), x.body) }));
  r.post('/priest/bookings/:id/check-in', x => bk.checkIn(x.ctx, need(x), x.params.id, x.body.code));
  r.post('/priest/bookings/:id/complete', x => bk.complete(x.ctx, need(x), x.params.id, x.body));
  r.post('/priest/bookings/:id/extra', x => ({ id: bk.requestExtra(x.ctx, need(x), x.params.id, x.body) }));
  r.get('/priest/bookings', x => {
    const p = pr.priestForUser(x.ctx, need(x).id);
    return x.ctx.db.prepare(`SELECT id FROM bookings WHERE priest_id = ? AND status IN ('confirmed','in_progress','completed','no_show') ORDER BY starts_at`).all(p.id)
      .map((b: any) => bk.bookingView(x.ctx, need(x), b.id));
  });
  r.get('/priest/earnings', x => pay.priestEarnings(x.ctx, pr.priestForUser(x.ctx, need(x).id).id));

  // Operations, verification, editorial and finance
  r.get('/ops/board', x => bk.opsBoard(x.ctx, need(x), q(x, 'day') ?? x.ctx.now().toISOString().slice(0, 10)));
  r.post('/ops/bookings/:id/no-show', x => bk.markNoShow(x.ctx, need(x), x.params.id));
  r.post('/ops/bookings/:id/replacement', x => ({ id: bk.offerReplacement(x.ctx, need(x), x.params.id, x.body) }));
  r.post('/ops/bookings/:id/reschedule', x => bk.reschedule(x.ctx, need(x), x.params.id, x.body.startsAt));
  r.post('/ops/refunds', x => pay.refund(x.ctx, need(x), x.body));
  r.get('/ops/refunds', x => pay.refundQueue(x.ctx, need(x)));
  r.post('/ops/disputes/:id/decide', x => pay.decideDispute(x.ctx, need(x), x.params.id, x.body));
  r.get('/ops/coverage', x => pr.coverage(x.ctx, need(x)));
  r.get('/ops/priests', x => { requireRole(need(x), 'ops', 'verification'); return x.ctx.db.prepare('SELECT id FROM priests ORDER BY created_at').all().map((p: any) => pr.getPriest(x.ctx, p.id)); });
  r.post('/ops/priests/:id/checks', x => pr.recordCheck(x.ctx, need(x), x.params.id, x.body.kind));
  r.post('/ops/priests/:id/status', x => pr.setStatus(x.ctx, need(x), x.params.id, x.body.status, x.body.reason));
  r.post('/ops/priests/:id/approve-change', x => pr.approveProfileChange(x.ctx, need(x), x.params.id, x.body));
  r.post('/ops/temples', x => ({ id: live.upsertTemple(x.ctx, need(x), x.body) }));
  r.post('/ops/events', x => ({ id: live.createEvent(x.ctx, need(x), x.body) }));
  r.post('/ops/events/:id/status', x => live.setStatus(x.ctx, need(x), x.params.id, x.body.status, x.body));
  r.get('/ops/events/:id/incidents', x => live.incidents(x.ctx, need(x), x.params.id));
  r.get('/ops/audit', x => rep.auditLog(x.ctx, need(x)));
  r.get('/ops/measures', x => rep.pilotMeasures(x.ctx, need(x)));
  r.post('/cms/items', x => ({ id: cat.createItem(x.ctx, need(x), x.body) }));
  r.post('/cms/items/:id/advance', x => cat.advance(x.ctx, need(x), x.params.id, x.body.to, x.body.note));
  r.post('/cms/items/:id/unpublish', x => cat.unpublish(x.ctx, need(x), x.params.id, x.body.reason));
  r.post('/cms/items/:id/versions', x => cat.addVersion(x.ctx, need(x), x.params.id, x.body.note, x.body.body));
  r.put('/cms/items/:id/rights/:element', x => cat.setRights(x.ctx, need(x), x.params.id, x.params.element, x.body.status, x.body.reference));
  r.get('/cms/pipeline', x => cat.pipeline(x.ctx, need(x)));
  r.get('/cms/items', x => {
    requireRole(need(x), 'editor', 'ops');
    return x.ctx.db.prepare(`SELECT i.id, i.title, i.deity_id deityId, i.format, i.kind, i.tier, i.editorial_status status, i.current_version version,
      (SELECT json_group_array(json_object('element', element, 'status', status)) FROM rights_records r WHERE r.item_id = i.id) rights
      FROM content_items i ORDER BY i.created_at DESC`).all().map((i: any) => ({ ...i, rights: JSON.parse(i.rights) }));
  });
  r.get('/finance/payouts', x => {
    requireRole(need(x), 'finance', 'ops');
    return x.ctx.db.prepare(`SELECT p.*, pr.display_name priest, b.code, s.name service FROM payouts p JOIN priests pr ON pr.id = p.priest_id
      JOIN bookings b ON b.id = p.booking_id JOIN services s ON s.id = b.service_id ORDER BY p.settle_on`).all();
  });
  r.get('/finance/summary', x => rep.financeSummary(x.ctx, need(x), q(x, 'month') ?? x.ctx.now().toISOString().slice(0, 7)));
  r.post('/finance/payouts/paid', x => pay.markPayoutsPaid(x.ctx, need(x), x.body.ids ?? []));

  return r;
}
