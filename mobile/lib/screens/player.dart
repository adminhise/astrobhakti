// Daily routine player and full audio player (Figma "2.2"–"2.5").
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:just_audio/just_audio.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets.dart';
import 'home.dart';

class _Step {
  const _Step(this.name, this.kind, this.seconds);
  final String name, kind;
  final int seconds;
}

List<_Step> _stepsFor(int minutes) => switch (minutes) {
      5 => const [_Step('Invocation', 'invocation', 60), _Step('Mantra', 'mantra', 240)],
      20 => const [_Step('Invocation', 'invocation', 120), _Step('Mantra', 'mantra', 360), _Step('Bhajan', 'bhajan', 300), _Step('Story', 'story', 300), _Step('Reflection', 'reflection', 120)],
      _ => const [_Step('Invocation', 'invocation', 60), _Step('Mantra', 'mantra', 180), _Step('Bhajan', 'bhajan', 240), _Step('Reflection', 'reflection', 120)],
    };

/// A guided routine: readable text, transliteration, meaning, audio controls, skip, save.
/// Completion is private and optional; there are no streaks.
class RoutineScreen extends StatefulWidget {
  const RoutineScreen({super.key, required this.deity, required this.minutes});
  final String deity;
  final int minutes;
  @override
  State<RoutineScreen> createState() => _RoutineScreenState();
}

class _RoutineScreenState extends State<RoutineScreen> {
  late final steps = _stepsFor(widget.minutes);
  int _i = 0, _elapsed = 0, _count = 0;
  bool _playing = true;
  double _speed = 1.0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!_playing || !mounted) return;
      setState(() {
        _elapsed += _speed.round().clamp(1, 2);
        if (_elapsed >= steps[_i].seconds) _next();
      });
    });
  }

  @override
  void dispose() { _timer?.cancel(); super.dispose(); }

  void _next() {
    if (_i < steps.length - 1) { _i++; _elapsed = 0; }
    else { _timer?.cancel(); Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => RoutineCompleteScreen(deity: widget.deity, minutes: widget.minutes))); }
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final p = dailyPrayer[widget.deity]!;
    final step = steps[_i];
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(tooltip: 'Close', icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context)),
        title: Column(children: [Text('${widget.minutes} minute routine'), Text(deityNames[widget.deity]!, style: const TextStyle(fontSize: 12, color: AB.text2))]),
        centerTitle: true,
        actions: [IconButton(tooltip: 'Text size', icon: const Icon(Icons.text_fields), onPressed: () => app.setAccessibility(scale: app.textScale >= 1.3 ? 1.0 : app.textScale + 0.15))],
      ),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        Row(children: [
          for (var k = 0; k < steps.length; k++)
            Expanded(child: Container(margin: const EdgeInsets.only(right: 6), height: 4, decoration: BoxDecoration(color: k <= _i ? AB.saffron : AB.border, borderRadius: BorderRadius.circular(2)))),
        ]),
        gap(6),
        Text('Step ${_i + 1} of ${steps.length} · ${step.name}', style: const TextStyle(color: AB.saffronDark, fontWeight: FontWeight.w600)),
        gap(16),
        Card(child: Padding(padding: const EdgeInsets.all(22), child: Column(children: [
          const Pill('Reviewed practice', tone: BadgeTone.ok),
          gap(12),
          DeityDisc(widget.deity, size: 72),
          gap(12),
          Text(step.kind == 'mantra' || step.kind == 'invocation' ? p.$1 : _stepText(step.kind), textAlign: TextAlign.center, style: step.kind == 'mantra' || step.kind == 'invocation' ? AB.sacred(24, color: AB.maroon) : const TextStyle(fontSize: 17)),
          if (step.kind == 'mantra' || step.kind == 'invocation') Text(p.$2, style: const TextStyle(fontWeight: FontWeight.w600)),
          const Divider(height: 28),
          const Align(alignment: Alignment.centerLeft, child: Text('MEANING · OUR COMMENTARY', style: TextStyle(fontSize: 11, color: AB.muted, letterSpacing: 0.4))),
          gap(4),
          Align(alignment: Alignment.centerLeft, child: Text('${p.$3} Recite slowly with the breath; there is no required count.', style: const TextStyle(color: AB.text2))),
        ]))),
        if (step.kind == 'mantra') ...[
          gap(),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: AB.saffronSoft, borderRadius: BorderRadius.circular(18)),
            child: Row(children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Optional private count', style: TextStyle(color: AB.saffronDark, fontSize: 12)),
                Text('$_count / 108', style: AB.display(20, color: AB.maroon)),
              ])),
              IconButton.filled(
                style: IconButton.styleFrom(backgroundColor: AB.saffron, minimumSize: const Size(60, 60)),
                tooltip: 'Count one',
                onPressed: () {
                  setState(() => _count++);
                  if (app.signedIn) app.api.post('/me/mantra', {'mantra': p.$2}).catchError((_) => null);
                },
                icon: const Icon(Icons.add, color: Colors.white),
              ),
            ]),
          ),
        ],
        gap(20),
        LinearProgressIndicator(value: _elapsed / step.seconds, color: AB.saffron, backgroundColor: AB.border, minHeight: 4, borderRadius: BorderRadius.circular(2)),
        gap(12),
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          OutlinedButton(onPressed: () => setState(() => _speed = _speed == 1.0 ? 1.25 : _speed == 1.25 ? 0.75 : 1.0), child: Text('${_speed}x')),
          IconButton(tooltip: 'Previous', iconSize: 32, onPressed: _i == 0 ? null : () => setState(() { _i--; _elapsed = 0; }), icon: const Icon(Icons.skip_previous)),
          IconButton.filled(style: IconButton.styleFrom(backgroundColor: AB.saffron, minimumSize: const Size(64, 64)), tooltip: _playing ? 'Pause' : 'Play',
            onPressed: () => setState(() => _playing = !_playing), icon: Icon(_playing ? Icons.pause : Icons.play_arrow, color: Colors.white, size: 30)),
          IconButton(tooltip: 'Next', iconSize: 32, onPressed: () => setState(_next), icon: const Icon(Icons.skip_next)),
          IconButton(tooltip: 'Repeat', onPressed: () => setState(() => _elapsed = 0), icon: const Icon(Icons.repeat)),
        ]),
        gap(12),
        Row(children: [
          Expanded(child: OutlinedButton(onPressed: () => setState(_next), child: const Text('Skip step'))),
          const SizedBox(width: 10),
          Expanded(child: FilledButton.tonal(onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Routine saved to My Bhakti'))), child: const Text('Save routine'))),
        ]),
      ]),
    );
  }

  String _stepText(String kind) => switch (kind) {
        'bhajan' => 'An original AstroBhakti bhajan plays now. Listen, or sing along with the lyrics.',
        'story' => 'A short reviewed story for today.',
        _ => 'Sit quietly for a moment. What would you like to carry into your day?',
      };
}

