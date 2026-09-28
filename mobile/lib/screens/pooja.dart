// Pooja services (Figma pages "06" and "07"): scope before payment, verified priests, itemized amount,
// confirmation only after payment and reservation, preparation guide, private room.
import 'package:flutter/material.dart';
import '../api.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets.dart';
import 'home.dart';

class PoojaScreen extends StatelessWidget {
  const PoojaScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    return ListView(padding: const EdgeInsets.only(bottom: 24), children: [
      Padding(padding: const EdgeInsets.fromLTRB(20, 12, 20, 0), child: Text('Pooja services', style: AB.display(26))),
      const Padding(padding: EdgeInsets.fromLTRB(20, 4, 20, 0), child: Text('Scope, priest and the full amount are shown before you pay.', style: TextStyle(color: AB.text2))),
      Loader<List>(
        load: () async => (await app.api.get('/services')) as List,
        builder: (c, services, _) {
          List<Map> of(List<String> formats) => services.cast<Map>().where((s) => formats.contains(s['format']) && s['quoteOnly'] != true).toList();
          return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const SectionHeader('Online'),
            for (final s in of(['private_online', 'group_live', 'temple_on_behalf', 'guided_home'])) Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 10), child: ServiceTile(service: s)),
            const SectionHeader('At your home'),
            const Padding(padding: EdgeInsets.fromLTRB(20, 0, 20, 10), child: InfoNote('Home visits run in one pilot city first. We check your postal code before booking.', icon: Icons.home_outlined)),
            for (final s in of(['home_visit'])) Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 10), child: ServiceTile(service: s)),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Card(child: ListTile(
                leading: const Icon(Icons.receipt_long_outlined),
                title: const Text('Wedding, multi-day or large event?', style: TextStyle(fontWeight: FontWeight.w600)),
                subtitle: const Text('Request a reviewed quotation instead of an instant price'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const QuotationScreen())),
              )),
            ),
          ]);
        },
      ),
    ]);
  }
}

class ServiceDetailScreen extends StatelessWidget {
  const ServiceDetailScreen({super.key, required this.serviceId});
  final String serviceId;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(),
      body: Loader<Map>(
        load: () async => Map.from(await app.api.post('/services/$serviceId/quote', {})),
        builder: (c, q, _) {
          final s = q['service'] as Map;
          final deity = (s['deityId'] ?? 'ganesha') as String;
          return Column(children: [
            Expanded(child: ListView(padding: const EdgeInsets.all(20), children: [
              Row(children: [
                DeityDisc(deity, size: 64), const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Pill(_formatLabel(s['format'] as String), tone: BadgeTone.info),
                  Text(s['name'] as String, style: AB.display(22)),
                  Text('${s['durationMin']}–${s['durationMax']} min · ${s['priestsRequired']} priest${s['priestsRequired'] == 1 ? '' : 's'} · ${s['tradition'] ?? ''}', style: const TextStyle(color: AB.text2)),
                ])),
              ]),
              gap(16),
              _Block(title: s['format'] == 'group_live' ? 'What your place includes' : 'What the priest provides', children: [
                for (final i in s['scope'] as List) _Line(i as String, ok: true),
                if (s['format'] == 'group_live' && s['namesReadIndividually'] == false) const _Line('Individual names are not read one by one at this group size', ok: false),
                if (s['capacity'] != null) _Line('Capacity: ${s['capacity']} families per ceremony', ok: true),
              ]),
              gap(),
              _Block(title: 'Not included', tone: AB.sand, children: [for (final i in s['exclusions'] as List) _Line(i as String, ok: false)]),
              gap(),
              _Block(title: 'Price, item by item', children: [
                for (final i in q['items'] as List) _Money((i as Map)['label'] as String, i['amount'] as num),
                const Divider(),
                _Money('Total', q['total'] as num, bold: true),
              ]),
              gap(),
              const InfoNote('Free cancellation up to 24 hours before. If the priest does not attend, choose a full refund or a replacement slot you accept.', color: AB.infoSoft, fg: AB.text),
            ])),
            SafeArea(child: Padding(
              padding: const EdgeInsets.all(16),
              child: FilledButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ChooseSlotScreen(service: s))), child: Text(s['format'] == 'group_live' ? 'Reserve a place · ${inr(q['total'] as num)}' : 'Choose priest & time')),
            )),
          ]);
        },
      ),
    );
  }
}

