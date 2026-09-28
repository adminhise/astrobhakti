import 'package:flutter/material.dart';
import 'api.dart';
import 'state.dart';
import 'theme.dart';
import 'widgets.dart';
import 'screens/onboarding.dart';
import 'screens/home.dart';
import 'screens/explore.dart';
import 'screens/live.dart';
import 'screens/pooja.dart';
import 'screens/my_bhakti.dart';
import 'screens/player.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final state = AppState(Api());
  await state.load();
  runApp(AstroBhaktiApp(state: state));
}

class AstroBhaktiApp extends StatelessWidget {
  const AstroBhaktiApp({super.key, required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) => AppScope(
        state: state,
        child: ListenableBuilder(
          listenable: state,
          builder: (context, _) => MaterialApp(
            title: 'AstroBhakti',
            debugShowCheckedModeBanner: false,
            theme: buildTheme(textScale: state.textScale, highContrast: state.highContrast),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(
                textScaler: TextScaler.linear(state.textScale),
                disableAnimations: state.reducedMotion,
              ),
              child: child!,
            ),
            home: state.onboarded ? const HomeShell() : const WelcomeScreen(),
          ),
        ),
      );
}

/// Five main tabs (proposal §2 "Navigation") with the persistent mini player above them.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context).s;
    final pages = [
      HomeScreen(onTab: (i) => setState(() => _tab = i)),
      const ExploreScreen(),
      const LiveScreen(),
      const PoojaScreen(),
      const MyBhaktiScreen(),
    ];
    return Scaffold(
      body: SafeArea(bottom: false, child: IndexedStack(index: _tab, children: pages)),
      bottomNavigationBar: Column(mainAxisSize: MainAxisSize.min, children: [
        MiniPlayer(onOpen: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PlayerScreen()))),
        NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: (i) => setState(() => _tab = i),
          destinations: [
            NavigationDestination(icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home, color: AB.saffronDark), label: s.t('home')),
            NavigationDestination(icon: const Icon(Icons.explore_outlined), selectedIcon: const Icon(Icons.explore, color: AB.saffronDark), label: s.t('explore')),
            NavigationDestination(icon: const Icon(Icons.sensors_outlined), selectedIcon: const Icon(Icons.sensors, color: AB.saffronDark), label: s.t('live')),
            NavigationDestination(icon: const Icon(Icons.local_fire_department_outlined), selectedIcon: const Icon(Icons.local_fire_department, color: AB.saffronDark), label: s.t('pooja')),
            NavigationDestination(icon: const Icon(Icons.favorite_border), selectedIcon: const Icon(Icons.favorite, color: AB.saffronDark), label: s.t('myBhakti')),
          ],
        ),
      ]),
    );
  }
}
