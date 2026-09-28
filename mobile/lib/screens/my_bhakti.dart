// My Bhakti (Figma page "08"): mandir, saved, notes, bookings, reminders, membership, privacy, accessibility, help.
import 'package:flutter/material.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets.dart';
import 'explore.dart';
import 'pooja.dart';

class MyBhaktiScreen extends StatelessWidget {
  const MyBhaktiScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    void open(Widget w) => Navigator.push(context, MaterialPageRoute(builder: (_) => w));
    Widget row(IconData icon, String title, String sub, Widget page) => ListTile(
          leading: Icon(icon, color: AB.text2), title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: Text(sub), trailing: const Icon(Icons.chevron_right, color: AB.muted), onTap: () => open(page));
    return ListView(padding: const EdgeInsets.only(bottom: 24), children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
        child: Row(children: [
          CircleAvatar(radius: 28, backgroundColor: AB.maroon, child: Text((app.userName ?? 'G')[0], style: AB.display(22, color: Colors.white))),
          const SizedBox(width: 14),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(app.userName ?? 'Guest', style: AB.display(22)),
            Text(app.signedIn ? 'Signed in' : 'Your choices are saved on this device', style: const TextStyle(color: AB.text2, fontSize: 13)),
          ])),
          if (!app.signedIn) FilledButton.tonal(onPressed: () => open(const SignInScreen(reason: 'Sign in to keep your deities, notes and bookings on every device.')), child: const Text('Sign in')),
        ]),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: () => open(const MandirScreen()),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(18), gradient: const LinearGradient(colors: [AB.maroon, Color(0xFF3A0F18)])),
            child: Row(children: [
              const Icon(Icons.local_fire_department_outlined, color: Color(0xFFFFC56B)),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('My mandir', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 16)),
                Text(app.deities.map((d) => deityNames[d]).join(', '), style: const TextStyle(color: Colors.white70, fontSize: 12)),
              ])),
              for (final d in app.deities.take(3)) Padding(padding: const EdgeInsets.only(left: 4), child: DeityDisc(d, size: 32)),
            ]),
          ),
        ),
      ),
      gap(16),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Card(child: Column(children: [
          row(Icons.favorite_border, 'My deities', '${app.deities.length} of 5 · default ${deityNames[app.defaultDeity] ?? '—'}', const _MyDeitiesScreen()),
          row(Icons.lock_outline, 'Private notes', 'Only you can read these', const NotesScreen()),
          row(Icons.calendar_today_outlined, 'Bookings & receipts', 'Upcoming and past services', const BookingsScreen()),
          row(Icons.self_improvement, 'Mantra count', 'Private, no leaderboards', const MantraScreen()),
          row(Icons.star_outline, 'Membership', 'Free daily devotion · Premium optional', const MembershipScreen()),
          row(Icons.shield_outlined, 'Privacy controls', 'Notes excluded from recommendations', const PrivacyScreen()),
          row(Icons.text_fields, 'Accessibility & display', 'Text size, motion, low data', const AccessibilityScreen()),
          row(Icons.help_outline, 'Help & support', 'Support hours 7 AM – 10 PM IST', const HelpScreen()),
        ])),
      ),
      if (app.signedIn) TextButton(onPressed: app.signOut, child: const Text('Sign out', style: TextStyle(color: AB.text2))),
    ]);
  }
}

class _MyDeitiesScreen extends StatelessWidget {
  const _MyDeitiesScreen();
  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('My deities')),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        const Text('Choose up to five. Tap the circle to make one your default.', style: TextStyle(color: AB.text2)),
        gap(),
        for (final d in deityNames.keys)
          Padding(padding: const EdgeInsets.only(bottom: 8), child: Card(child: ListTile(
            leading: DeityDisc(d, size: 44),
            title: Text(deityNames[d]!),
            subtitle: app.defaultDeity == d ? const Text('Default') : null,
            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
              if (app.deities.contains(d)) IconButton(tooltip: 'Make default', onPressed: () => app.setDefault(d), icon: Icon(app.defaultDeity == d ? Icons.radio_button_checked : Icons.radio_button_unchecked, color: AB.saffron)),
              Checkbox(value: app.deities.contains(d), onChanged: (_) {
                if (app.deities.contains(d) && app.deities.length == 1) return;
                if (!app.toggleDeity(d)) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Remove one first: you can choose up to five.')));
              }),
            ]),
          ))),
      ]),
    );
  }
}