String _when(BuildContext c, String iso) {
  final t = DateTime.parse(iso).toLocal();
  final l = MaterialLocalizations.of(c);
  return '${l.formatFullDate(t)} · ${l.formatTimeOfDay(TimeOfDay.fromDateTime(t))}';
}

const _checkoutLabel = {'store_billing': 'Google Play / App Store billing', 'external_permitted': 'secure external checkout', 'gateway': 'secure payment gateway'};

const _langNames = {'hi': 'Hindi', 'sa': 'Sanskrit', 'mr': 'Marathi', 'en': 'English', 'ta': 'Tamil', 'bn': 'Bengali'};

String _formatLabel(String f) => switch (f) {
      'private_online' => 'Private online pooja', 'group_live' => 'Group live pooja', 'temple_on_behalf' => 'Temple pooja on behalf',
      'guided_home' => 'Guided home practice', 'home_visit' => 'Pooja at home', _ => f,
    };

class _Block extends StatelessWidget {
  const _Block({required this.title, required this.children, this.tone = AB.card});
  final String title;
  final List<Widget> children;
  final Color tone;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: tone, borderRadius: BorderRadius.circular(14), border: tone == AB.card ? Border.all(color: AB.border) : null),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(fontWeight: FontWeight.w600)), gap(8), ...children]),
      );
}

class _Line extends StatelessWidget {
  const _Line(this.text, {required this.ok});
  final String text;
  final bool ok;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(ok ? Icons.check : Icons.remove, size: 18, color: ok ? AB.ok : AB.muted), const SizedBox(width: 8), Expanded(child: Text(text)),
        ]),
      );
}

class _Money extends StatelessWidget {
  const _Money(this.label, this.amount, {this.bold = false});
  final String label;
  final num amount;
  final bool bold;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(children: [
          Expanded(child: Text(label, style: TextStyle(color: bold ? AB.text : AB.text2, fontWeight: bold ? FontWeight.w600 : FontWeight.w400))),
          Text(inr(amount), style: TextStyle(fontWeight: bold ? FontWeight.w700 : FontWeight.w400, color: bold ? AB.maroon : AB.text, fontSize: bold ? 18 : 14)),
        ]),
      );
}

class ChooseSlotScreen extends StatefulWidget {
  const ChooseSlotScreen({super.key, required this.service});
  final Map service;
  @override
  State<ChooseSlotScreen> createState() => _ChooseSlotScreenState();
}

class _ChooseSlotScreenState extends State<ChooseSlotScreen> {
  late DateTime _day = DateTime.now().add(const Duration(days: 2));
  int _hour = 9;
  String? _priestId;

