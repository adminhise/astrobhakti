// Home (Figma "2.1 Home"): default deity, compact switcher, daily prayer, routines, honest live status,
// today's original content, and a service area kept apart from editorial recommendations.
import 'package:flutter/material.dart';
import '../api.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets.dart';
import 'live.dart';
import 'pooja.dart';
import 'player.dart';
import 'explore.dart';

/// Short daily prayers per deity (reviewed source text + transliteration + our commentary).
const dailyPrayer = <String, (String, String, String)>{
  'shiva': ('ॐ नमः शिवाय', 'Om Namah Shivaya', 'I bow to Shiva, the auspicious one.'),
  'ganesha': ('ॐ गं गणपतये नमः', 'Om Gam Ganapataye Namah', 'Salutations to Ganapati, remover of obstacles.'),
  'krishna': ('हरे कृष्ण हरे कृष्ण', 'Hare Krishna Hare Krishna', 'A call to Krishna with love.'),
  'rama': ('श्री राम जय राम जय जय राम', 'Shri Ram Jai Ram Jai Jai Ram', 'Victory to Rama.'),
  'hanuman': ('ॐ हं हनुमते नमः', 'Om Ham Hanumate Namah', 'Salutations to Hanuman.'),
  'durga': ('ॐ दुं दुर्गायै नमः', 'Om Dum Durgayai Namah', 'Salutations to Durga, the protector.'),
  'lakshmi': ('ॐ श्रीं महालक्ष्म्यै नमः', 'Om Shreem Mahalakshmyai Namah', 'Salutations to Mahalakshmi.'),
  'saraswati': ('ॐ ऐं सरस्वत्यै नमः', 'Om Aim Saraswatyai Namah', 'Salutations to Saraswati, giver of learning.'),
  'vishnu': ('ॐ नमो नारायणाय', 'Om Namo Narayanaya', 'I bow to Narayana.'),
  'surya': ('ॐ सूर्याय नमः', 'Om Suryaya Namah', 'Salutations to the Sun.'),
};

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.onTab});
  final void Function(int) onTab;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final s = app.s;
    final d = app.defaultDeity ?? 'ganesha';
    final prayer = dailyPrayer[d]!;
    final colors = deityColors[d]!;

    return ListView(padding: const EdgeInsets.only(bottom: 24), children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 12, 0),
        child: Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(MaterialLocalizations.of(context).formatFullDate(DateTime.now()), style: const TextStyle(color: AB.muted, fontSize: 13)),
            Text('${s.t('namaste')}${app.userName != null ? ', ${app.userName}' : ''}', style: AB.display(26)),
          ])),
          IconButton(tooltip: 'Search', onPressed: () => onTab(1), icon: const Icon(Icons.search)),
          IconButton(tooltip: 'Notifications', onPressed: () {}, icon: const Icon(Icons.notifications_none)),
        ]),
      ),
      // Compact switcher for the other selected deities.
      SizedBox(
        height: 56,
        child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.fromLTRB(20, 12, 20, 0), children: [
          for (final id in app.deities)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                avatar: DeityDisc(id, size: 24),
                label: Text(deityNames[id]!),
                selected: id == d,
                showCheckmark: false,
                labelStyle: TextStyle(color: id == d ? Colors.white : AB.text2),
                onSelected: (_) => app.setDefault(id),
              ),
            ),
        ]),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(24), gradient: LinearGradient(colors: [colors[1], Color.lerp(colors[1], Colors.black, 0.35)!])),
          child: Column(children: [
            Row(children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${s.t('todaysPrayer')} · ${deityNames[d]!.toUpperCase()}', style: const TextStyle(color: Colors.white70, fontSize: 11, letterSpacing: 0.4)),
                gap(6),
                Text(prayer.$1, style: AB.sacred(24, color: Colors.white)),
                Text(prayer.$2, style: const TextStyle(color: Colors.white)),
                gap(4),
                Text('“${prayer.$3}”', style: const TextStyle(color: Colors.white70, fontSize: 13)),
              ])),
              DeityDisc(d, size: 96),
            ]),
            gap(14),
            FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: AB.maroon),
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => RoutineScreen(deity: d, minutes: 10))),
              icon: const Icon(Icons.play_arrow),
              label: Text(s.t('startDevotion')),
            ),
          ]),
        ),
      ),
      SectionHeader(s.t('dailyRoutine')),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Row(children: [
          for (final (m, label) in [(5, 'Invocation + mantra'), (10, 'Mantra, bhajan, reflection'), (20, 'Full guided practice')])
            Expanded(child: Padding(
              padding: EdgeInsets.only(right: m == 20 ? 0 : 10),
              child: Card(child: InkWell(
                borderRadius: BorderRadius.circular(16),
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => RoutineScreen(deity: d, minutes: m))),
                child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text.rich(TextSpan(children: [TextSpan(text: '$m', style: AB.display(26)), const TextSpan(text: ' min', style: TextStyle(color: AB.text2))])),
                  Text(label, style: const TextStyle(color: AB.text2, fontSize: 12)),
                ])),
              )),
            )),
        ]),
      ),
      Padding(padding: const EdgeInsets.fromLTRB(20, 8, 20, 0), child: Text(s.t('routinePrivate'), style: const TextStyle(color: AB.text2, fontSize: 12))),
      SectionHeader(s.t('liveDarshan'), action: 'All live', onAction: () => onTab(2)),
      Loader<List>(
        load: () async {
          // Prefer what is live or next; recordings come last.
          final list = ((await app.api.get('/events?deity=$d')) as List).cast<Map>();
          int rank(Map e) => e['status'] == 'live' || e['status'] == 'interrupted' ? 0 : e['type'] == 'recorded' ? 2 : 1;
          list.sort((a, b) => rank(a).compareTo(rank(b)));
          return list;
        },
        builder: (c, events, _) => events.isEmpty
            ? const Padding(padding: EdgeInsets.symmetric(horizontal: 20), child: InfoNote('No live events for this deity right now. Explore the full schedule in Live.'))
            : Padding(padding: const EdgeInsets.symmetric(horizontal: 20), child: EventCard(event: events.first as Map)),
      ),
      SectionHeader(s.t('todayForYou'), action: 'Explore', onAction: () => onTab(1)),
      Loader<List>(
        load: () async => (await app.api.get('/content?deity=$d')) as List,
        builder: (c, items, _) => SizedBox(
          height: 210,
          child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 20), children: [
            for (final i in items.take(6)) Padding(padding: const EdgeInsets.only(right: 12), child: ContentTile(item: i as Map)),
          ]),
        ),
      ),
      gap(20),
      // Service area: clearly labeled and separate from editorial recommendations.
      Container(
        color: AB.sand,
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(s.t('services'), style: const TextStyle(color: AB.muted, fontSize: 11, letterSpacing: 0.4)),
          Row(children: [
            Expanded(child: Text(s.t('bookPooja'), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600))),
            TextButton(onPressed: () => onTab(3), child: const Text('All services', style: TextStyle(color: AB.saffronDark))),
          ]),
          gap(8),
          Loader<List>(
            load: () async => (await app.api.get('/services?deity=$d')) as List,
            builder: (c, svcs, _) => Column(children: [
              for (final sv in svcs.where((x) => (x as Map)['quoteOnly'] != true).take(3))
                Padding(padding: const EdgeInsets.only(bottom: 10), child: ServiceTile(service: sv as Map)),
            ]),
          ),
          Text(s.t('serviceNote'), style: const TextStyle(color: AB.text2, fontSize: 12)),
        ]),
      ),
    ]);
  }
}

