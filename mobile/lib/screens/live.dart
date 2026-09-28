// Live darshan (Figma page "05"): honest labels, temple and viewer time, interruptions, labeled replays.
import 'package:flutter/material.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets.dart';

String _local(String iso) {
  final t = DateTime.parse(iso).toLocal();
  final h = t.hour % 12 == 0 ? 12 : t.hour % 12;
  return '$h:${t.minute.toString().padLeft(2, '0')} ${t.hour < 12 ? 'AM' : 'PM'}';
}

/// Temple time uses the temple's timezone. India has no daylight saving, so IST is UTC+5:30.
String _templeTime(String iso, String? tz) {
  if (tz != 'Asia/Kolkata') return _local(iso);
  final t = DateTime.parse(iso).toUtc().add(const Duration(hours: 5, minutes: 30));
  final h = t.hour % 12 == 0 ? 12 : t.hour % 12;
  return '$h:${t.minute.toString().padLeft(2, '0')} ${t.hour < 12 ? 'AM' : 'PM'} IST';
}

class LiveScreen extends StatefulWidget {
  const LiveScreen({super.key});
  @override
  State<LiveScreen> createState() => _LiveScreenState();
}

class _LiveScreenState extends State<LiveScreen> {
  bool _mine = false;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    return RefreshIndicator(
      onRefresh: () async => setState(() {}),
      child: ListView(padding: const EdgeInsets.only(bottom: 24), children: [
        Padding(padding: const EdgeInsets.fromLTRB(20, 12, 20, 8), child: Text('Live darshan', style: AB.display(26))),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 20), child: Wrap(spacing: 8, children: [
          ChoiceChip(label: const Text('All'), selected: !_mine, labelStyle: TextStyle(color: !_mine ? Colors.white : AB.text2), onSelected: (_) => setState(() => _mine = false)),
          ChoiceChip(label: const Text('My deities'), selected: _mine, labelStyle: TextStyle(color: _mine ? Colors.white : AB.text2), onSelected: (_) => setState(() => _mine = true)),
        ])),
        Loader<List>(
          key: ValueKey(_mine),
          load: () async {
            final all = (await app.api.get('/events')) as List;
            return _mine ? all.where((e) => app.deities.contains((e as Map)['deityId'])).toList() : all;
          },
          builder: (c, events, _) {
            final now = events.where((e) => ['live', 'interrupted'].contains((e as Map)['status'])).toList();
            final upcoming = events.where((e) => (e as Map)['status'] == 'scheduled').toList();
            final replays = events.where((e) => (e as Map)['type'] == 'recorded').toList();
            return Column(children: [
              if (now.isNotEmpty) ...[const SectionHeader('Live now'), for (final e in now) Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 12), child: EventCard(event: e as Map))],
              const SectionHeader('Upcoming'),
              if (upcoming.isEmpty) const Padding(padding: EdgeInsets.symmetric(horizontal: 20), child: InfoNote('No scheduled events. Follow a temple to be reminded.')),
              for (final e in upcoming) Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 12), child: EventCard(event: e as Map)),
              if (replays.isNotEmpty) ...[const SectionHeader('Recorded darshan'), for (final e in replays) Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 12), child: EventCard(event: e as Map))],
              const Padding(padding: EdgeInsets.fromLTRB(20, 4, 20, 0), child: InfoNote('Public chat is off. Low data mode and captions are available where feasible.')),
            ]);
          },
        ),
      ]),
    );
  }
}

class EventCard extends StatelessWidget {
  const EventCard({super.key, required this.event});
  final Map event;

  @override
  Widget build(BuildContext context) {
    final temple = event['temple'] as Map?;
    final source = temple != null
        ? '${temple['name']}, ${temple['city']} · ${event['type'] == 'recorded' ? 'recorded' : 'authorized feed'}'
        : '${event['venue'] ?? 'AstroBhakti'} · our own broadcast';
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ViewerScreen(eventId: event['id'] as String))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Container(
            height: 140, padding: const EdgeInsets.all(10),
            decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF2A1A12), Color(0xFF7A3A1A)])),
            child: Stack(children: [
              const Align(alignment: Alignment.bottomCenter, child: Icon(Icons.temple_hindu, size: 72, color: Color(0x66000000))),
              Align(alignment: Alignment.topLeft, child: broadcastPill(event['label'] as Map)),
              const Center(child: CircleAvatar(radius: 24, backgroundColor: Colors.white70, child: Icon(Icons.play_arrow, color: AB.maroon))),
            ]),
          ),
          Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(event['title'] as String, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
            Text(source, style: const TextStyle(color: AB.text2, fontSize: 13)),
            if (event['type'] != 'recorded')
              Text('Temple time ${_templeTime(event['startsAt'], temple?['tz'] as String?)} · Your time ${_local(event['startsAt'])}', style: const TextStyle(color: AB.muted, fontSize: 12)),
          ])),
        ]),
      ),
    );
  }
}