  DateTime get _start => DateTime(_day.year, _day.month, _day.day, _hour, 30);

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final s = widget.service;
    final group = s['format'] == 'group_live';
    return Scaffold(
      appBar: AppBar(title: Text(group ? 'Choose ceremony' : 'Choose priest & time')),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        SizedBox(height: 76, child: ListView(scrollDirection: Axis.horizontal, children: [
          for (var i = 1; i <= 7; i++) Builder(builder: (_) {
            final d = DateTime.now().add(Duration(days: i));
            final on = d.day == _day.day;
            return Padding(padding: const EdgeInsets.only(right: 8), child: InkWell(
              onTap: () => setState(() { _day = d; _priestId = null; }),
              child: Container(width: 58, decoration: BoxDecoration(color: on ? AB.maroon : AB.card, borderRadius: BorderRadius.circular(14), border: on ? null : Border.all(color: AB.border)),
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Text(MaterialLocalizations.of(context).narrowWeekdays[d.weekday % 7], style: TextStyle(color: on ? Colors.white70 : AB.muted, fontSize: 12)),
                  Text('${d.day}', style: TextStyle(color: on ? Colors.white : AB.text, fontSize: 20, fontWeight: FontWeight.w600)),
                ])),
            ));
          }),
        ])),
        gap(16),
        Text(s['format'] == 'home_visit' ? 'Arrival window' : 'Start time', style: const TextStyle(fontWeight: FontWeight.w600)),
        gap(8),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final h in [7, 9, 11, 17, 19])
            ChoiceChip(label: Text(s['format'] == 'home_visit' ? '$h:30–${h + 1}:00' : '$h:30'), selected: _hour == h, labelStyle: TextStyle(color: _hour == h ? Colors.white : AB.text2), onSelected: (_) => setState(() { _hour = h; _priestId = null; })),
        ]),
        if (!group) ...[
          gap(20),
          const Text('Verified priests free at this time', style: TextStyle(fontWeight: FontWeight.w600)),
          gap(8),
          Loader<List>(
            key: ValueKey(_start),
            load: () async => (await app.api.get('/services/${s['id']}/priests?startsAt=${Uri.encodeQueryComponent(_start.toUtc().toIso8601String())}')) as List,
            builder: (c, priests, _) => priests.isEmpty
                ? const InfoNote('No qualified priest is free then. Try another time.')
                : Column(children: [
                    for (final p in priests.cast<Map>())
                      Padding(padding: const EdgeInsets.only(bottom: 10), child: Material(
                        color: _priestId == p['id'] ? AB.saffronSoft : AB.card,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: _priestId == p['id'] ? AB.saffron : AB.border, width: _priestId == p['id'] ? 2 : 1)),
                        child: ListTile(
                          contentPadding: const EdgeInsets.all(12),
                          leading: const CircleAvatar(backgroundColor: AB.goldSoft, child: Icon(Icons.person_outline, color: AB.gold)),
                          title: Text(p['displayName'] as String, style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text('Languages: ${(p['languages'] as List).map((l) => _langNames[l] ?? l).join(', ')}'),
                            gap(4),
                            Pill('Verified · ${(p['verification'] as List).length} checks', tone: BadgeTone.ok),
                          ]),
                          onTap: () => setState(() => _priestId = p['id'] as String),
                        ),
                      )),
                    const Text('A verification badge records completed checks and dates; it is not a guarantee of conduct.', style: TextStyle(color: AB.muted, fontSize: 12)),
                  ]),
          ),
        ],
      ]),
      bottomNavigationBar: SafeArea(child: Padding(
        padding: const EdgeInsets.all(16),
        child: FilledButton(
          onPressed: group || _priestId != null ? () => Navigator.push(context, MaterialPageRoute(builder: (_) => ParticipantsScreen(service: s, startsAt: _start, priestId: _priestId))) : null,
          child: const Text('Continue'),
        ),
      )),
    );
  }
}

class ParticipantsScreen extends StatefulWidget {
  const ParticipantsScreen({super.key, required this.service, required this.startsAt, this.priestId});
  final Map service;
  final DateTime startsAt;
  final String? priestId;
  @override
  State<ParticipantsScreen> createState() => _ParticipantsScreenState();
}

class _ParticipantsScreenState extends State<ParticipantsScreen> {
  final _names = [TextEditingController()];
  final _gotra = TextEditingController();
  final _notes = TextEditingController();
  final _line1 = TextEditingController(), _city = TextEditingController(text: 'Pune'), _postal = TextEditingController(), _access = TextEditingController();
  bool _assistGotra = true, _privacy = false, _busy = false;
  int _dakshina = 0;

  bool get _home => widget.service['format'] == 'home_visit';
  bool get _group => widget.service['format'] == 'group_live';

