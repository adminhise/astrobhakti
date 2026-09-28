// Explore and the devotional library (Figma page "04"): full catalogue, filters, deity pages, reader, premium.
import 'package:flutter/material.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets.dart';

class ExploreScreen extends StatefulWidget {
  const ExploreScreen({super.key});
  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> {
  String _format = '';
  String _q = '';
  int _maxMin = 0;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final query = [if (_format.isNotEmpty) 'format=$_format', if (_q.isNotEmpty) 'q=${Uri.encodeQueryComponent(_q)}', if (_maxMin > 0) 'maxMinutes=$_maxMin', 'language=${app.language}'].join('&');
    return ListView(padding: const EdgeInsets.only(bottom: 24), children: [
      Padding(padding: const EdgeInsets.fromLTRB(20, 12, 20, 12), child: Text('Explore', style: AB.display(26))),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: TextField(
          decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search prayers, bhajans, stories…'),
          onSubmitted: (v) => setState(() => _q = v.trim()),
        ),
      ),
      SizedBox(height: 52, child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.fromLTRB(20, 10, 20, 0), children: [
        for (final (label, f) in [('All', ''), ('Audio', 'audio'), ('Read', 'text'), ('Video', 'video'), ('Practice', 'practice')])
          Padding(padding: const EdgeInsets.only(right: 8), child: ChoiceChip(label: Text(label), selected: _format == f, labelStyle: TextStyle(color: _format == f ? Colors.white : AB.text2), onSelected: (_) => setState(() => _format = f))),
        FilterChip(label: const Text('Under 10 min'), selected: _maxMin == 10, onSelected: (on) => setState(() => _maxMin = on ? 10 : 0)),
      ])),
      const SectionHeader('All deities'),
      SizedBox(height: 96, child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 20), children: [
        // The full catalogue stays browsable regardless of personal selections.
        for (final d in deityNames.keys)
          Padding(padding: const EdgeInsets.only(right: 12), child: InkWell(
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => DeityScreen(id: d))),
            child: Column(children: [DeityDisc(d, size: 60), gap(4), Text(deityNames[d]!, style: const TextStyle(fontSize: 12, color: AB.text2))]),
          )),
      ])),
      const SectionHeader('Library'),
      Loader<List>(
        key: ValueKey(query),
        load: () async => (await app.api.get('/content?$query')) as List,
        builder: (c, items, _) => items.isEmpty
            ? const Padding(padding: EdgeInsets.all(20), child: InfoNote('Nothing matches yet. Try another filter.'))
            : Column(children: [for (final i in items) _ContentRow(item: i as Map)]),
      ),
    ]);
  }
}

class _ContentRow extends StatelessWidget {
  const _ContentRow({required this.item});
  final Map item;
  @override
  Widget build(BuildContext context) {
    final deity = (item['deityId'] ?? 'ganesha') as String;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
      child: Card(child: ListTile(
        leading: DeityDisc(deity, size: 44),
        title: Text(item['title'] as String, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text('${item['format']} · ${item['kind']}${item['isSourceText'] == true ? ' (source text)' : ''} · ${((item['durationSec'] ?? 0) as num) ~/ 60} min'),
        trailing: item['locked'] == true ? const Pill('Premium', tone: BadgeTone.gold) : const Icon(Icons.chevron_right),
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ContentScreen(id: item['id'] as String))),
      )),
    );
  }
}

class DeityScreen extends StatelessWidget {
  const DeityScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final colors = deityColors[id]!;
    final mine = app.deities.contains(id);
    return Scaffold(
      body: Loader<Map>(
        load: () async => Map.from(await app.api.get('/deities/$id')),
        builder: (c, d, _) => CustomScrollView(slivers: [
          SliverAppBar(
            expandedHeight: 300, pinned: true, foregroundColor: Colors.white, backgroundColor: colors[1],
            flexibleSpace: FlexibleSpaceBar(background: Container(
              decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: colors)),
              child: SafeArea(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                DeityDisc(id, size: 120), gap(10),
                Text(d['name'] as String, style: AB.display(26, color: Colors.white)),
                Text([deityNamesHi[id], ...(d['aliases'] as List)].join(' · '), style: const TextStyle(color: Colors.white70, fontSize: 12)),
                gap(12),
                FilledButton.icon(
                  style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: AB.maroon, minimumSize: const Size(0, 42)),
                  onPressed: () { if (!mine && !app.toggleDeity(id)) { ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('You already have five deities. Replace one in My Bhakti.'))); } },
                  icon: Icon(mine ? Icons.check : Icons.add), label: Text(mine ? 'In my deities' : 'Add to my deities'),
                ),
              ])),
            )),
          ),
          SliverToBoxAdapter(child: Padding(padding: const EdgeInsets.all(20), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if ((d['related'] as List).isNotEmpty) ...[
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: AB.sand, borderRadius: BorderRadius.circular(14)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Related forms and traditions', style: TextStyle(fontWeight: FontWeight.w600)),
                  gap(4),
                  const Text('Discoverable here. Choosing one never silently combines your selections.', style: TextStyle(color: AB.text2, fontSize: 13)),
                  gap(8),
                  Wrap(spacing: 8, children: [for (final r in d['related'] as List) ActionChip(label: Text((r as Map)['name'] as String), onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => DeityScreen(id: r['id'] as String))))]),
                ]),
              ),
              gap(16),
            ],
            Text('Library', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600)),
          ]))),
          SliverToBoxAdapter(child: Loader<List>(
            load: () async => (await app.api.get('/content?deity=$id')) as List,
            builder: (c, items, _) => Column(children: [for (final i in items) _ContentRow(item: i as Map)]),
          )),
        ]),
      ),
    );
  }
}

