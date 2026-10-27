import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/shared/crash_view.dart';
import 'package:stackstep/shared/errors.dart';

void main() {
  testWidgets('a part that fails to build shows friendly copy, never the raw error', (tester) async {
    await tester.pumpWidget(const ShadApp(home: Scaffold(body: CrashView())));
    expect(find.textContaining('This part didn’t load'), findsOneWidget);
  });

  test('unknown failures get generic copy', () {
    expect(messageFor(StateError('boom')), isNot(contains('boom')));
  });
}
