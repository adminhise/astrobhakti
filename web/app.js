// AstroBhakti priest workspace and operations console. Plain ES modules, no build step.
const $app = document.getElementById('app');
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } },
};
let session = { token: store.get('ab.token'), role: store.get('ab.role'), name: store.get('ab.name') };

// Helpers ------------------------------------------------------------------

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

async function api(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method, headers: { 'content-type': 'application/json', ...(session.token ? { authorization: `Bearer ${session.token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && session.token) { signOut(); throw new Error('Signed out'); }
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return data;
}

const inr = paise => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const when = iso => iso ? new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';
const today = () => new Date().toISOString().slice(0, 10);

function toast(msg, err = false) {
  const t = h('div', { class: `toast ${err ? 'err' : ''}` }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}

async function act(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); render(); } catch (e) { toast(e.message, true); }
}

const TONE = {
  confirmed: 'ok', completed: 'ok', captured: 'ok', active: 'ok', paid: 'ok', cleared: 'ok', published: 'ok', live: 'live',
  held: 'warn', pending: 'warn', in_progress: 'info', scheduled: 'info', accrued: 'info', under_review: 'info', applied: 'muted',
  interrupted: 'warn', paused: 'warn', no_show: 'live', suspended: 'live', disputed: 'live', cancelled: 'muted', expired: 'muted',
  refunded: 'replay', partially_refunded: 'replay', recorded: 'replay', ended: 'muted', rejected: 'live', issued: 'replay',
};
const badge = (status, label) => h('span', { class: `badge b-${TONE[status] ?? 'muted'}` }, label ?? String(status).replaceAll('_', ' '));
const stat = (l, v, sub, tone) => h('div', { class: 'card stat' }, h('div', { class: 'l' }, l), h('div', { class: 'v', style: tone ? `color:var(--${tone})` : '' }, v), sub && h('div', { class: 'muted' }, sub));
const card = (title, action, ...body) => h('div', { class: 'card' }, title && h('div', { class: 'card-h' }, h('h2', {}, title), action), ...body);
function table(heads, rows) {
  return h('table', {}, h('thead', {}, h('tr', {}, heads.map(x => h('th', {}, x)))), h('tbody', {}, rows.length ? rows.map(r => h('tr', {}, r.map(c => h('td', {}, c)))) : h('tr', {}, h('td', { colspan: heads.length, class: 'muted' }, 'Nothing here yet'))));
}
const btn = (label, onclick, kind = '') => h('button', { class: `btn ${kind}`, onclick }, label);
const ask = (q, d = '') => { const v = prompt(q, d); if (v === null) throw new Error('Cancelled'); return v; };

// Navigation ---------------------------------------------------------------

const PRIEST_NAV = [['dashboard', 'Dashboard'], ['bookings', 'Bookings & visits'], ['availability', 'Availability'], ['earnings', 'Earnings & payouts'], ['profile', 'Profile & verification']];
const OPS_NAV = [['overview', 'Overview'], ['bookings', 'Bookings'], ['priests', 'Priests & supply'], ['live', 'Live events'], ['refunds', 'Refunds & disputes'], ['finance', 'Finance'], ['content', 'Content CMS'], ['measures', 'Pilot measures'], ['audit', 'Access & audit']];
const ROLE_VIEWS = {
  ops: OPS_NAV.map(n => n[0]), admin: OPS_NAV.map(n => n[0]), support: ['overview', 'bookings', 'refunds'],
  finance: ['finance', 'refunds'], editor: ['content'], verification: ['priests'],
};
const route = () => location.hash.slice(2) || '';

function signOut() {
  session = { token: null, role: null, name: null };
  ['ab.token', 'ab.role', 'ab.name'].forEach(k => store.set(k, null));
  location.hash = '';
  render();
}

async function signIn(role) {
  const r = role === 'priest'
    ? await api('POST', '/auth/dev-priest', { name: 'Pt. Sample Priest A' })
    : await api('POST', '/auth/dev-login', { role });
  session = { token: r.token, role, name: role === 'priest' ? 'Pt. Sample Priest A' : role };
  store.set('ab.token', r.token); store.set('ab.role', role); store.set('ab.name', session.name);
  location.hash = '';
  render();
}

function loginView() {
  const roles = [['priest', 'Priest workspace', 'Pt. Sample Priest A'], ['ops', 'Operations', 'Everything in the console'], ['support', 'Support', 'Bookings, refunds'], ['finance', 'Finance', 'Reconciliation, payouts'], ['editor', 'Editorial', 'Content workflow'], ['verification', 'Verification', 'Priest checks']];
  return h('div', { class: 'login' }, h('div', { class: 'card' },
    h('div', { class: 'brand', style: 'padding:0' }, h('div', { class: 'logo' }, '🪔'), h('div', {}, h('h1', {}, 'AstroBhakti'), h('span', { class: 'sacred sec' }, 'एस्ट्रोभक्ति'))),
    h('p', { class: 'sec' }, 'Development sign-in. Choose a role to open the priest workspace or the operations console.'),
    h('div', { class: 'roles' }, roles.map(([r, t, d]) => h('button', { onclick: () => act(() => signIn(r)) }, h('b', {}, t), h('span', { class: 'muted' }, d)))),
    h('div', { class: 'actions' }, btn('Load a demo day of bookings', () => act(() => api('POST', '/dev/scenario'), 'Demo data loaded'), 'soft')),
  ));
}

function shell(nav, title, sub, body) {
  const cur = route() || nav[0][0];
  return h('div', { class: 'shell' },
    h('aside', { class: 'sidebar' },
      h('div', { class: 'brand' }, h('div', { class: 'logo' }, '🪔'), h('div', {}, h('b', {}, 'AstroBhakti'), h('small', {}, session.role === 'priest' ? 'Priest workspace' : 'Operations · Pune pilot'))),
      nav.map(([k, l]) => h('a', { class: `nav ${k === cur ? 'on' : ''}`, href: `#/${k}` }, h('span', { class: 'dot' }), l)),
      h('div', { class: 'spacer' }), h('div', { class: 'who' }, `Signed in as ${session.name}`), h('a', { class: 'nav', href: '#', onclick: e => { e.preventDefault(); signOut(); } }, 'Sign out')),
    h('main', {}, h('div', { class: 'topbar' }, h('div', { style: 'flex:1' }, h('h1', {}, title), sub && h('div', { class: 'sub' }, sub))), h('div', { class: 'content' }, body)));
}

// Priest workspace -----------------------------------------------------------

const priestViews = {
  async dashboard() {
    const [me, bookings, earnings] = await Promise.all([api('GET', '/priest/me'), api('GET', '/priest/bookings'), api('GET', '/priest/earnings')]);
    const upcoming = bookings.filter(b => ['confirmed', 'in_progress'].includes(b.status));
    return [
      h('div', { class: `banner ${me.status === 'active' ? 'ok' : 'warn'}` }, badge(me.status), h('div', {},
        h('b', {}, me.status === 'active' ? 'Active · verified checks completed' : `Status: ${me.status}`),
        h('div', { class: 'sec' }, me.verification.map(v => `${v.kind.replace('_', ' ')} ${v.completedAt.slice(0, 10)}`).join(' · ')))),
      h('div', { class: 'row' }, stat('Upcoming services', String(upcoming.length)), stat('Paid out', inr(earnings.paid), null, 'ok'), stat('Pending payout', inr(earnings.pending)), stat('Disputed', inr(earnings.disputed))),
      card('Upcoming schedule', null, table(['When', 'Service', 'Where', 'Status'], upcoming.map(b => [when(b.startsAt), b.service.name, b.address ? [b.address.line1, b.address.city].filter(Boolean).join(', ') : 'Online room', badge(b.status)]))),
    ];
  },
  async bookings() {
    const bookings = await api('GET', '/priest/bookings');
    return bookings.map(b => card(`${b.service.name} · ${b.code}`, badge(b.status),
      h('div', { class: 'sec' }, `${when(b.startsAt)} · ${b.service.durationMin}–${b.service.durationMax} min`),
      b.address && h('div', {}, h('b', {}, 'Address: '), b.address.line1 ? `${b.address.line1}, ${b.address.city} ${b.address.postalCode}${b.address.accessNotes ? ` · ${b.address.accessNotes}` : ''}` : `${b.address.city} ${b.address.postalCode} (unlocks after confirmation)`),
      h('div', {}, h('b', {}, 'Participants: '), (b.participants?.people ?? []).map(p => p.name + (p.pronunciationNote ? ' 🔊' : '')).join(', ') || '—', b.participants?.priestAssistGotra ? ' · gotra: priest assistance requested' : ''),
      b.notes && h('div', { class: 'banner info' }, `“${b.notes}”`),
      h('div', {}, h('b', {}, 'Scope: '), b.service.scope.join(' · ')),
      h('div', { class: 'actions' },
        b.status === 'confirmed' && btn(b.service.format === 'home_visit' ? 'Check in with arrival code' : 'Start session', () => act(() => api('POST', `/priest/bookings/${b.id}/check-in`, { code: b.service.format === 'home_visit' ? ask('Arrival code from the household') : undefined }), 'Service started')),
        b.status === 'in_progress' && btn('Submit completion', () => act(() => api('POST', `/priest/bookings/${b.id}/complete`, { stepsCompleted: b.service.scope }), 'Completion submitted'), 'maroon'),
        ['confirmed', 'in_progress'].includes(b.status) && btn('Request extra charge', () => act(() => api('POST', `/priest/bookings/${b.id}/extra`, { label: ask('What was it for?', 'Flowers and fruits bought on request'), amount: Math.round(Number(ask('Amount in ₹', '350')) * 100) }), 'Sent to the household for approval'), 'secondary'),
      )));
  },
  async availability() {
    const from = new Date().toISOString(), to = new Date(Date.now() + 14 * 864e5).toISOString();
    const rows = await api('GET', `/priest/schedule?from=${from}&to=${to}`);
    const s = h('input', { type: 'datetime-local' }), e = h('input', { type: 'datetime-local' });
    return [
      card('Add time off', null, h('div', { class: 'form' }, h('label', {}, 'From', s), h('label', {}, 'To', e),
        btn('Add time off', () => act(() => api('POST', '/priest/time-off', { startsAt: new Date(s.value).toISOString(), endsAt: new Date(e.value).toISOString() }), 'Time off added')))),
      card('Next 14 days', h('span', { class: 'muted' }, 'Includes travel buffers · overlaps are blocked by the system'),
        table(['From', 'To', 'Kind', 'Booking'], rows.map(r => [when(r.starts_at), when(r.ends_at), badge(r.kind === 'time_off' ? 'cancelled' : 'scheduled', r.kind === 'time_off' ? 'time off' : 'booking + buffer'), r.service ? `${r.service} · ${r.code}` : '—']))),
    ];
  },
  async earnings() {
    const e = await api('GET', '/priest/earnings');
    return [
      h('div', { class: 'row' }, stat('Paid out', inr(e.paid), null, 'ok'), stat('Pending', inr(e.pending)), stat('Disputed', inr(e.disputed), null, 'live')),
      card('Line items', h('span', { class: 'muted' }, '15% commission on the priest fee · dakshina goes fully to you'),
        table(['Booking', 'Service', 'Gross', 'Commission', 'Reimbursed', 'Net', 'Settles', 'Status'], e.items.map(i => [i.code, i.service, inr(i.gross), inr(i.commission), inr(i.reimbursed), inr(i.net), i.settle_on, badge(i.status)]))),
    ];
  },
  async profile() {
    const me = await api('GET', '/priest/me');
    const lifecycle = ['applied', 'under_review', 'approved', 'active', 'paused', 'suspended'];
    return [
      card('Lifecycle', null, h('div', { class: 'actions' }, lifecycle.map(s => badge(s === me.status ? me.status : 'expired', s.replace('_', ' '))))),
      card(me.displayName, null, h('div', {}, h('b', {}, 'Rituals: '), me.rituals.join(', ')), h('div', {}, h('b', {}, 'Languages: '), me.languages.join(', ')),
        h('div', {}, h('b', {}, 'Area: '), `${me.city} · ${me.travelRadiusKm} km · ${me.bufferMin} min buffer`),
        h('p', { class: 'muted' }, 'Changes to rituals or languages need approval before they go live. Your exact address is never shown publicly.')),
      card('Verification record', null, table(['Check', 'Completed'], me.verification.map(v => [v.kind.replace('_', ' '), v.completedAt.slice(0, 10)])),
        h('p', { class: 'muted' }, 'A badge records completed checks and dates; it does not guarantee conduct.')),
    ];
  },
};

// Operations console ---------------------------------------------------------

const opsViews = {
  async overview() {
    const [board, coverage, events] = await Promise.all([api('GET', '/ops/board'), api('GET', '/ops/coverage').catch(() => []), api('GET', '/events')]);
    const tomorrow = await api('GET', `/ops/board?day=${new Date(Date.now() + 864e5).toISOString().slice(0, 10)}`);
    const all = [...board.bookings, ...tomorrow.bookings], attention = [...board.attention, ...tomorrow.attention];
    return [
      h('div', { class: 'row' }, stat('Services today & tomorrow', String(all.length)), stat('Need attention', String(attention.length), null, attention.length ? 'warn' : null),
        stat('Live now', String(events.filter(e => e.status === 'live').length)), stat('Interrupted', String(events.filter(e => e.status === 'interrupted').length), null, 'live')),
      h('div', { class: 'row' },
        card('Needs attention', null, table(['Booking', 'Service', 'When', 'Issue'], attention.map(b => [b.code, b.service, when(b.starts_at), badge(b.priest_status === 'paused' || b.priest_status === 'suspended' ? 'paused' : b.status, b.priest_status && ['paused', 'suspended'].includes(b.priest_status) ? `priest ${b.priest_status}` : b.status)]))),
        card('Coverage by service', h('span', { class: 'muted' }, 'Target: two eligible priests per service'), table(['Service', 'Eligible', ''], coverage.map(c => [c.name, String(c.eligible), badge(c.ok ? 'active' : 'pending', c.ok ? 'OK' : 'cap bookings')])))),
    ];
  },
  async bookings() {
    const days = [0, 1, 2, 3].map(d => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10));
    const boards = await Promise.all(days.map(d => api('GET', `/ops/board?day=${d}`)));
    const rows = boards.flatMap(b => b.bookings);
    return [card('Bookings · next 4 days', h('span', { class: 'muted' }, 'Booking and payment status are separate records'),
      table(['Booking', 'Service', 'When', 'Booking', 'Payment', 'Actions'], rows.map(b => [b.code, b.service, when(b.starts_at), badge(b.status), badge(b.payment_status ?? 'pending', b.payment_status ?? '—'),
        h('div', { class: 'actions' },
          b.status === 'confirmed' && btn('Reschedule', () => act(() => api('POST', `/ops/bookings/${b.id}/reschedule`, { startsAt: new Date(ask('New start (local time, YYYY-MM-DDTHH:MM)', b.starts_at.slice(0, 16))).toISOString() }), 'Rescheduled'), 'secondary'),
          b.status === 'confirmed' && btn('No-show', () => act(() => api('POST', `/ops/bookings/${b.id}/no-show`), 'Customer offered refund or replacement'), 'danger'),
          ['confirmed', 'no_show'].includes(b.status) && b.format !== 'group_live' && btn('Offer replacement', () => act(async () => {
            const priests = (await api('GET', '/ops/priests')).filter(p => p.status === 'active' && p.id !== b.priest_id);
            const choice = ask(`Replacement priest:\n${priests.map((p, i) => `${i + 1}. ${p.displayName}`).join('\n')}`, '1');
            await api('POST', `/ops/bookings/${b.id}/replacement`, { toPriestId: priests[Number(choice) - 1].id });
          }, 'Offer sent. Nothing changes unless the customer accepts.'), 'soft'),
        )])))];
  },
  async priests() {
    const priests = await api('GET', '/ops/priests');
    const next = { applied: 'under_review', under_review: 'approved', approved: 'active', paused: 'active' };
    return [card('Priests', h('span', { class: 'muted' }, 'Approval needs identity, references, interview and sample ritual review'),
      table(['Priest', 'Status', 'Checks', 'Rituals', 'Actions'], priests.map(p => [p.displayName, badge(p.status), p.verification.map(v => v.kind.replace('_', ' ')).join(', ') || '—', p.rituals.join(', '),
        h('div', { class: 'actions' },
          next[p.status] && btn(`Move to ${next[p.status].replace('_', ' ')}`, () => act(() => api('POST', `/ops/priests/${p.id}/status`, { status: next[p.status] }), 'Status updated'), 'soft'),
          ['active', 'approved'].includes(p.status) && btn('Pause', () => act(async () => { const r = await api('POST', `/ops/priests/${p.id}/status`, { status: 'paused', reason: ask('Reason') }); toast(`${r.bookingsNeedingReassignment.length} booking(s) need reassignment`); }), 'secondary'),
          ['active', 'paused'].includes(p.status) && btn('Suspend', () => act(() => api('POST', `/ops/priests/${p.id}/status`, { status: 'suspended', reason: ask('Reason') }), 'Suspended'), 'danger'),
          p.status !== 'active' && btn('Record check', () => act(() => api('POST', `/ops/priests/${p.id}/checks`, { kind: ask('identity · references · interview · sample_ritual · payout_details', 'identity') }), 'Check recorded'), 'secondary'),
        )])))];
  },
  async live() {
    const events = await api('GET', '/events');
    const actions = { scheduled: ['live', 'cancelled'], live: ['interrupted', 'ended'], interrupted: ['live', 'ended'] };
    return [
      h('div', { class: 'banner info' }, 'Never loop a recording under a Live label. Temple listings stay unpublished until permission and testing are complete. Public chat is off.'),
      card('Events', null, table(['Event', 'Type', 'Starts', 'Viewer label', 'Actions'], events.map(e => [e.title, e.type.replace('_', ' '), when(e.startsAt), badge(e.status === 'live' ? 'live' : e.type === 'recorded' ? 'recorded' : e.status, e.label.text),
        h('div', { class: 'actions' }, (e.type === 'recorded' ? [] : actions[e.status] ?? []).map(s => btn(s === 'interrupted' ? 'Mark interrupted' : s === 'live' ? 'Go live' : s === 'cancelled' ? 'Cancel' : s[0].toUpperCase() + s.slice(1), () => act(() => api('POST', `/ops/events/${e.id}/status`, {
          status: s, note: s === 'interrupted' ? ask('What happened?', 'Encoder upload dropped') : undefined,
          expectedReturnAt: s === 'interrupted' ? new Date(Date.now() + 15 * 60000).toISOString() : undefined,
        }), 'Status updated'), s === 'interrupted' || s === 'cancelled' ? 'danger' : s === 'live' ? '' : 'secondary')))]))),
    ];
  },
  async refunds() {
    const q = await api('GET', '/ops/refunds');
    const pid = h('input', { placeholder: 'Payment id' }), amt = h('input', { placeholder: 'Amount ₹', type: 'number' }), reason = h('input', { placeholder: 'Reason' });
    const policy = h('select', {}, ['priest_no_show', 'partial_completion', 'customer_cancelled', 'goodwill'].map(p => h('option', {}, p)));
    return [
      card('Issue a refund', h('span', { class: 'muted' }, 'Apply the disclosed policy and record a decision note'), h('div', { class: 'form' }, pid, amt, reason, policy,
        btn('Record decision & refund', () => act(() => api('POST', '/ops/refunds', { paymentId: pid.value.trim(), amount: Math.round(Number(amt.value) * 100), reason: reason.value, policy: policy.value, note: reason.value || policy.value, idempotencyKey: `console:${pid.value}:${amt.value}:${Date.now()}` }), 'Refund issued')))),
      card('Open disputes', null, table(['Booking', 'Reason', 'Opened', 'Decide'], q.disputes.map(d => [d.booking_id, d.reason, when(d.created_at), h('div', { class: 'actions' },
        btn('Release payout', () => act(() => api('POST', `/ops/disputes/${d.id}/decide`, { decision: ask('Decision note'), releasePayout: true }), 'Decided'), 'soft'),
        btn('Refund & withhold', () => act(() => api('POST', `/ops/disputes/${d.id}/decide`, { decision: ask('Decision note'), releasePayout: false, refundAmount: Math.round(Number(ask('Refund ₹')) * 100) }), 'Decided'), 'secondary'))]))),
      card('Recent refunds', null, table(['Refund', 'Amount', 'Policy', 'Note', 'Status'], q.refunds.map(r => [r.id, inr(r.amount), r.policy, r.decision_note, badge(r.status)]))),
    ];
  },
  async finance() {
    const month = today().slice(0, 7);
    const [s, payouts] = await Promise.all([api('GET', `/finance/summary?month=${month}`), api('GET', '/finance/payouts')]);
    const payable = payouts.filter(p => ['accrued', 'scheduled'].includes(p.status));
    return [
      h('div', { class: 'row' }, stat('Gross booking value', inr(s.grossBookingValue)), stat('Refunds', inr(s.refunds), null, 'warn'), stat('Priest liabilities', inr(s.priestLiabilities)), stat('Platform revenue', inr(s.platformRevenue), 'Commission + platform charge + membership', 'ok')),
      h('p', { class: 'muted' }, s.note),
      card('Priest payouts', payable.length && session.role === 'finance' ? btn(`Mark ${payable.length} as paid`, () => act(() => api('POST', '/finance/payouts/paid', { ids: payable.map(p => p.id) }), 'Payouts marked paid')) : null,
        table(['Priest', 'Booking', 'Service', 'Net', 'Settles', 'Status'], payouts.map(p => [p.priest, p.code, p.service, inr(p.net), p.settle_on, badge(p.status)]))),
    ];
  },
  async content() {
    const items = await api('GET', '/cms/items');
    const flow = ['brief', 'draft', 'religious_review', 'recording', 'language_review', 'rights_clearance', 'metadata', 'published'];
    const title = h('input', { placeholder: 'Title' }), deity = h('input', { placeholder: 'Deity id (e.g. shiva)' });
    const fmt = h('select', {}, ['audio', 'video', 'text', 'practice'].map(o => h('option', {}, o))), kind = h('select', {}, ['original', 'source', 'translation', 'commentary', 'story', 'guide'].map(o => h('option', {}, o)));
    return [
      card('New item', h('span', { class: 'muted' }, 'AI may draft; people approve religious claims, pronunciation and artwork'), h('div', { class: 'form' }, title, deity, fmt, kind,
        btn('Create brief', () => act(() => api('POST', '/cms/items', { title: title.value, deityId: deity.value || undefined, language: 'hi', format: fmt.value, kind: kind.value }), 'Brief created')))),
      card('Items', null, table(['Title', 'Kind', 'Status', 'Rights', 'Actions'], items.map(i => {
        const cur = i.status === 'unpublished' ? 'metadata' : i.status, nxt = flow[flow.indexOf(cur) + 1];
        return [i.title, `${i.format} · ${i.kind}`, badge(i.status), i.rights.length ? i.rights.map(r => `${r.element}: ${r.status}`).join(', ') : '—',
          h('div', { class: 'actions' },
            nxt && btn(`→ ${nxt.replace('_', ' ')}`, () => act(() => api('POST', `/cms/items/${i.id}/advance`, { to: nxt }), 'Moved'), 'soft'),
            i.status !== 'published' && btn('Clear rights', () => act(() => api('PUT', `/cms/items/${i.id}/rights/${ask('Element', 'recording')}`, { status: 'cleared', reference: ask('Contract or reference') }), 'Rights updated'), 'secondary'),
            i.status === 'published' && btn('Unpublish', () => act(() => api('POST', `/cms/items/${i.id}/unpublish`, { reason: ask('Reason') }), 'Unpublished (audit trail kept)'), 'danger'))];
      }))),
    ];
  },
  async measures() {
    const m = await api('GET', '/ops/measures');
    return [h('div', { class: 'row' }, m.map(x => stat(x.measure, x.value == null ? '—' : typeof x.value === 'number' && x.measure !== 'Confirmed services' && x.measure !== 'Refund and complaint cases' ? `${x.value}%` : String(x.value), `Target: ${x.target}`))),
      h('p', { class: 'muted' }, 'Provisional management goals, not benchmarks. Baselines are established during the pilot.')];
  },
  async audit() {
    const rows = await api('GET', '/ops/audit');
    return [card('Audit log', null, table(['Time', 'Actor', 'Action', 'Entity'], rows.map(r => [when(r.at), r.actor_id ?? 'system', r.action, `${r.entity} ${r.entity_id ?? ''}`])))];
  },
};

// Render ------------------------------------------------------------------------

async function render() {
  if (!session.token) { $app.replaceChildren(loginView()); return; }
  const isPriest = session.role === 'priest';
  const allowed = isPriest ? PRIEST_NAV : OPS_NAV.filter(([k]) => (ROLE_VIEWS[session.role] ?? []).includes(k));
  const cur = allowed.some(([k]) => k === route()) ? route() : allowed[0][0];
  const views = isPriest ? priestViews : opsViews;
  const title = allowed.find(([k]) => k === cur)[1];
  try {
    const body = await views[cur]();
    $app.replaceChildren(shell(allowed, title, isPriest ? null : new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }), body));
  } catch (e) {
    $app.replaceChildren(shell(allowed, title, null, [h('div', { class: 'banner warn' }, e.message)]));
  }
}

window.addEventListener('hashchange', render);
render();
