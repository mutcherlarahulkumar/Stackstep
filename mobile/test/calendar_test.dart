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
import 'package:stackstep/features/calendar/calendar_screen.dart';

import 'fixtures.dart';

Json entry({
  String kind = 'task',
  String date = '2026-11-04',
  int day = 3,
  String? at = '2026-11-04T04:00:00Z',
  bool released = false,
  String? taskId,
  String? title = 'Standup',
  String? status,
}) => {
  'kind': kind,
  'date': date,
  'day': day,
  'at': at,
  'due_at': at,
  'released': released,
  'task_id': taskId,
  'title': title,
  'task_type': title == null ? null : 'standup',
  'status': status,
  'persona_id': null,
  'class_id': null,
};

void main() {
  test('CA7 calendar decodes strictly and groups by day', () {
    final cal = Calendar.fromJson(
      JsonReader({
        'start_date': '2026-11-02',
        'end_date': '2026-12-01',
        'timezone': 'Asia/Kolkata',
        'items': [
          entry(released: true, taskId: 't-1', status: 'done'),
          entry(kind: 'surprise', at: null, title: null),
          entry(date: '2026-11-05', day: 4, title: 'Hero'),
        ],
      }),
    );
    expect(cal.byDate.length, 2);
    expect(cal.items[1].kind, CalendarKind.surprise);
    expect(() => CalendarEntry.fromJson(JsonReader(entry(kind: 'meeting'))), throwsA(isA<ContractViolation>()));
  });

  testWidgets('CA7 surprise shows only its day, scheduled tasks are locked, released ones open', (tester) async {
    String? opened;
    final api = ApiClient(
      baseUrl: Uri.parse('http://api.test'),
      tokenStore: MemoryTokenStore()..value = 'refresh',
      httpClient: MockClient((r) async {
        final body = switch (r.url.path) {
          '/v1/auth/refresh' => tokensJson(),
          '/v1/me/threads' => {'items': <Object?>[]},
          _ => {
            'start_date': '2026-11-02',
            'end_date': '2026-12-01',
            'timezone': 'Asia/Kolkata',
            'items': [
              entry(date: '2026-11-03', day: 2, title: 'Yesterday', released: true, taskId: 't-0', status: 'done'),
              entry(released: true, taskId: 't-1', status: 'todo'),
              entry(kind: 'surprise', at: null, title: null),
              entry(date: '2026-11-05', day: 4, title: 'Hero'),
            ],
          },
        };
        return http.Response(jsonEncode(body), 200, headers: {'content-type': 'application/json'});
      }),
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiClientProvider.overrideWithValue(api), clockProvider.overrideWithValue(() => DateTime(2026, 11, 4, 12))],
        child: ShadApp(
          home: Scaffold(body: CalendarScreen(onOpenTask: (id) => opened = id)),
        ),
      ),
    );
    await tester.pumpAndSettle();
    // Earlier days fold away; today is labelled with its internship day.
    expect(find.text('Yesterday'), findsNothing);
    expect(find.text('Today · Day 3'), findsOneWidget);
    expect(find.text('Tomorrow · Day 4'), findsOneWidget);
    expect(find.text('A surprise task lands sometime this day'), findsOneWidget);
    expect(find.byIcon(LucideIcons.lock), findsOneWidget);
    await tester.tap(find.text('Hero'));
    expect(opened, isNull);
    await tester.tap(find.text('Standup'));
    expect(opened, 't-1');
    await tester.tap(find.byKey(const Key('calendar-past')));
    await tester.pumpAndSettle();
    expect(find.text('Yesterday'), findsOneWidget);
  });
}