  Future<void> _book(AppState app) async {
    final messenger = ScaffoldMessenger.of(context);
    final nav = Navigator.of(context);
    if (!app.signedIn) {
      final ok = await nav.push<bool>(MaterialPageRoute(builder: (_) => const SignInScreen(reason: 'Sign in to book. Browsing and listening never need an account.')));
      if (ok != true) return;
    }
    setState(() => _busy = true);
    try {
      String? addressId;
      if (_home) {
        final a = await app.api.post('/me/addresses', {'line1': _line1.text, 'city': _city.text, 'postalCode': _postal.text, 'accessNotes': _access.text});
        addressId = a['id'] as String;
      }
      final held = await app.api.post('/bookings', {
        'serviceId': widget.service['id'], 'startsAt': widget.startsAt.toUtc().toIso8601String(), 'priestId': widget.priestId,
        'participants': [for (final c in _names) if (c.text.trim().isNotEmpty) {'name': c.text.trim()}],
        'gotra': _gotra.text.trim().isEmpty ? null : _gotra.text.trim(), 'priestAssistGotra': _assistGotra,
        'addressId': addressId, 'notes': _notes.text, 'dakshina': _dakshina * 100, 'groupPrivacy': _privacy, 'platform': 'android',
      });
      nav.push(MaterialPageRoute(builder: (_) => ReviewPayScreen(held: Map.from(held))));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Who is taking part?')),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        const Text('We only ask what the ritual needs. The priest uses names for the sankalp.', style: TextStyle(color: AB.text2)),
        gap(16),
        for (var i = 0; i < _names.length; i++) Padding(padding: const EdgeInsets.only(bottom: 10), child: TextField(controller: _names[i], decoration: InputDecoration(labelText: 'Participant ${i + 1} name'))),
        TextButton.icon(onPressed: _names.length >= 6 ? null : () => setState(() => _names.add(TextEditingController())), icon: const Icon(Icons.add), label: const Text('Add participant')),
        const InfoNote('You can record a short voice note so the priest pronounces names correctly.', icon: Icons.mic_none, color: AB.saffronSoft, fg: AB.saffronDark),
        gap(16),
        if (!_group) ...[
          TextField(controller: _gotra, decoration: const InputDecoration(labelText: 'Gotra (optional)')),
          CheckboxListTile(contentPadding: EdgeInsets.zero, value: _assistGotra, onChanged: (v) => setState(() => _assistGotra = v ?? true), title: const Text('Let the priest assist me with this')),
        ],
        if (_group) SwitchListTile(contentPadding: EdgeInsets.zero, value: _privacy, onChanged: (v) => setState(() => _privacy = v),
          title: const Text('Don’t speak our name aloud'), subtitle: const Text('Include us as “a devotee family” in the collective sankalp')),
        if (_home) ...[
          gap(8),
          const Text('Visit address', style: TextStyle(fontWeight: FontWeight.w600)),
          const Text('Shared only with the assigned priest after confirmation, never on public profiles.', style: TextStyle(color: AB.text2, fontSize: 12)),
          gap(8),
          TextField(controller: _line1, decoration: const InputDecoration(labelText: 'Flat, building, street')),
          gap(8),
          Row(children: [
            Expanded(child: TextField(controller: _city, decoration: const InputDecoration(labelText: 'City'))),
            const SizedBox(width: 10),
            Expanded(child: TextField(controller: _postal, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Postal code'))),
          ]),
          gap(8),
          TextField(controller: _access, decoration: const InputDecoration(labelText: 'Building access notes (optional)')),
        ],
        gap(12),
        TextField(controller: _notes, maxLines: 2, decoration: const InputDecoration(labelText: 'Anything the priest should know? (optional)')),
        gap(16),
        const Text('Dakshina (optional, goes fully to the priest)', style: TextStyle(fontWeight: FontWeight.w600)),
        gap(8),
        Wrap(spacing: 8, children: [for (final d in [0, 101, 251]) ChoiceChip(label: Text(d == 0 ? 'None' : '₹$d'), selected: _dakshina == d, labelStyle: TextStyle(color: _dakshina == d ? Colors.white : AB.text2), onSelected: (_) => setState(() => _dakshina = d))]),
      ]),
      bottomNavigationBar: SafeArea(child: Padding(padding: const EdgeInsets.all(16), child: FilledButton(onPressed: _busy ? null : () => _book(app), child: Text(_busy ? 'Holding your slot…' : 'Review booking')))),
    );
  }
}

class ReviewPayScreen extends StatefulWidget {
  const ReviewPayScreen({super.key, required this.held});
  final Map held;
  @override
  State<ReviewPayScreen> createState() => _ReviewPayScreenState();
}

class _ReviewPayScreenState extends State<ReviewPayScreen> {
  bool _paying = false;

