import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:stackstep/api/api_client.dart';
import 'package:stackstep/api/json.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/api/realtime.dart';
import 'package:stackstep/app.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/features/home/today.dart';

import 'fixtures.dart';

Task task(String id, String status, String due) => Task.fromJson(JsonReader(taskJson(id: id, status: status, due: due, title: 'Task $id')));

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

/// The API a student sees on Today (shared with visual checks).
Future<http.Response> todayRoutes(http.Request req) async => switch (req.url.path) {
  '/v1/auth/refresh' => _json(tokensJson()),
  '/v1/me' => _json({'user': userJson(), 'enrollment': enrollmentJson(), 'account': accountJson()}),
  '/v1/me/tasks' => _json({
    'items': [taskJson(status: 'in_progress'), taskJson(id: 't-2', title: 'Fix the navbar', status: 'in_review')],
  }),
  '/v1/me/threads' => _json({
    'items': [
      threadJson(
        persona: {
          ...personaJson(id: '00000000-0000-4000-8000-0000000000f0', name: 'Team room', title: 'Your whole team', color: 'slate'),
          'team': true,
        },
        last: messageJson(body: 'Welcome to your team room'),
        unread: 2,
      ),
    ],
  }),
  '/v1/me/progress' => _json({
    'released': 4,
    'done': 2,
    'in_review': 1,
    'overdue': 0,
    'on_time': 2,
    'points': 30,
    'day_number': 3,
    'days': 30,
    'completion_percent': 50,
    'bar_percent': 70,
    'meets_bar': false,
    'certificate': null,
  }),
  '/v1/me/achievements' => _json({
    'streak': {'current': 3, 'longest': 5, 'active_today': true},
    'badges': [
      {'key': 'first_pr', 'title': 'First PR merged', 'description': 'x', 'target': 1, 'progress': 1, 'earned_at': '2026-11-03T10:00:00Z'},
      {'key': 'tasks_10', 'title': '10 tasks done', 'description': 'x', 'target': 10, 'progress': 2, 'earned_at': null},
    ],
  }),
  '/v1/me/calendar' => _json({'start_date': '2026-11-02', 'end_date': '2026-12-01', 'timezone': 'Asia/Kolkata', 'items': <Object?>[]}),
  _ => _json({
    'error': {'code': 'not_found', 'message': ''},
  }, 404),
};

void main() {
  test('greets by the time of day', () {
    expect(greeting(3), 'Working late');
    expect(greeting(9), 'Good morning');
    expect(greeting(14), 'Good afternoon');
    expect(greeting(20), 'Good evening');
  });

  test('up next puts changes requested first, then the earliest due, and skips review and done', () {
    final tasks = [
      task('a', 'todo', '2026-11-06T12:00:00Z'),
      task('b', 'in_progress', '2026-11-05T12:00:00Z'),
      task('c', 'changes_requested', '2026-11-09T12:00:00Z'),
      task('d', 'in_review', '2026-11-04T12:00:00Z'),
      task('e', 'done', '2026-11-04T12:00:00Z'),
      task('f', 'todo', '2026-11-08T12:00:00Z'),
    ];
    expect(upNext(tasks).map((t) => t.id), ['c', 'b', 'a']);
    expect(upNext(const []), isEmpty);
  });

  test('the next class is the soonest one not long over', () {
    final now = DateTime.utc(2026, 11, 4, 10);
    CalendarEntry klass(String at, String id) => CalendarEntry.fromJson(
      JsonReader({
        'kind': 'class',
        'date': '2026-11-04',
        'day': 3,
        'at': at,
        'due_at': null,
        'released': true,
        'task_id': null,
        'title': 'Class $id',
        'task_type': null,
        'status': null,
        'persona_id': null,
        'class_id': id,
      }),
    );
    final cal = Calendar(
      startDate: DateTime(2026, 11, 2),
      endDate: DateTime(2026, 12, 2),
      timezone: 'Asia/Kolkata',
      items: [klass('2026-11-04T07:00:00Z', 'old'), klass('2026-11-05T10:00:00Z', 'later'), klass('2026-11-04T09:30:00Z', 'now')],
    );
    expect(nextClass(cal, now)?.classId, 'now');
    expect(nextClass(null, now), isNull);
  });

  testWidgets('students land on Today: greeting, progress, what is next, the team room and shortcuts', (tester) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final client = MockClient(todayRoutes);
    final api = ApiClient(baseUrl: Uri.parse('http://api.test'), tokenStore: MemoryTokenStore()..value = 'r', httpClient: client);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(api),
          realtimeProvider.overrideWith((ref) => Realtime(wsUrl: Uri.parse('ws://api.test/v1/ws'), token: () async => null)),
        ],
        child: const StackstepApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('today')), findsOneWidget);
    expect(find.textContaining('Asha'), findsWidgets);
    expect(find.textContaining('50% done'), findsOneWidget);
    expect(find.byKey(const Key('today-task-t-1')), findsOneWidget);
    expect(find.byKey(const Key('today-task-t-2')), findsNothing); // waiting for review
    expect(find.text('3'), findsWidgets); // streak
    expect(find.text('1/2'), findsOneWidget); // badges
    await tester.scrollUntilVisible(find.byKey(const Key('today-team')), 200);
    expect(find.text('2'), findsWidgets); // team room unread
    await tester.scrollUntilVisible(find.byKey(const Key('shortcut-portfolio')), 200);
    expect(find.byKey(const Key('shortcut-lab')), findsOneWidget);

    // Tapping a task opens it on the board.
    await tester.scrollUntilVisible(find.byKey(const Key('today-task-t-1')), -200);
    await tester.tap(find.byKey(const Key('today-task-t-1')));
    await tester.pumpAndSettle();
    expect(find.text('Your board'), findsWidgets);
  });
}
