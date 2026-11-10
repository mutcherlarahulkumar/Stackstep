import 'package:flutter_test/flutter_test.dart';
import 'package:stackstep/shared/format.dart';

void main() {
  test('RS6 a new internship says it starts tomorrow, or names the day', () {
    final now = DateTime(2026, 11, 4, 22, 30);
    expect(startsCaption('2026-11-05', now), 'Starts tomorrow');
    expect(startsCaption('2026-11-09', now), 'Starts Mon 9 Nov');
    expect(startsCaption('not a date', now), 'Starts soon');
  });
}
