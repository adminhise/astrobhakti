// Onboarding (Figma page "02 Onboarding"): browse first, language, 1–5 deities, default, optional reminder.
import 'package:flutter/material.dart';
import '../main.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final s = app.s;
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF5A1726), AB.saffron])),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 40, 24, 32),
            child: Column(children: [
              const Spacer(),
              Container(
                width: 200, height: 200,
                decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: 0.08), border: Border.all(color: Colors.white24)),
                child: const Icon(Icons.local_fire_department_outlined, size: 72, color: Colors.white),
              ),
              gap(28),
              Text('AstroBhakti', style: AB.display(32, color: Colors.white)),
              Text('एस्ट्रोभक्ति', style: AB.sacred(18, color: Colors.white70)),
              gap(16),
              Text(s.t('tagline'), textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 16)),
              const Spacer(),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: AB.maroon),
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LanguageScreen())),
                child: Text(s.t('getStarted')),
              ),
              gap(12),
              OutlinedButton(
                style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white70), minimumSize: const Size.fromHeight(52)),
                onPressed: () {
                  // Visitors can browse the full catalogue before choosing anything.
                  if (app.deities.isEmpty) { app.toggleDeity('ganesha'); }
                  app.finishOnboarding();
                  Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const HomeShell()), (_) => false);
                },
                child: Text(s.t('browseFirst')),
              ),
              gap(8),
              Text(s.t('noAccount'), style: const TextStyle(color: Colors.white70, fontSize: 12)),
            ]),
          ),
        ),
      ),
    );
  }
}

class _Progress extends StatelessWidget {
  const _Progress(this.step);
  final int step;
  @override
  Widget build(BuildContext context) => Row(children: [
        for (var i = 0; i < 3; i++)
          Container(margin: const EdgeInsets.only(right: 6), width: i == step ? 40 : 20, height: 4,
            decoration: BoxDecoration(color: i <= step ? AB.saffron : AB.border, borderRadius: BorderRadius.circular(2))),
      ]);
}

class LanguageScreen extends StatelessWidget {
  const LanguageScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final s = app.s;
    Widget option(String code, String a, String b) {
      final on = app.language == code;
      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => app.setLanguage(code),
          child: Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(color: on ? AB.saffronSoft : AB.card, borderRadius: BorderRadius.circular(16),
              border: Border.all(color: on ? AB.saffron : AB.border, width: on ? 2 : 1)),
            child: Row(children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(a, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
                Text(b, style: const TextStyle(color: AB.text2)),
              ])),
              Icon(on ? Icons.check_circle : Icons.radio_button_unchecked, color: on ? AB.saffron : AB.borderStrong),
            ]),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const _Progress(0), gap(20),
          const Text('Step 1 of 3', style: TextStyle(color: AB.muted)),
          Text(s.t('chooseLanguage'), style: AB.display(26)),
          Text(app.language == 'hi' ? 'Choose your language' : 'अपनी भाषा चुनें', style: AB.sacred(18, color: AB.text2)),
          gap(20),
          option('hi', 'हिन्दी', 'Hindi'),
          option('en', 'English', 'अंग्रेज़ी'),
          InfoNote(s.t('moreLanguages'), icon: Icons.language),
          const Spacer(),
          FilledButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ChooseDeitiesScreen())), child: Text(s.t('continue'))),
        ]),
      ),
    );
  }
}

class ChooseDeitiesScreen extends StatelessWidget {
  const ChooseDeitiesScreen({super.key});

  Future<void> _replace(BuildContext context, AppState app, String adding) async {
    // Selecting a sixth deity opens a simple replacement choice (proposal §1).
    final remove = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (c) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('You already have five deities', style: AB.display(20)),
          gap(6),
          Text('To add ${deityNames[adding]}, choose one to replace. Your saved prayers and notes stay in My Bhakti.', style: const TextStyle(color: AB.text2)),
          gap(16),
          Wrap(spacing: 12, runSpacing: 12, children: [
            for (final d in app.deities)
              InkWell(onTap: () => Navigator.pop(c, d), child: Column(children: [DeityDisc(d, size: 56), gap(4), Text(deityNames[d]!, style: const TextStyle(fontSize: 12))])),
          ]),
          gap(12),
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('Keep my five')),
        ]),
      ),
    );
    if (remove != null) app.replaceDeity(remove, adding);
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final s = app.s;
    return Scaffold(
      appBar: AppBar(),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 0, 20, 24), children: [
        const _Progress(1), gap(20),
        const Text('Step 2 of 3', style: TextStyle(color: AB.muted)),
        Text(s.t('whom'), style: AB.display(26)),
        gap(4),
        Text(s.t('whomSub'), style: const TextStyle(color: AB.text2)),
        gap(12),
        Align(alignment: Alignment.centerLeft, child: Pill('${app.deities.length} of 5 selected', tone: BadgeTone.live)),
        gap(16),
        GridView.count(
          crossAxisCount: 3, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), mainAxisSpacing: 8, childAspectRatio: 0.95,
          children: [
            for (final d in deityNames.keys)
              Semantics(
                button: true, selected: app.deities.contains(d),
                child: InkWell(
                  borderRadius: BorderRadius.circular(50),
                  onTap: () { if (!app.toggleDeity(d)) _replace(context, app, d); },
                  child: Column(children: [
                    Stack(clipBehavior: Clip.none, children: [
                      DeityDisc(d, size: 84, selected: app.deities.contains(d)),
                      if (app.deities.contains(d))
                        Positioned(right: -2, top: -2, child: CircleAvatar(radius: 13, backgroundColor: AB.saffron, child: Text('${app.deities.indexOf(d) + 1}', style: const TextStyle(color: Colors.white, fontSize: 12)))),
                    ]),
                    gap(6),
                    Text(deityNames[d]!, style: TextStyle(fontWeight: app.deities.contains(d) ? FontWeight.w600 : FontWeight.w400)),
                  ]),
                ),
              ),
          ],
        ),
        TextButton.icon(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RequestDeityScreen())), icon: const Icon(Icons.add, color: AB.saffronDark), label: Text(s.t('requestDeity'), style: const TextStyle(color: AB.saffronDark))),
        gap(16),
        FilledButton(
          onPressed: app.deities.isEmpty ? null : () => Navigator.push(context, MaterialPageRoute(builder: (_) => const DefaultDeityScreen())),
          child: Text('${s.t('continue')} · ${app.deities.length}'),
        ),
      ]),
    );
  }
}

