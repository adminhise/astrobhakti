import 'package:flutter_test/flutter_test.dart';
import 'package:astrobhakti/api.dart';

void main() {
  test('formats paise with Indian digit grouping', () {
    expect(inr(312600), '₹3,126');
    expect(inr(60000000), '₹6,00,000');
    expect(inr(217250), '₹2,172.50');
  });
}