/// Personal mandir: visual offerings are app interactions, clearly labeled; no guilt for missed days.
class MandirScreen extends StatefulWidget {
  const MandirScreen({super.key});
  @override
  State<MandirScreen> createState() => _MandirScreenState();
}

class _MandirScreenState extends State<MandirScreen> {
  bool _diya = false, _flowers = false;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final ds = app.deities;
    return Scaffold(
      backgroundColor: const Color(0xFF2A0E16),
      appBar: AppBar(backgroundColor: Colors.transparent, foregroundColor: Colors.white, title: const Text('My mandir')),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        Container(
          height: 360,
          decoration: BoxDecoration(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(165), bottom: Radius.circular(16)),
            border: Border.all(color: AB.gold.withValues(alpha: 0.6), width: 2),
            gradient: RadialGradient(colors: [const Color(0xFFFFC56B).withValues(alpha: _diya ? 0.45 : 0.25), Colors.transparent]),
          ),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            if (ds.isNotEmpty) DeityDisc(ds.first, size: 130),
            gap(14),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [for (final d in ds.skip(1).take(4)) Padding(padding: const EdgeInsets.symmetric(horizontal: 8), child: DeityDisc(d, size: 64))]),
            if (_flowers) const Padding(padding: EdgeInsets.only(top: 12), child: Text('🌼 🌸 🌼', style: TextStyle(fontSize: 22))),
          ]),
        ),
        Container(height: 14, decoration: BoxDecoration(borderRadius: BorderRadius.circular(4), gradient: const LinearGradient(colors: [AB.gold, Color(0xFF7A5A18)]))),
        gap(16),
        Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
          _Offer(icon: Icons.local_fire_department_outlined, label: 'Light diya', on: _diya, onTap: () => setState(() => _diya = !_diya)),
          _Offer(icon: Icons.local_florist_outlined, label: 'Offer flowers', on: _flowers, onTap: () => setState(() => _flowers = !_flowers)),
          _Offer(icon: Icons.notifications_active_outlined, label: 'Ring bell', on: false, onTap: () {}),
        ]),
        gap(12),
        const Text('Visual offerings are app interactions, not ritual substitutes.', textAlign: TextAlign.center, style: TextStyle(color: Colors.white60, fontSize: 12)),
      ]),
    );
  }
}

class _Offer extends StatelessWidget {
  const _Offer({required this.icon, required this.label, required this.on, required this.onTap});
  final IconData icon;
  final String label;
  final bool on;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Column(children: [
        IconButton(
          style: IconButton.styleFrom(backgroundColor: on ? AB.gold.withValues(alpha: 0.35) : Colors.white10, side: const BorderSide(color: AB.gold), minimumSize: const Size(56, 56)),
          onPressed: onTap, tooltip: label, icon: Icon(icon, color: const Color(0xFFFFC56B)),
        ),
        gap(4),
        Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12)),
      ]);
}

class _NeedsSignIn extends StatelessWidget {
  const _NeedsSignIn(this.what);
  final String what;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(children: [
          InfoNote('Sign in to see your $what on every device.'),
          gap(),
          FilledButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => SignInScreen(reason: 'Sign in to see your $what.'))), child: const Text('Sign in')),
        ]),
      );
}

class NotesScreen extends StatelessWidget {
  const NotesScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Private notes')),
      body: !app.signedIn ? const _NeedsSignIn('private notes') : Loader<List>(
        load: () async => (await app.api.get('/me/notes')) as List,
        builder: (c, notes, reload) => ListView(padding: const EdgeInsets.all(20), children: [
          const InfoNote('Only you can read these. They are never public posts and never used for recommendations unless you opt in.', icon: Icons.lock_outline, color: AB.okSoft, fg: AB.text),
          gap(),
          for (final n in notes.cast<Map>())
            Padding(padding: const EdgeInsets.only(bottom: 10), child: Card(child: ListTile(
              title: Text(n['body'] as String),
              subtitle: Text((n['created_at'] as String).substring(0, 10)),
              trailing: IconButton(tooltip: 'Delete', icon: const Icon(Icons.delete_outline), onPressed: () async { await app.api.delete('/me/notes/${n['id']}'); reload(); }),
            ))),
          FilledButton.icon(onPressed: () async {
            final ctl = TextEditingController();
            final body = await showDialog<String>(context: context, builder: (d) => AlertDialog(
              title: const Text('New note'), content: TextField(controller: ctl, maxLines: 4, autofocus: true),
              actions: [TextButton(onPressed: () => Navigator.pop(d), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(d, ctl.text), child: const Text('Save'))],
            ));
            if (body != null && body.trim().isNotEmpty) { await app.api.post('/me/notes', {'body': body}); reload(); }
          }, icon: const Icon(Icons.add), label: const Text('New note')),
        ]),
      ),
    );
  }
}