class RoutineCompleteScreen extends StatelessWidget {
  const RoutineCompleteScreen({super.key, required this.deity, required this.minutes});
  final String deity;
  final int minutes;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final note = TextEditingController();
    return Scaffold(
      body: SafeArea(child: ListView(padding: const EdgeInsets.all(24), children: [
        gap(40),
        const Center(child: CircleAvatar(radius: 60, backgroundColor: AB.goldSoft, child: Icon(Icons.local_fire_department_outlined, size: 48, color: AB.saffronDark))),
        gap(20),
        Text('Your routine is complete', textAlign: TextAlign.center, style: AB.display(26)),
        gap(6),
        Text('$minutes minutes with ${deityNames[deity]}. This stays private to you; nothing is shared or ranked.', textAlign: TextAlign.center, style: const TextStyle(color: AB.text2)),
        gap(24),
        Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Row(children: [Icon(Icons.lock_outline, size: 16, color: AB.muted), SizedBox(width: 8), Text('Private reflection (optional)', style: TextStyle(fontWeight: FontWeight.w600))]),
          gap(10),
          TextField(controller: note, maxLines: 3, decoration: const InputDecoration(hintText: 'Write a few words for yourself…')),
          gap(8),
          const Text('Notes are never posted publicly or used for recommendations unless you choose.', style: TextStyle(color: AB.muted, fontSize: 12)),
        ]))),
        gap(24),
        FilledButton(onPressed: () {
          if (note.text.trim().isNotEmpty && app.signedIn) app.api.post('/me/notes', {'body': note.text}).catchError((_) => null);
          Navigator.pop(context);
        }, child: const Text('Back to Home')),
      ])),
    );
  }
}

