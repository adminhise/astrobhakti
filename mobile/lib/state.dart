import 'dart:convert';
import 'dart:ui' show PlatformDispatcher;
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api.dart';
import 'strings.dart';

/// App-wide state. Guests keep their deity choices on the device; they sync to the account after
/// sign-in without touching saved content (proposal §2 "First visit", §12 check 1).
class AppState extends ChangeNotifier {
  AppState(this.api);
  final Api api;
  SharedPreferences? _prefs;

  String language = 'hi';
  List<String> deities = [];
  String? defaultDeity;
  bool onboarded = false;
  String? userName;
  double textScale = 1.0;
  bool reducedMotion = true;
  bool highContrast = false;
  bool lowBandwidth = false;
  NowPlaying? nowPlaying;

  S get s => S(language);
  bool get signedIn => api.token != null;

  Future<void> load() async {
    try {
      _prefs = await SharedPreferences.getInstance();
      final p = _prefs!;
      // First launch follows the phone's language: Hindi phones start in Hindi, everything else in English.
      language = p.getString('lang') ?? (PlatformDispatcher.instance.locale.languageCode == 'hi' ? 'hi' : 'en');
      deities = p.getStringList('deities') ?? [];
      defaultDeity = p.getString('defaultDeity');
      onboarded = p.getBool('onboarded') ?? false;
      api.token = p.getString('token');
      userName = p.getString('name');
      textScale = p.getDouble('textScale') ?? 1.0;
      reducedMotion = p.getBool('reducedMotion') ?? true;
      highContrast = p.getBool('highContrast') ?? false;
      lowBandwidth = p.getBool('lowBandwidth') ?? false;
    } catch (_) {
      // Storage can be unavailable; the app still works for this session.
    }
    notifyListeners();
  }

  void _save() {
    final p = _prefs;
    if (p == null) return;
    p.setString('lang', language);
    p.setStringList('deities', deities);
    if (defaultDeity != null) p.setString('defaultDeity', defaultDeity!);
    p.setBool('onboarded', onboarded);
    p.setDouble('textScale', textScale);
    p.setBool('reducedMotion', reducedMotion);
    p.setBool('highContrast', highContrast);
    p.setBool('lowBandwidth', lowBandwidth);
    if (api.token != null) {
      p.setString('token', api.token!);
    } else {
      p.remove('token');
    }
    if (userName != null) p.setString('name', userName!);
  }

  void setLanguage(String l) { language = l; _save(); notifyListeners(); }

  /// Returns false when a sixth deity is chosen, so the UI can offer a replacement.
  bool toggleDeity(String id) {
    if (deities.contains(id)) {
      deities = [...deities]..remove(id);
      if (defaultDeity == id) defaultDeity = deities.isEmpty ? null : deities.first;
    } else {
      if (deities.length >= 5) return false;
      deities = [...deities, id];
      defaultDeity ??= id;
    }
    _save(); notifyListeners();
    return true;
  }

  void replaceDeity(String remove, String add) {
    deities = deities.map((d) => d == remove ? add : d).toList();
    if (defaultDeity == remove) defaultDeity = add;
    _save(); _syncDeities(); notifyListeners();
  }

  void setDefault(String id) { defaultDeity = id; _save(); _syncDeities(); notifyListeners(); }

  void reorder(int oldIndex, int newIndex) {
    final list = [...deities];
    final item = list.removeAt(oldIndex);
    list.insert(newIndex, item); // index already adjusted by onReorderItem
    deities = list; _save(); _syncDeities(); notifyListeners();
  }

  void finishOnboarding() { onboarded = true; _save(); _syncDeities(); notifyListeners(); }

  void setAccessibility({double? scale, bool? motion, bool? contrast, bool? bandwidth}) {
    textScale = scale ?? textScale; reducedMotion = motion ?? reducedMotion;
    highContrast = contrast ?? highContrast; lowBandwidth = bandwidth ?? lowBandwidth;
    _save(); notifyListeners();
  }

  Future<Map<String, dynamic>> requestOtp(String phone) async => Map<String, dynamic>.from(await api.post('/auth/otp', {'phone': phone}));

  Future<void> verifyOtp(String phone, String code, String? name) async {
    final r = await api.post('/auth/verify', {'phone': phone, 'code': code, 'name': name});
    api.token = r['token'] as String;
    userName = (r['user'] as Map)['name'] as String? ?? name;
    _save();
    await _syncDeities();
    notifyListeners();
  }

  void signOut() { api.token = null; _prefs?.remove('token'); notifyListeners(); }

  Future<void> _syncDeities() async {
    if (!signedIn || deities.isEmpty || defaultDeity == null) return;
    try {
      await api.put('/me/deities', {'deities': deities, 'defaultDeity': defaultDeity});
    } catch (_) {/* retried on next change */}
  }

  void play(NowPlaying item) { nowPlaying = item; notifyListeners(); }
  void stop() { nowPlaying = null; notifyListeners(); }

  String encode() => jsonEncode({'deities': deities, 'default': defaultDeity});
}

class NowPlaying {
  NowPlaying({required this.id, required this.title, required this.subtitle, required this.deity});
  final String id, title, subtitle, deity;
  bool playing = true;
}

/// Makes [AppState] available to the widget tree.
class AppScope extends InheritedNotifier<AppState> {
  const AppScope({super.key, required AppState state, required super.child}) : super(notifier: state);
  static AppState of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<AppScope>()!.notifier!;
}
