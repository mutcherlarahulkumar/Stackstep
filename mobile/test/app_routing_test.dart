import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:stackstep/api/api_client.dart';
import 'package:stackstep/app.dart';
import 'package:stackstep/core/providers.dart';

import 'fixtures.dart';

http.Response json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

Future<void> pumpApp(WidgetTester tester, MockClient client, {String? refresh = 'r'}) async {
  final api = ApiClient(baseUrl: Uri.parse('http://api.test'), tokenStore: MemoryTokenStore()..value = refresh, httpClient: client);
  await tester.pumpWidget(ProviderScope(overrides: [apiClientProvider.overrideWithValue(api)], child: const StackstepApp()));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('admin lands on task allocation with the desktop notice, never the chat (U2)', (tester) async {
    final client = MockClient((req) async => switch (req.url.path) {
      '/v1/auth/refresh' => json(tokensJson()),
      '/v1/me' => json({'user': userJson(role: 'admin', login: 'admin-demo', name: 'Platform Admin'), 'enrollment': null}),
      '/v1/admin/students' => json({
        'items': [
          {'user': userJson(), 'enrollment': enrollmentJson(), 'open_tasks': 2, 'in_review': 1},
          {'user': userJson(login: 'kiran-dev', name: 'Kiran Kumar'), 'enrollment': enrollmentJson(status: 'paused'), 'open_tasks': 0, 'in_review': 0},
        ],
        'next_cursor': null,
      }),
      _ => json({'error': {'code': 'not_found', 'message': ''}}, 404),
    });
    await pumpApp(tester, client);

    expect(find.text('Assign tasks'), findsOneWidget);
    expect(find.byKey(const Key('desktop-notice')), findsOneWidget);
    expect(find.byKey(const Key('chat-input')), findsNothing);
    expect(find.text('Asha Rao'), findsOneWidget);
    // Paused students are shown but can't be picked.
    expect(find.text('Paused'), findsOneWidget);
    final paused = tester.widget<ListTile>(find.byKey(const Key('student-kiran-dev')));
    expect(paused.enabled, isFalse);

    await tester.tap(find.byKey(const Key('student-asha-dev')));
    await tester.pumpAndSettle();
    expect(find.text('Assign a task'), findsOneWidget);

    // Submitting an empty title shows the field error without calling the API.
    await tester.scrollUntilVisible(find.byKey(const Key('assign-submit')), 300, scrollable: find.byType(Scrollable).last);
    expect(find.text('Assign to Asha'), findsOneWidget);
    await tester.tap(find.byKey(const Key('assign-submit')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Title is required.'), -300, scrollable: find.byType(Scrollable).last);
    expect(find.text('Title is required.'), findsOneWidget);
  });

  testWidgets('student without an internship sees the empty state (C8)', (tester) async {
    final client = MockClient((req) async => switch (req.url.path) {
      '/v1/auth/refresh' => json(tokensJson()),
      '/v1/me' => json({'user': userJson(login: 'nora-dev', name: 'Nora Das'), 'enrollment': null}),
      _ => json({'error': {'code': 'not_found', 'message': ''}}, 404),
    });
    await pumpApp(tester, client);
    expect(find.text('No active internship'), findsOneWidget);
    expect(find.textContaining('@nora-dev'), findsOneWidget);
  });

  testWidgets('no stored session shows sign-in', (tester) async {
    final client = MockClient((req) async => json({}, 500));
    await pumpApp(tester, client, refresh: null);
    expect(find.byKey(const Key('github-sign-in')), findsOneWidget);
    expect(find.text('Continue with GitHub'), findsOneWidget);
  });

  testWidgets('offline at launch explains the problem on sign-in', (tester) async {
    final client = MockClient((req) async => throw http.ClientException('offline'));
    await pumpApp(tester, client);
    expect(find.textContaining("Can't reach Stackstep"), findsOneWidget);
  });
}