/// Full audio player. Uses just_audio when the item has a media URL; background playback and lock
/// screen controls come from the platform audio session configured in the native projects.
class PlayerScreen extends StatefulWidget {
  const PlayerScreen({super.key, this.mediaUrl});
  final String? mediaUrl;
  @override
  State<PlayerScreen> createState() => _PlayerScreenState();
}

class _PlayerScreenState extends State<PlayerScreen> {
  AudioPlayer? _player;
  int? _sleepMin;

  @override
  void initState() {
    super.initState();
    if (widget.mediaUrl != null) {
      _player = AudioPlayer();
      _player!.setUrl(widget.mediaUrl!).then((_) => _player!.play()).catchError((_) => null);
    }
  }

  @override
  void dispose() { _player?.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final np = app.nowPlaying;
    if (np == null) return const Scaffold(body: Center(child: Text('Nothing playing')));
    final colors = deityColors[np.deity]!;
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [colors[1], AB.ink])),
        child: SafeArea(child: Padding(padding: const EdgeInsets.all(20), child: Column(children: [
          Row(children: [
            IconButton(tooltip: 'Close', onPressed: () => Navigator.pop(context), icon: const Icon(Icons.keyboard_arrow_down, color: Colors.white)),
            const Expanded(child: Column(children: [Text('PLAYING FROM', style: TextStyle(color: Colors.white60, fontSize: 11)), Text('Your devotion', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600))])),
            const SizedBox(width: 48),
          ]),
          const Spacer(),
          Container(width: 280, height: 280, decoration: BoxDecoration(borderRadius: BorderRadius.circular(28), gradient: LinearGradient(colors: colors)), child: Center(child: DeityDisc(np.deity, size: 200))),
          const Spacer(),
          Align(alignment: Alignment.centerLeft, child: Text(np.title, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w600))),
          Align(alignment: Alignment.centerLeft, child: Text(np.subtitle, style: const TextStyle(color: Colors.white60))),
          gap(16),
          const LinearProgressIndicator(value: 0.55, color: AB.saffron, backgroundColor: Colors.white24),
          gap(16),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            IconButton(tooltip: 'Repeat', onPressed: () {}, icon: const Icon(Icons.repeat, color: Colors.white70)),
            IconButton(tooltip: 'Previous', iconSize: 36, onPressed: () {}, icon: const Icon(Icons.skip_previous, color: Colors.white)),
            IconButton.filled(style: IconButton.styleFrom(backgroundColor: Colors.white, minimumSize: const Size(72, 72)), tooltip: np.playing ? 'Pause' : 'Play',
              onPressed: () { np.playing = !np.playing; np.playing ? _player?.play() : _player?.pause(); app.play(np); },
              icon: Icon(np.playing ? Icons.pause : Icons.play_arrow, color: AB.maroon, size: 32)),
            IconButton(tooltip: 'Next', iconSize: 36, onPressed: () {}, icon: const Icon(Icons.skip_next, color: Colors.white)),
            IconButton(tooltip: 'Queue', onPressed: () {}, icon: const Icon(Icons.queue_music, color: Colors.white70)),
          ]),
          gap(12),
          Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: [
            TextButton.icon(onPressed: () => setState(() => _sleepMin = _sleepMin == null ? 15 : _sleepMin == 15 ? 30 : null),
              icon: const Icon(Icons.bedtime_outlined, color: Colors.white70), label: Text(_sleepMin == null ? 'Sleep' : 'Sleep ${_sleepMin}m', style: const TextStyle(color: Colors.white70))),
            TextButton.icon(onPressed: () {}, icon: const Icon(Icons.download_outlined, color: Colors.white70), label: const Text('Offline', style: TextStyle(color: Colors.white70))),
            TextButton.icon(onPressed: () {}, icon: const Icon(Icons.speed, color: Colors.white70), label: const Text('1.0×', style: TextStyle(color: Colors.white70))),
          ]),
        ]))),
      ),
    );
  }
}
