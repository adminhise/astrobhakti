import 'dart:convert';
import 'package:http/http.dart' as http;

/// Talks to the AstroBhakti backend. The Android emulator reaches the host machine at 10.0.2.2.
class Api {
  Api({String? base, this.token}) : base = base ?? const String.fromEnvironment('API_BASE', defaultValue: 'http://10.0.2.2:8787/api');

  final String base;
  String? token;

  Map<String, String> get _headers => {
        'content-type': 'application/json',
        if (token != null) 'authorization': 'Bearer $token',
      };

  Future<dynamic> get(String path) => _send(http.get(Uri.parse('$base$path'), headers: _headers));
  Future<dynamic> post(String path, [Object? body]) => _send(http.post(Uri.parse('$base$path'), headers: _headers, body: jsonEncode(body ?? {})));
  Future<dynamic> put(String path, [Object? body]) => _send(http.put(Uri.parse('$base$path'), headers: _headers, body: jsonEncode(body ?? {})));
  Future<dynamic> delete(String path) => _send(http.delete(Uri.parse('$base$path'), headers: _headers));

  Future<dynamic> _send(Future<http.Response> req) async {
    final res = await req.timeout(const Duration(seconds: 15));
    final data = res.body.isEmpty ? null : jsonDecode(utf8.decode(res.bodyBytes));
    if (res.statusCode >= 400) {
      throw ApiError(res.statusCode, data is Map ? (data['error'] ?? 'error') as String : 'error', data is Map ? data['message'] as String? : null);
    }
    return data;
  }
}

class ApiError implements Exception {
  ApiError(this.status, this.code, this.message);
  final int status;
  final String code;
  final String? message;
  @override
  String toString() => message ?? code;
}

/// Formats paise as rupees with Indian digit grouping, e.g. 312600 → ₹3,126.
String inr(num paise) {
  final rupees = paise / 100;
  final whole = rupees.truncate();
  final s = whole.toString();
  String grouped;
  if (s.length <= 3) {
    grouped = s;
  } else {
    final last3 = s.substring(s.length - 3);
    var rest = s.substring(0, s.length - 3);
    final parts = <String>[];
    while (rest.length > 2) {
      parts.insert(0, rest.substring(rest.length - 2));
      rest = rest.substring(0, rest.length - 2);
    }
    if (rest.isNotEmpty) parts.insert(0, rest);
    grouped = '${parts.join(',')},$last3';
  }
  final frac = ((rupees - whole) * 100).round();
  return frac == 0 ? '₹$grouped' : '₹$grouped.${frac.toString().padLeft(2, '0')}';
}
