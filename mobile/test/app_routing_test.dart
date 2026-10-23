import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:stackstep/api/api_client.dart';
import 'package:stackstep/api/realtime.dart';
import 'package:stackstep/app.dart';
import 'package:stackstep/core/providers.dart';

import 'fixtures.dart';

http.Response json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

Future<void> pumpApp(WidgetTester tester, MockClient client, {String? refresh = 'r'}) async {
  final api = ApiClient(baseUrl: Uri.parse('http://api.test'), tokenStore: MemoryTokenStore()..value = refresh, httpClient: client);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(api),
        // Never started: widget tests don't open sockets.
        realtimeProvider.overrideWith((ref) => Realtime(wsUrl: Uri.parse('ws://api.test/v1/ws'), token: () async => null)),
      ],
      child: const StackstepApp(),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('admin lands on task allocation with the desktop notice, never the chat (U2)', (tester) async {
    final client = MockClient(
      (req) async => switch (req.url.path) {
        '/v1/auth/refresh' => json(tokensJson()),
        '/v1/me' => json({'user': userJson(role: 'admin', login: 'admin-demo', name: 'Platform Admin'), 'enrollment': null}),
        '/v1/admin/personas' => json({
          'items': [personaJson(), personaJson(id: managerId, name: 'Priya Sharma', title: 'Engineering Manager', color: 'blue')],
        }),
        '/v1/admin/threads' => json({
          'items': [
            threadJson(
              unread: 2,
              persona: personaJson(id: managerId, name: 'Priya Sharma', title: 'Engineering Manager', color: 'blue'),
              last: messageJson(author: 'student', body: 'Can I use a heap here?', personaId: managerId),
              student: {'name': 'Asha Rao', 'github_login': 'asha-dev', 'avatar_url': null},
            ),
          ],
          'next_cursor': null,
        }),
        '/v1/admin/students' => json({
          'items': [
            {'user': userJson(), 'enrollment': enrollmentJson(), 'open_tasks': 2, 'in_review': 1},
            {
              'user': userJson(login: 'kiran-dev', name: 'Kiran Kumar'),
              'enrollment': enrollmentJson(status: 'paused'),
              'open_tasks': 0,
              'in_review': 0,
            },
          ],
          'next_cursor': null,
        }),
        _ => json({
          'error': {'code': 'not_found', 'message': ''},
        }, 404),
      },
    );
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
    final form = find.descendant(of: find.byKey(const Key('assign-form')), matching: find.byType(Scrollable)).first;

    // Submitting an empty title shows the field error without calling the API.
    await tester.scrollUntilVisible(find.byKey(const Key('assign-submit')), 300, scrollable: form);
    expect(find.text('Assign to Asha'), findsOneWidget);
    await tester.tap(find.byKey(const Key('assign-submit')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Title is required.'), -300, scrollable: form);
    expect(find.text('Title is required.'), findsOneWidget);
    // The persona picker defaults to the team lead and offers the managers.
    await tester.scrollUntilVisible(find.byKey(const Key('persona-$managerId')), -300, scrollable: form);
    expect(find.byKey(const Key('persona-$managerId')), findsOneWidget);
    expect(find.byKey(const Key('review-self')), findsOneWidget);

    // The inbox tab lists conversations with their persona and unread count (U5 on phones).
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Inbox').last);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('staff-thread-e-1/$managerId')), findsOneWidget);
    expect(find.textContaining('with Priya Sharma'), findsOneWidget);
    expect(find.text('2'), findsWidgets);

    // Broadcasting with nothing picked explains what's missing.
    await tester.tap(find.byKey(const Key('broadcast-open')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('broadcast-send')));
    await tester.pumpAndSettle();
    expect(find.text('Write a message first.'), findsOneWidget);
    expect(find.text('Pick at least one student.'), findsOneWidget);
  });

  testWidgets('student chats are split by persona, with unread counts', (tester) async {
    final client = MockClient(
      (req) async => switch (req.url.path) {
        '/v1/auth/refresh' => json(tokensJson()),
        '/v1/me' => json({'user': userJson(), 'enrollment': enrollmentJson()}),
        '/v1/me/tasks' => json({
          'items': [taskJson(personaId: managerId, reviewMode: 'self', status: 'in_progress')],
        }),
        '/v1/me/threads' => json({
          'items': [
            threadJson(
              persona: personaJson(id: managerId, name: 'Priya Sharma', title: 'Engineering Manager', color: 'blue'),
              last: messageJson(body: 'Today: two-pointer warmup.', personaId: managerId),
              unread: 1,
            ),
            threadJson(
              last: messageJson(id: 'm-0', body: 'Morning! Standup at 10.'),
            ),
          ],
        }),
        '/v1/me/threads/$managerId/messages' => json({
          'items': [messageJson(body: 'Today: two-pointer warmup.', personaId: managerId)],
          'next_cursor': null,
        }),
        '/v1/me/threads/$managerId/read' => http.Response('', 204),
        _ => json({
          'error': {'code': 'not_found', 'message': ''},
        }, 404),
      },
    );
    await pumpApp(tester, client);

    expect(find.text('Chats'), findsWidgets);
    expect(find.text('Priya Sharma'), findsOneWidget);
    expect(find.text('Sam Rivera'), findsOneWidget);
    expect(find.text('Engineering Manager'), findsOneWidget);

    await tester.tap(find.byKey(const Key('thread-$managerId')));
    await tester.pumpAndSettle();
    expect(find.text('Today: two-pointer warmup.'), findsOneWidget);
    expect(find.byKey(const Key('chat-input')), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    // Reading the thread clears its badge.
    expect(find.byType(Badge).evaluate().map((e) => (e.widget as Badge).isLabelVisible), everyElement(isFalse));

    // Self-reviewed tasks are finished by the student.
    await tester.tap(find.text('Tasks'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add filtering'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('move-done')), findsOneWidget);
    expect(find.text('Mark as done'), findsOneWidget);
    expect(find.textContaining('From Priya Sharma'), findsOneWidget);
  });

  testWidgets('student without an internship sees the empty state (C8)', (tester) async {
    final client = MockClient(
      (req) async => switch (req.url.path) {
        '/v1/auth/refresh' => json(tokensJson()),
        '/v1/me' => json({'user': userJson(login: 'nora-dev', name: 'Nora Das'), 'enrollment': null}),
        _ => json({
          'error': {'code': 'not_found', 'message': ''},
        }, 404),
      },
    );
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