class BookingsScreen extends StatelessWidget {
  const BookingsScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Bookings')),
      body: !app.signedIn ? const _NeedsSignIn('bookings') : Loader<List>(
        load: () async => (await app.api.get('/me/bookings')) as List,
        builder: (c, list, _) => list.isEmpty
            ? const Padding(padding: EdgeInsets.all(20), child: InfoNote('No bookings yet.'))
            : ListView(padding: const EdgeInsets.all(20), children: [
                for (final b in list.cast<Map>())
                  Padding(padding: const EdgeInsets.only(bottom: 10), child: Card(child: ListTile(
                    leading: DeityDisc(((b['service'] as Map)['deityId'] ?? 'ganesha') as String, size: 44),
                    title: Text((b['service'] as Map)['name'] as String, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text('${b['code']} · ${(b['startsAt'] as String).substring(0, 10)}'),
                    trailing: Pill(b['status'] as String, tone: b['status'] == 'confirmed' || b['status'] == 'completed' ? BadgeTone.ok : BadgeTone.muted),
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => BookingScreen(bookingId: b['id'] as String))),
                  ))),
              ]),
      ),
    );
  }
}

class MantraScreen extends StatefulWidget {
  const MantraScreen({super.key});
  @override
  State<MantraScreen> createState() => _MantraScreenState();
}

class _MantraScreenState extends State<MantraScreen> {
  int _n = 0;
  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Mantra count')),
      body: Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text('Om Namah Shivaya', style: AB.display(20)),
        const Text('Private mantra counter', style: TextStyle(color: AB.muted)),
        gap(20),
        SizedBox(width: 180, height: 180, child: Stack(alignment: Alignment.center, children: [
          SizedBox.expand(child: CircularProgressIndicator(value: (_n % 108) / 108, strokeWidth: 8, color: AB.saffron, backgroundColor: AB.border)),
          Column(mainAxisSize: MainAxisSize.min, children: [Text('${_n % 108}', style: AB.display(40, color: AB.maroon)), const Text('of 108', style: TextStyle(color: AB.text2))]),
        ])),
        gap(24),
        SizedBox(width: 240, child: FilledButton(onPressed: () {
          setState(() => _n++);
          if (app.signedIn) app.api.post('/me/mantra', {'mantra': 'Om Namah Shivaya'}).catchError((_) => null);
        }, child: const Text('Tap to count'))),
        gap(16),
        const Padding(padding: EdgeInsets.symmetric(horizontal: 32), child: Text('No streaks, rankings or reminders about missed days.', textAlign: TextAlign.center, style: TextStyle(color: AB.text2))),
      ])),
    );
  }
}

