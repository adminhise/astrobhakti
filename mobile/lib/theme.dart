import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Tokens mirror the Figma "AB Color" variables.
class AB {
  static const saffron = Color(0xFFE2711D);
  static const saffronDark = Color(0xFFB8560F);
  static const saffronSoft = Color(0xFFFCE7D2);
  static const maroon = Color(0xFF6E1F2F);
  static const maroonSoft = Color(0xFFF4E1E3);
  static const gold = Color(0xFFC4952F);
  static const goldSoft = Color(0xFFF6EBCF);
  static const bg = Color(0xFFFFF9F1);
  static const card = Color(0xFFFFFFFF);
  static const sand = Color(0xFFF5EADB);
  static const ink = Color(0xFF241611);
  static const text = Color(0xFF2A1A12);
  static const text2 = Color(0xFF6F5B4E);
  static const muted = Color(0xFF9C8A7D);
  static const border = Color(0xFFE9DCCB);
  static const borderStrong = Color(0xFFCDB9A3);
  static const live = Color(0xFFD8342B);
  static const liveSoft = Color(0xFFFBE3E1);
  static const ok = Color(0xFF2F7D4E);
  static const okSoft = Color(0xFFE2F2E8);
  static const warn = Color(0xFFB7791F);
  static const warnSoft = Color(0xFFFBF0DA);
  static const info = Color(0xFF2E5E9E);
  static const infoSoft = Color(0xFFE3ECF8);
  static const replay = Color(0xFF6B5B95);
  static const replaySoft = Color(0xFFECE8F5);

  static TextStyle display(double size, {Color color = text}) =>
      GoogleFonts.fraunces(fontSize: size, fontWeight: FontWeight.w600, color: color, height: 1.25);
  static TextStyle sacred(double size, {Color color = text}) =>
      GoogleFonts.tiroDevanagariHindi(fontSize: size, color: color, height: 1.55);
}

/// Deity disc palettes (placeholder artwork until commissioned art is reviewed, proposal §7).
const deityColors = <String, List<Color>>{
  'ganesha': [Color(0xFFF6A04D), Color(0xFFC8452B)],
  'shiva': [Color(0xFF6A86B5), Color(0xFF243052)],
  'krishna': [Color(0xFF2F7DC0), Color(0xFF17807B)],
  'rama': [Color(0xFF86AD55), Color(0xFF3A6B37)],
  'hanuman': [Color(0xFFF57A3D), Color(0xFFA8361C)],
  'durga': [Color(0xFFDB3E52), Color(0xFF7A1330)],
  'lakshmi': [Color(0xFFF2A7A0), Color(0xFFC4952F)],
  'saraswati': [Color(0xFFFBF1D9), Color(0xFFD9B45C)],
  'vishnu': [Color(0xFF4865C9), Color(0xFF1E2C72)],
  'surya': [Color(0xFFFFCB47), Color(0xFFE2711D)],
};

ThemeData buildTheme({required double textScale, required bool highContrast}) {
  final base = ThemeData(useMaterial3: true, colorScheme: ColorScheme.fromSeed(seedColor: AB.saffron, surface: AB.bg));
  final textTheme = GoogleFonts.muktaTextTheme(base.textTheme).apply(bodyColor: AB.text, displayColor: AB.text);
  return base.copyWith(
    scaffoldBackgroundColor: AB.bg,
    textTheme: textTheme,
    appBarTheme: AppBarTheme(backgroundColor: AB.bg, elevation: 0, foregroundColor: AB.text, titleTextStyle: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
    filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(
      backgroundColor: AB.saffron, foregroundColor: Colors.white, minimumSize: const Size.fromHeight(52),
      shape: const StadiumBorder(), textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15))),
    outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(
      foregroundColor: AB.maroon, minimumSize: const Size(0, 44), shape: const StadiumBorder(),
      side: BorderSide(color: highContrast ? AB.text : AB.borderStrong))),
    cardTheme: CardThemeData(color: AB.card, elevation: 0, margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: highContrast ? AB.text2 : AB.border))),
    chipTheme: base.chipTheme.copyWith(shape: const StadiumBorder(), side: const BorderSide(color: AB.border), selectedColor: AB.maroon, checkmarkColor: Colors.white,
      labelStyle: const TextStyle(color: AB.text2), secondaryLabelStyle: const TextStyle(color: Colors.white)),
    navigationBarTheme: NavigationBarThemeData(backgroundColor: AB.card, indicatorColor: AB.saffronSoft,
      labelTextStyle: WidgetStateProperty.all(const TextStyle(fontSize: 11, fontWeight: FontWeight.w500))),
    inputDecorationTheme: InputDecorationTheme(filled: true, fillColor: AB.card,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AB.border)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AB.border))),
  );
}