class ViewerScreen extends StatelessWidget {
  const ViewerScreen({super.key, required this.eventId});
  final String eventId;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    return Scaffold(
      backgroundColor: AB.ink,
      body: SafeArea(
        bottom: false,
        child: Loader<Map>(
          load: () async => Map.from(await app.api.get('/events/$eventId')),
          builder: (c, e, reload) {
            final interrupted = e['status'] == 'interrupted';
            final temple = e['temple'] as Map?;
            return Column(children: [
              AspectRatio(
                aspectRatio: 16 / 10,
                child: Container(
                  decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF4A2A14), Color(0xFF120B08)])),
                  child: Stack(children: [
                    const Align(alignment: Alignment.bottomCenter, child: Icon(Icons.temple_hindu, size: 120, color: Color(0x55000000))),
                    Positioned(left: 8, top: 8, child: IconButton(tooltip: 'Close', onPressed: () => Navigator.pop(context), icon: const Icon(Icons.keyboard_arrow_down, color: Colors.white))),
                    Positioned(right: 12, top: 16, child: broadcastPill(e['label'] as Map)),
                    if (interrupted)
                      const Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.wifi_off, color: Colors.white, size: 32),
                        SizedBox(height: 8),
                        Text('The temple feed has dropped', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                        Text('We are not showing a recording in its place.', style: TextStyle(color: Colors.white70, fontSize: 12)),
                      ])),
                    const Positioned(right: 12, bottom: 10, child: Row(children: [
                      Icon(Icons.closed_caption_outlined, color: Colors.white), SizedBox(width: 16), Icon(Icons.data_saver_on, color: Colors.white), SizedBox(width: 16), Icon(Icons.fullscreen, color: Colors.white),
                    ])),
                  ]),
                ),
              ),
              Expanded(child: Container(
                color: AB.bg,
                child: ListView(padding: const EdgeInsets.all(20), children: [
                  Text(e['title'] as String, style: AB.display(22)),
                  gap(),
                  if (temple != null) Card(child: ListTile(
                    leading: const CircleAvatar(backgroundColor: AB.maroonSoft, child: Icon(Icons.place_outlined, color: AB.maroon)),
                    title: Text(temple['name'] as String, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text('${temple['city']} · Authorized real-time feed'),
                    trailing: FilledButton.tonal(onPressed: () async {
                      final m = ScaffoldMessenger.of(context);
                      if (!app.signedIn) { m.showSnackBar(const SnackBar(content: Text('Sign in from My Bhakti to follow temples'))); return; }
                      await app.api.put('/temples/${temple['id']}/follow', {'on': true});
                      m.showSnackBar(const SnackBar(content: Text('Following. We will remind you before aarti.')));
                    }, child: const Text('Follow')),
                  )),
                  if (e['type'] != 'recorded') ...[
                    gap(),
                    Row(children: [
                      Expanded(child: _TimeBox('Temple time', _templeTime(e['startsAt'], temple?['tz'] as String?))),
                      const SizedBox(width: 10),
                      Expanded(child: _TimeBox('Your time', _local(e['startsAt']))),
                    ]),
                  ],
                  if (interrupted) ...[
                    gap(),
                    InfoNote('Expected return around ${e['expectedReturnAt'] != null ? _local(e['expectedReturnAt']) : 'soon'}. We will notify you when it is back.', icon: Icons.warning_amber, color: AB.warnSoft, fg: AB.text),
                    if (e['labeledReplay'] != null) ...[
                      gap(),
                      OutlinedButton.icon(onPressed: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => ViewerScreen(eventId: (e['labeledReplay'] as Map)['id'] as String))),
                        icon: const Icon(Icons.history), label: Text('Watch labeled replay · ${(e['labeledReplay'] as Map)['label']['text']}')),
                    ],
                  ],
                  gap(),
                  const InfoNote('Public chat is off for this broadcast.'),
                  TextButton(onPressed: reload, child: const Text('Refresh status')),
                ]),
              )),
            ]);
          },
        ),
      ),
    );
  }
}

class _TimeBox extends StatelessWidget {
  const _TimeBox(this.label, this.value);
  final String label, value;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: AB.sand, borderRadius: BorderRadius.circular(12)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(label, style: const TextStyle(color: AB.muted, fontSize: 11)), Text(value, style: const TextStyle(fontWeight: FontWeight.w600))]),
      );
}
