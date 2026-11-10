import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/api_client.dart';
import 'package:stackstep/api/json.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/features/help/help_screen.dart';

void main() {
  test('HB8 help answers decode strictly', () {
    final a = HelpAnswer.fromJson(
      const JsonReader({
        'answer': 'Open the task.',
        'ai': false,
        'topics': [
          {'id': 'handing-in-work', 'title': 'Handing in work'},
        ],
      }),
    );
    expect(a.topics, ['Handing in work']);
    expect(a.ai, isFalse);
    expect(() => HelpAnswer.fromJson(const JsonReader({'answer': 'x', 'topics': <Object?>[]})), throwsA(isA<ContractViolation>()));
  });

  testWidgets('HB8 the app asks without signing in, sends recent turns and shows the source', (tester) async {
    final sent = <Json>[];
    final api = ApiClient(
      baseUrl: Uri.parse('http://api.test'),
      tokenStore: MemoryTokenStore(),
      httpClient: MockClient((r) async {
        expect(r.headers['authorization'], isNull);
        sent.add(jsonDecode(r.body) as Json);
        return http.Response(
          jsonEncode({
            'answer': 'Open the task on your board and hand in the link.',
            'ai': false,
            'topics': [
              {'id': 'handing-in-work', 'title': 'Handing in work'},
            ],
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiClientProvider.overrideWithValue(api)],
        child: const ShadApp(home: HelpScreen()),
      ),
    );
    await tester.tap(find.byKey(const Key('help-suggestion-How do I hand in a task?')));
    await tester.pumpAndSettle();
    expect(find.textContaining('hand in the link'), findsOneWidget);
    expect(find.textContaining('From the guide · Handing in work'), findsOneWidget);
    expect(sent.single['history'], isEmpty);

    await tester.enterText(find.byKey(const Key('help-input')), 'and then?');
    await tester.tap(find.byKey(const Key('help-send')));
    await tester.pumpAndSettle();
    final history = sent.last['history']! as List<Object?>;
    expect(history.length, 2);
    expect((history.first! as Json)['role'], 'user');
  });

  testWidgets('HB9 long answers are trimmed and failed turns stay out of the history', (tester) async {
    final sent = <Json>[];
    var calls = 0;
    final api = ApiClient(
      baseUrl: Uri.parse('http://api.test'),
      tokenStore: MemoryTokenStore(),
      httpClient: MockClient((r) async {
        sent.add(jsonDecode(r.body) as Json);
        calls++;
        if (calls == 2) {
          return http.Response('{"error":{"code":"internal","message":"x"}}', 500, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          jsonEncode({'answer': 'a' * 2000, 'ai': true, 'topics': <Object?>[]}),
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiClientProvider.overrideWithValue(api)],
        child: const ShadApp(home: HelpScreen()),
      ),
    );
    for (final q in ['first', 'second', 'third']) {
      await tester.enterText(find.byKey(const Key('help-input')), q);
      await tester.tap(find.byKey(const Key('help-send')));
      await tester.pumpAndSettle();
    }
    final history = (sent.last['history']! as List<Object?>).cast<Json>();
    expect(history.map((h) => h['content']), isNot(contains('second')));
    expect(history.every((h) => (h['content']! as String).length <= 1500), isTrue);
  });
}