  Future<void> _pay(AppState app) async {
    final nav = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _paying = true);
    try {
      // Production: open the checkout route below; the provider's signed webhook confirms the booking.
      // Development: simulate the provider callback.
      await app.api.post('/dev/pay/${widget.held['paymentId']}');
      final b = Map<String, dynamic>.from(await app.api.get('/bookings/${(widget.held['booking'] as Map)['id']}'));
      if (b['status'] == 'confirmed') {
        nav.pushAndRemoveUntil(MaterialPageRoute(builder: (_) => BookingScreen(bookingId: b['id'] as String, justConfirmed: true)), (r) => r.isFirst);
      } else {
        messenger.showSnackBar(SnackBar(content: Text('Booking is ${b['status']}. Any payment taken is refunded automatically.')));
      }
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _paying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final b = widget.held['booking'] as Map;
    final s = b['service'] as Map;
    final checkout = widget.held['checkout'] as Map;
    return Scaffold(
      appBar: AppBar(title: const Text('Review & pay')),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        Card(child: ListTile(
          leading: DeityDisc((s['deityId'] ?? 'ganesha') as String, size: 48),
          title: Text(s['name'] as String, style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: Text(_when(context, b['startsAt'] as String)),
        )),
        gap(),
        _Block(title: 'Itemized amount', children: [
          for (final i in b['items'] as List) _Money((i as Map)['label'] as String, i['amount'] as num),
          const Divider(),
          _Money('Total', b['total'] as num, bold: true),
        ]),
        gap(),
        const InfoNote('Free cancellation up to 24 hours before. If the priest does not attend, choose a full refund or a replacement slot you accept. Credits never replace a promised refund.', color: AB.infoSoft, fg: AB.text),
        gap(),
        Text('Your slot is held for 10 minutes. Payment: ${_checkoutLabel[checkout['route']] ?? checkout['route']}.', style: const TextStyle(color: AB.muted, fontSize: 12)),
      ]),
      bottomNavigationBar: SafeArea(child: Padding(padding: const EdgeInsets.all(16), child: FilledButton(onPressed: _paying ? null : () => _pay(app), child: Text(_paying ? 'Confirming…' : 'Pay ${inr(b['total'] as num)}')))),
    );
  }
}

/// Booking detail: confirmation, preparation, arrival code, private room with invitations, cancel.
class BookingScreen extends StatelessWidget {
  const BookingScreen({super.key, required this.bookingId, this.justConfirmed = false});
  final String bookingId;
  final bool justConfirmed;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Your booking')),
      body: Loader<Map>(
        load: () async => Map.from(await app.api.get('/bookings/$bookingId')),
        builder: (c, b, reload) {
          final s = b['service'] as Map;
          final online = ['private_online', 'guided_home'].contains(s['format']);
          return ListView(padding: const EdgeInsets.all(20), children: [
            if (justConfirmed) ...[
              const Center(child: CircleAvatar(radius: 44, backgroundColor: AB.okSoft, child: Icon(Icons.check, size: 42, color: AB.ok))),
              gap(),
              Text('Your pooja is confirmed', textAlign: TextAlign.center, style: AB.display(24)),
              const Text('Payment received and the priest’s time is reserved.', textAlign: TextAlign.center, style: TextStyle(color: AB.text2)),
              gap(16),
            ],
            Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [Expanded(child: Text(s['name'] as String, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16))), Pill(b['status'] as String, tone: b['status'] == 'confirmed' ? BadgeTone.ok : BadgeTone.warn)]),
              gap(6),
              Text('When: ${_when(context, b['startsAt'] as String)}'),
              Text('Booking: ${b['code']}'),
              if (b['address'] != null && (b['address'] as Map)['line1'] != null) Text('Address: ${(b['address'] as Map)['line1']}, ${(b['address'] as Map)['city']}'),
            ]))),
            if (b['arrivalCode'] != null) ...[
              gap(),
              Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(children: [
                const Text('ARRIVAL CODE', style: TextStyle(color: AB.muted, fontSize: 11, letterSpacing: 0.4)),
                gap(6),
                Text(b['arrivalCode'] as String, style: AB.display(36, color: AB.maroon).copyWith(letterSpacing: 12)),
                const Text('Share with the priest when they arrive to start the service.', textAlign: TextAlign.center, style: TextStyle(color: AB.text2, fontSize: 12)),
              ]))),
            ],
            gap(),
            const InfoNote('Preparation guide: samagri checklist, space setup and what to expect. A reminder comes the day before.', icon: Icons.checklist, color: AB.goldSoft, fg: AB.text),
            if (online && b['status'] == 'confirmed') ...[
              gap(),
              FilledButton.icon(onPressed: () async {
                final m = ScaffoldMessenger.of(context);
                try { final r = await app.api.post('/bookings/$bookingId/join', {}); m.showSnackBar(SnackBar(content: Text('Joining as ${r['role']} · recording ${r['recording'] == true ? 'on' : 'off'}'))); }
                catch (e) { m.showSnackBar(SnackBar(content: Text('$e'))); }
              }, icon: const Icon(Icons.videocam_outlined), label: const Text('Join waiting room')),
              gap(8),
              OutlinedButton.icon(onPressed: () async {
                final m = ScaffoldMessenger.of(context);
                try { final r = await app.api.post('/bookings/$bookingId/invites', {}); m.showSnackBar(SnackBar(content: Text('Private invite created. It expires ${r['expiresAt']}.'))); }
                catch (e) { m.showSnackBar(SnackBar(content: Text('$e'))); }
              }, icon: const Icon(Icons.group_add_outlined), label: const Text('Invite family')),
            ],
            if (['held', 'confirmed'].contains(b['status'])) ...[
              gap(),
              TextButton(onPressed: () async {
                final m = ScaffoldMessenger.of(context);
                final r = await app.api.post('/bookings/$bookingId/cancel', {});
                m.showSnackBar(SnackBar(content: Text('Cancelled. Refund: ${inr(r['refunded'] as num)}')));
                reload();
              }, child: const Text('Cancel booking', style: TextStyle(color: AB.live))),
            ],
          ]);
        },
      ),
    );
  }
}