class DefaultDeityScreen extends StatelessWidget {
  const DefaultDeityScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final s = app.s;
    return Scaffold(
      appBar: AppBar(),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const _Progress(2), gap(20),
          const Text('Step 3 of 3', style: TextStyle(color: AB.muted)),
          Text(s.t('chooseDefault'), style: AB.display(26)),
          gap(4),
          Text(s.t('chooseDefaultSub'), style: const TextStyle(color: AB.text2)),
          gap(16),
          Expanded(
            child: ReorderableListView(
              onReorderItem: app.reorder,
              children: [
                for (final d in app.deities)
                  Padding(
                    key: ValueKey(d),
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Material(
                      color: app.defaultDeity == d ? AB.saffronSoft : AB.card,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: app.defaultDeity == d ? AB.saffron : AB.border, width: app.defaultDeity == d ? 2 : 1)),
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                        leading: DeityDisc(d, size: 48),
                        title: Text(deityNames[d]!, style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Text(app.defaultDeity == d ? 'Default · shown first on Home' : deityNamesHi[d]!),
                        trailing: Icon(app.defaultDeity == d ? Icons.radio_button_checked : Icons.radio_button_unchecked, color: app.defaultDeity == d ? AB.saffron : AB.borderStrong),
                        onTap: () => app.setDefault(d),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          FilledButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ReminderScreen())), child: Text(s.t('continue'))),
        ]),
      ),
    );
  }
}

class ReminderScreen extends StatefulWidget {
  const ReminderScreen({super.key});
  @override
  State<ReminderScreen> createState() => _ReminderScreenState();
}

class _ReminderScreenState extends State<ReminderScreen> {
  String _time = '06:30';

  void _done(AppState app, {required bool setReminder}) {
    app.finishOnboarding();
    if (setReminder && app.signedIn) {
      app.api.post('/me/reminders', {'kind': 'routine', 'localTime': _time}).catchError((_) => null);
    }
    Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const HomeShell()), (_) => false);
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final s = app.s;
    return Scaffold(
      appBar: AppBar(),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Optional', style: TextStyle(color: AB.muted)),
          Text(s.t('reminderTitle'), style: AB.display(26)),
          Text('For your routine with ${deityNames[app.defaultDeity] ?? 'your deity'}. ${s.t('reminderSub')}', style: const TextStyle(color: AB.text2)),
          gap(20),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final (label, t) in [('Morning 6:30', '06:30'), ('Noon', '12:00'), ('Evening 7:00', '19:00')])
              ChoiceChip(label: Text(label), selected: _time == t, checkmarkColor: Colors.white, onSelected: (_) => setState(() => _time = t),
                labelStyle: TextStyle(color: _time == t ? Colors.white : AB.text2)),
          ]),
          gap(16),
          const InfoNote('We ask for notification permission only after you tap Set reminder.'),
          const Spacer(),
          FilledButton(onPressed: () => _done(app, setReminder: true), child: Text(s.t('setReminder'))),
          TextButton(onPressed: () => _done(app, setReminder: false), child: Text(s.t('skip'), style: const TextStyle(color: AB.saffronDark))),
        ]),
      ),
    );
  }
}

class RequestDeityScreen extends StatefulWidget {
  const RequestDeityScreen({super.key});
  @override
  State<RequestDeityScreen> createState() => _RequestDeityScreenState();
}

class _RequestDeityScreenState extends State<RequestDeityScreen> {
  final _name = TextEditingController(), _aliases = TextEditingController(), _region = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Request a deity')),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        const Text('Our editorial adviser reviews each request, including regional names and forms.', style: TextStyle(color: AB.text2)),
        gap(16),
        TextField(controller: _name, decoration: const InputDecoration(labelText: 'Deity or form')),
        gap(),
        TextField(controller: _aliases, decoration: const InputDecoration(labelText: 'Regional or alternate names')),
        gap(),
        TextField(controller: _region, decoration: const InputDecoration(labelText: 'Region or tradition (optional)')),
        gap(16),
        const InfoNote('A deity category is published only when its starter collection is complete and reviewed.'),
        gap(20),
        FilledButton(
          onPressed: () async {
            final messenger = ScaffoldMessenger.of(context);
            final nav = Navigator.of(context);
            try {
              await app.api.post('/deity-requests', {'name': _name.text, 'aliases': _aliases.text, 'region': _region.text, 'language': app.language});
              messenger.showSnackBar(const SnackBar(content: Text('Request sent. We will let you know when it is ready.')));
              nav.pop();
            } catch (e) {
              messenger.showSnackBar(SnackBar(content: Text('$e')));
            }
          },
          child: const Text('Send request'),
        ),
      ]),
    );
  }
}