/// Reader: source verses are visually distinct from our commentary; text size is adjustable.
class ContentScreen extends StatelessWidget {
  const ContentScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(actions: [
        IconButton(tooltip: 'Bigger text', onPressed: () => app.setAccessibility(scale: (app.textScale + 0.1).clamp(0.9, 1.6)), icon: const Icon(Icons.text_increase)),
        IconButton(tooltip: 'Save', onPressed: () async {
          final m = ScaffoldMessenger.of(context);
          if (!app.signedIn) { m.showSnackBar(const SnackBar(content: Text('Sign in from My Bhakti to save across devices'))); return; }
          await app.api.put('/me/saved/$id', {'saved': true});
          m.showSnackBar(const SnackBar(content: Text('Saved')));
        }, icon: const Icon(Icons.bookmark_border)),
      ]),
      body: Loader<Map>(
        load: () async => Map.from(await app.api.get('/content/$id')),
        builder: (c, item, _) {
          final isSource = item['isSourceText'] == true;
          final deity = (item['deityId'] ?? 'ganesha') as String;
          if (app.signedIn) app.api.post('/content/$id/plays', {'completed': false}).catchError((_) => null);
          return ListView(padding: const EdgeInsets.all(20), children: [
            Text(item['title'] as String, style: AB.display(24)),
            gap(4),
            Text('${item['format']} · ${item['language']} · ${item['credits'] ?? ''}', style: const TextStyle(color: AB.text2)),
            gap(16),
            if (item['locked'] == true)
              _PremiumGate(onJoin: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const MembershipScreen())))
            else ...[
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: isSource ? AB.card : AB.sand, borderRadius: BorderRadius.circular(16),
                  border: isSource ? const Border(left: BorderSide(color: AB.maroon, width: 4), top: BorderSide(color: AB.border), right: BorderSide(color: AB.border), bottom: BorderSide(color: AB.border)) : null,
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(isSource ? 'SOURCE TEXT' : 'OUR ${(item['kind'] as String).toUpperCase()} · reviewed', style: TextStyle(fontSize: 11, letterSpacing: 0.4, color: isSource ? AB.maroon : AB.muted)),
                  gap(8),
                  Text((item['body'] ?? 'Audio and video items play in the player.') as String, style: isSource ? AB.sacred(20) : const TextStyle(fontSize: 16)),
                ]),
              ),
              gap(16),
              if (item['format'] == 'audio')
                FilledButton.icon(onPressed: () => app.play(NowPlaying(id: id, title: item['title'], subtitle: item['credits'] ?? '', deity: deity)), icon: const Icon(Icons.play_arrow), label: const Text('Play')),
            ],
          ]);
        },
      ),
    );
  }
}

class _PremiumGate extends StatelessWidget {
  const _PremiumGate({required this.onJoin});
  final VoidCallback onJoin;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), gradient: const LinearGradient(colors: [AB.maroon, AB.gold])),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Pill('Premium', tone: BadgeTone.gold), gap(8),
          Text('Part of the full original catalogue', style: AB.display(20, color: Colors.white)),
          gap(6),
          const Text('Daily devotion stays free. Premium adds the full catalogue, offline collections and longer programs.', style: TextStyle(color: Colors.white70)),
          gap(14),
          FilledButton(style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: AB.maroon), onPressed: onJoin, child: const Text('See membership')),
        ]),
      );
}

class MembershipScreen extends StatefulWidget {
  const MembershipScreen({super.key});
  @override
  State<MembershipScreen> createState() => _MembershipScreenState();
}

class _MembershipScreenState extends State<MembershipScreen> {
  bool _annual = true;
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('AstroBhakti Premium')),
        body: ListView(padding: const EdgeInsets.all(20), children: [
          for (final f in ['Full original catalogue of bhajans, stories and guides', 'Offline collections for travel and low data', 'Longer guided programs', 'Expanded family features later, with separate preferences'])
            ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.check, color: AB.ok), title: Text(f)),
          gap(),
          Row(children: [
            for (final (annual, name, price, sub) in [(false, 'Monthly', '₹149', 'per month · cancel anytime'), (true, 'Annual', '₹999', 'per year · about ₹83 a month')])
              Expanded(child: Padding(padding: EdgeInsets.only(right: annual ? 0 : 10), child: InkWell(
                onTap: () => setState(() => _annual = annual),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: _annual == annual ? AB.saffronSoft : AB.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: _annual == annual ? AB.saffron : AB.border, width: _annual == annual ? 2 : 1)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(name, style: const TextStyle(color: AB.text2)), Text(price, style: AB.display(22, color: AB.maroon)), Text(sub, style: const TextStyle(fontSize: 12, color: AB.text2))]),
                ),
              ))),
          ]),
          gap(20),
          FilledButton(onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Store checkout opens here (Google Play Billing / App Store).'))), child: Text(_annual ? 'Continue with Annual · ₹999' : 'Continue with Monthly · ₹149')),
          gap(8),
          Text('Renews ${_annual ? 'yearly at ₹999' : 'monthly at ₹149'} unless cancelled at least 24 hours before renewal. Manage or cancel in My Bhakti › Membership or your app store.', textAlign: TextAlign.center, style: const TextStyle(color: AB.muted, fontSize: 12)),
        ]),
      );
}