class QuotationScreen extends StatelessWidget {
  const QuotationScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final ceremony = TextEditingController(), dates = TextEditingController(), guests = TextEditingController(), notes = TextEditingController();
    return Scaffold(
      appBar: AppBar(title: const Text('Request a quotation')),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        const Text('An adviser reviews your needs and sends an itemized quote. No payment until you accept.', style: TextStyle(color: AB.text2)),
        gap(16),
        TextField(controller: ceremony, decoration: const InputDecoration(labelText: 'Ceremony')), gap(),
        TextField(controller: dates, decoration: const InputDecoration(labelText: 'Preferred dates')), gap(),
        TextField(controller: guests, decoration: const InputDecoration(labelText: 'Expected guests')), gap(),
        TextField(controller: notes, maxLines: 3, decoration: const InputDecoration(labelText: 'Anything we should know')), gap(20),
        FilledButton(onPressed: () async {
          final m = ScaffoldMessenger.of(context);
          final nav = Navigator.of(context);
          if (!app.signedIn) { m.showSnackBar(const SnackBar(content: Text('Sign in from My Bhakti first'))); return; }
          await app.api.post('/quotations', {'ceremony': ceremony.text, 'dates': dates.text, 'guests': guests.text, 'notes': notes.text});
          m.showSnackBar(const SnackBar(content: Text('Request sent')));
          nav.pop();
        }, child: const Text('Send request')),
      ]),
    );
  }
}

/// Phone sign-in, requested only when saving across devices, subscribing or booking.
class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key, required this.reason});
  final String reason;
  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _phone = TextEditingController(text: '+91'), _code = TextEditingController(), _name = TextEditingController();
  bool _sent = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        Text(app.s.t('saveAcross'), style: AB.display(24)),
        gap(6),
        Text(widget.reason, style: const TextStyle(color: AB.text2)),
        gap(20),
        TextField(controller: _name, decoration: const InputDecoration(labelText: 'Your name (optional)')), gap(),
        TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Mobile number')),
        if (_sent) ...[gap(), TextField(controller: _code, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Code'))],
        if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: const TextStyle(color: AB.live))),
        gap(20),
        FilledButton(onPressed: () async {
          final nav = Navigator.of(context);
          try {
            if (!_sent) {
              final r = await app.requestOtp(_phone.text.trim());
              setState(() { _sent = true; if (r['devCode'] != null) _code.text = r['devCode'] as String; });
            } else {
              await app.verifyOtp(_phone.text.trim(), _code.text.trim(), _name.text.trim().isEmpty ? null : _name.text.trim());
              nav.pop(true);
            }
          } catch (e) { setState(() => _error = '$e'); }
        }, child: Text(_sent ? 'Verify' : 'Send code')),
        gap(16),
        InfoNote(app.s.t('noChart'), icon: Icons.shield_outlined, color: AB.okSoft, fg: AB.text),
      ]),
    );
  }
}
