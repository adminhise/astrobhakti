import 'package:flutter/material.dart';
import 'state.dart';
import 'theme.dart';

const deityNamesHi = <String, String>{
  'ganesha': 'गणेश', 'shiva': 'शिव', 'krishna': 'कृष्ण', 'rama': 'राम', 'hanuman': 'हनुमान',
  'durga': 'दुर्गा', 'lakshmi': 'लक्ष्मी', 'saraswati': 'सरस्वती', 'vishnu': 'विष्णु', 'surya': 'सूर्य',
};
const deityNames = <String, String>{
  'ganesha': 'Ganesha', 'shiva': 'Shiva', 'krishna': 'Krishna', 'rama': 'Rama', 'hanuman': 'Hanuman',
  'durga': 'Durga', 'lakshmi': 'Lakshmi', 'saraswati': 'Saraswati', 'vishnu': 'Vishnu', 'surya': 'Surya',
};

/// Placeholder deity artwork: gradient disc with concentric rings and the Devanagari name.
class DeityDisc extends StatelessWidget {
  const DeityDisc(this.id, {super.key, this.size = 84, this.selected = false});
  final String id;
  final double size;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final colors = deityColors[id] ?? [AB.saffron, AB.maroon];
    final light = id == 'saraswati';
    final name = deityNamesHi[id] ?? id;
    return Semantics(
      label: deityNames[id] ?? id,
      child: Container(
        width: size, height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: colors),
          border: selected ? Border.all(color: AB.saffron, width: 3) : null,
        ),
        child: Stack(alignment: Alignment.center, children: [
          for (final f in [0.93, 0.7])
            Container(width: size * f, height: size * f, decoration: BoxDecoration(shape: BoxShape.circle,
              border: Border.all(color: Colors.white.withValues(alpha: 0.3)))),
          Text(name, style: AB.sacred(size * (name.length > 5 ? 0.17 : 0.22), color: light ? AB.maroon : Colors.white)),
        ]),
      ),
    );
  }
}

enum BadgeTone { ok, warn, live, info, replay, muted, gold }

class Pill extends StatelessWidget {
  const Pill(this.label, {super.key, this.tone = BadgeTone.muted, this.dot = false});
  final String label;
  final BadgeTone tone;
  final bool dot;

  static const _c = {
    BadgeTone.ok: (AB.okSoft, AB.ok), BadgeTone.warn: (AB.warnSoft, AB.warn), BadgeTone.live: (AB.liveSoft, AB.live),
    BadgeTone.info: (AB.infoSoft, AB.info), BadgeTone.replay: (AB.replaySoft, AB.replay), BadgeTone.muted: (AB.sand, AB.text2),
    BadgeTone.gold: (AB.goldSoft, AB.gold),
  };

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = _c[tone]!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (dot) ...[Container(width: 6, height: 6, decoration: BoxDecoration(color: fg, shape: BoxShape.circle)), const SizedBox(width: 5)],
        Text(label, style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w500, letterSpacing: 0.3)),
      ]),
    );
  }
}

/// Maps the backend's viewer label to a badge. A recording is never shown under a Live label.
Pill broadcastPill(Map label) {
  final badge = label['badge'] as String;
  final text = label['text'] as String;
  return switch (badge) {
    'live' => Pill(text, tone: BadgeTone.live, dot: true),
    'interrupted' => Pill(text, tone: BadgeTone.warn, dot: true),
    'recorded' => Pill(text, tone: BadgeTone.replay),
    'scheduled' => Pill(text, tone: BadgeTone.info),
    _ => Pill(text),
  };
}

class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.action, this.onAction});
  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 10),
        child: Row(children: [
          Expanded(child: Text(title, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600))),
          if (action != null) TextButton(onPressed: onAction, child: Text(action!, style: const TextStyle(color: AB.saffronDark))),
        ]),
      );
}

class InfoNote extends StatelessWidget {
  const InfoNote(this.text, {super.key, this.icon = Icons.info_outline, this.color = AB.sand, this.fg = AB.text2});
  final String text;
  final IconData icon;
  final Color color, fg;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(12)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 18, color: fg), const SizedBox(width: 10),
          Expanded(child: Text(text, style: TextStyle(color: fg, fontSize: 13))),
        ]),
      );
}

/// Persistent audio player above the tab bar so listening continues while browsing.
class MiniPlayer extends StatelessWidget {
  const MiniPlayer({super.key, required this.onOpen});
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final np = app.nowPlaying;
    if (np == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 6),
      child: Material(
        color: AB.ink, borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16), onTap: onOpen,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            child: Row(children: [
              DeityDisc(np.deity, size: 40),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(np.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                Text(np.subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 12)),
              ])),
              IconButton.filled(
                style: IconButton.styleFrom(backgroundColor: AB.saffron),
                tooltip: np.playing ? 'Pause' : 'Play',
                onPressed: () { np.playing = !np.playing; app.play(np); },
                icon: Icon(np.playing ? Icons.pause : Icons.play_arrow, color: Colors.white),
              ),
              IconButton(tooltip: 'Close player', onPressed: app.stop, icon: const Icon(Icons.close, color: AB.muted)),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Stateless loader for API data with calm loading and error states.
class Loader<T> extends StatefulWidget {
  const Loader({super.key, required this.load, required this.builder});
  final Future<T> Function() load;
  final Widget Function(BuildContext, T, VoidCallback reload) builder;
  @override
  State<Loader<T>> createState() => _LoaderState<T>();
}

class _LoaderState<T> extends State<Loader<T>> {
  late Future<T> _f = widget.load();
  void _reload() => setState(() => _f = widget.load());
  @override
  Widget build(BuildContext context) => FutureBuilder<T>(
        future: _f,
        builder: (c, s) {
          if (s.hasError) {
            return Center(child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.wifi_off, color: AB.muted), const SizedBox(height: 8),
              Text('Could not load. ${s.error}', textAlign: TextAlign.center, style: const TextStyle(color: AB.text2)),
              TextButton(onPressed: _reload, child: const Text('Try again')),
            ])));
          }
          if (!s.hasData) return const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator(color: AB.saffron)));
          return widget.builder(c, s.data as T, _reload);
        },
      );
}

Widget gap([double h = 12]) => SizedBox(height: h);