class ContentTile extends StatelessWidget {
  const ContentTile({super.key, required this.item});
  final Map item;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final deity = (item['deityId'] ?? 'ganesha') as String;
    final colors = deityColors[deity] ?? [AB.saffron, AB.maroon];
    final icon = switch (item['format']) { 'audio' => Icons.music_note, 'video' => Icons.play_circle_outline, 'practice' => Icons.self_improvement, _ => Icons.menu_book };
    return SizedBox(
      width: 160,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () {
          if (item['format'] == 'audio' && item['locked'] != true) {
            app.play(NowPlaying(id: item['id'], title: item['title'], subtitle: item['credits'] ?? 'AstroBhakti Originals', deity: deity));
          } else {
            Navigator.push(context, MaterialPageRoute(builder: (_) => ContentScreen(id: item['id'] as String)));
          }
        },
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            height: 120, padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), gradient: LinearGradient(colors: colors)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Text(((item['kind'] ?? '') as String).toUpperCase(), style: const TextStyle(color: Colors.white70, fontSize: 10, letterSpacing: 0.4)),
                const Spacer(),
                if (item['tier'] == 'premium') const Pill('Premium', tone: BadgeTone.gold),
              ]),
              const Spacer(),
              Icon(item['locked'] == true ? Icons.lock_outline : icon, color: Colors.white),
            ]),
          ),
          gap(8),
          Text(item['title'] as String, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
          Text('${item['format']} · ${((item['durationSec'] ?? 0) as num) ~/ 60} min', style: const TextStyle(color: AB.text2, fontSize: 12)),
        ]),
      ),
    );
  }
}

class ServiceTile extends StatelessWidget {
  const ServiceTile({super.key, required this.service});
  final Map service;

  @override
  Widget build(BuildContext context) {
    final icon = switch (service['format']) { 'home_visit' => Icons.home_outlined, 'group_live' => Icons.groups_outlined, 'temple_on_behalf' => Icons.place_outlined, 'guided_home' => Icons.headphones, _ => Icons.videocam_outlined };
    return Card(child: ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      leading: CircleAvatar(backgroundColor: AB.saffronSoft, child: Icon(icon, color: AB.saffronDark)),
      title: Text(service['name'] as String, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text('${service['durationMin']}–${service['durationMax']} min'),
      trailing: service['fromPrice'] == null ? const Text('Quote') : Text(inr(service['fromPrice'] as num), style: const TextStyle(color: AB.maroon, fontWeight: FontWeight.w600)),
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ServiceDetailScreen(serviceId: service['id'] as String))),
    ));
  }
}