class PrivacyScreen extends StatelessWidget {
  const PrivacyScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Privacy')),
      body: !app.signedIn ? const _NeedsSignIn('privacy settings') : Loader<Map>(
        load: () async => Map.from((await app.api.get('/me'))['consents'] as Map),
        builder: (c, consents, reload) => ListView(padding: const EdgeInsets.all(20), children: [
          SwitchListTile(value: consents['history_for_recommendations'] == true, title: const Text('Use listening history for suggestions'), subtitle: const Text('Plays and saves only'),
            onChanged: (v) async { await app.api.put('/me/consents/history_for_recommendations', {'granted': v}); reload(); }),
          SwitchListTile(value: consents['notes_for_recommendations'] == true, title: const Text('Use private notes for suggestions'), subtitle: const Text('Off unless you choose'),
            onChanged: (v) async { await app.api.put('/me/consents/notes_for_recommendations', {'granted': v}); reload(); }),
          const SwitchListTile(value: false, onChanged: null, title: Text('Devotional preferences in ad audiences'), subtitle: Text('Never used. This cannot be turned on.')),
          gap(16),
          OutlinedButton(onPressed: () async {
            final m = ScaffoldMessenger.of(context);
            final ok = await showDialog<bool>(context: context, builder: (d) => AlertDialog(
              title: const Text('Delete your account?'),
              content: const Text('Notes, playlists and preferences are deleted. Transaction records required by law are kept, detached from your details.'),
              actions: [TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Keep account')), FilledButton(onPressed: () => Navigator.pop(d, true), child: const Text('Delete'))],
            ));
            if (ok != true) return;
            try { await app.api.delete('/me'); app.signOut(); m.showSnackBar(const SnackBar(content: Text('Account deleted'))); } catch (e) { m.showSnackBar(SnackBar(content: Text('$e'))); }
          }, child: const Text('Delete account', style: TextStyle(color: AB.live))),
        ]),
      ),
    );
  }
}

class AccessibilityScreen extends StatelessWidget {
  const AccessibilityScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Accessibility & display')),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        const Text('Text size', style: TextStyle(fontWeight: FontWeight.w600)),
        Slider(value: app.textScale, min: 0.9, max: 1.6, divisions: 7, activeColor: AB.saffron, label: '${(app.textScale * 100).round()}%', onChanged: (v) => app.setAccessibility(scale: v)),
        Text('ॐ नमः शिवाय', style: AB.sacred(22, color: AB.maroon)),
        gap(),
        SwitchListTile(value: app.reducedMotion, title: const Text('Reduced motion'), subtitle: const Text('Calm transitions, no animated backgrounds'), onChanged: (v) => app.setAccessibility(motion: v)),
        const SwitchListTile(value: true, onChanged: null, title: Text('Never autoplay background music'), subtitle: Text('Sound starts only when you press play')),
        SwitchListTile(value: app.highContrast, title: const Text('High contrast'), onChanged: (v) => app.setAccessibility(contrast: v)),
        SwitchListTile(value: app.lowBandwidth, title: const Text('Low bandwidth mode'), subtitle: const Text('Audio-first darshan, smaller images'), onChanged: (v) => app.setAccessibility(bandwidth: v)),
        ListTile(title: const Text('Language'), trailing: DropdownButton<String>(value: app.language, onChanged: (v) => app.setLanguage(v!), items: const [DropdownMenuItem(value: 'hi', child: Text('हिन्दी')), DropdownMenuItem(value: 'en', child: Text('English'))])),
      ]),
    );
  }
}

class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    Future<void> openCase(String topic, {bool safety = false}) async {
      final m = ScaffoldMessenger.of(context);
      if (!app.signedIn) { m.showSnackBar(const SnackBar(content: Text('Sign in first so we can reply to you'))); return; }
      final ctl = TextEditingController();
      final body = await showDialog<String>(context: context, builder: (d) => AlertDialog(
        title: Text(topic), content: TextField(controller: ctl, maxLines: 4, decoration: const InputDecoration(hintText: 'Tell us what happened')),
        actions: [TextButton(onPressed: () => Navigator.pop(d), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(d, ctl.text), child: const Text('Send'))],
      ));
      if (body == null || body.trim().isEmpty) return;
      await app.api.post('/support/cases', {'topic': topic, 'body': body, 'safety': safety});
      m.showSnackBar(const SnackBar(content: Text('Sent. We reply within support hours.')));
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Help')),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        const InfoNote('Support hours: 7 AM – 10 PM IST. A duty contact is available during every paid service.', icon: Icons.schedule, color: AB.infoSoft, fg: AB.text),
        gap(),
        Card(child: Column(children: [
          for (final t in ['A booking or refund', 'Online pooja or video room', 'Home visit', 'Live darshan', 'Membership & billing'])
            ListTile(title: Text(t), trailing: const Icon(Icons.chevron_right), onTap: () => openCase(t)),
          ListTile(leading: const Icon(Icons.flag_outlined, color: AB.live), title: const Text('Report a safety concern', style: TextStyle(color: AB.live)), onTap: () => openCase('Safety concern', safety: true)),
        ])),
      ]),
    );
  }
}
