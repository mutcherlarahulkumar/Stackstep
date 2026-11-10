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
import 'package:stackstep/features/attendance/attendance_screen.dart';

import 'fixtures.dart';

Json day(int n, String status, {int? seat}) => {
  'date': '2026-11-0$n',
  'day': n,
  'status': status,
  'seat': seat,
  'first_seen_at': seat == null ? null : '2026-11-0${n}T04:00:00Z',
};

final Json attendanceJson = {
  'days': [day(1, 'present', seat: 3), day(2, 'missed'), day(3, 'present', seat: 1), day(4, 'pending')],
  'present': 2,
  'missed': 1,
  'streak': 1,
};

void main() {
  test('AT7 attendance decodes strictly', () {
    final a = Attendance.fromJson(JsonReader(attendanceJson));
    expect(a.days.length, 4);
    expect(a.days.first.seat, 3);
    expect(a.days[3].status, AttendanceStatus.pending);
    expect(a.percent, 67);
    expect(() => AttendanceDay.fromJson(JsonReader(day(1, 'late'))), throwsA(isA<ContractViolation>()));
  });

  testWidgets('AT7 the app shows totals, the forest and the seats', (tester) async {
    final semantics = tester.ensureSemantics();
    final api = ApiClient(
      baseUrl: Uri.parse('http://api.test'),
      tokenStore: MemoryTokenStore()..value = 'refresh',
      httpClient: MockClient((r) async {
        final body = r.url.path == '/v1/auth/refresh' ? tokensJson() : attendanceJson;
        return http.Response(jsonEncode(body), 200, headers: {'content-type': 'application/json'});
      }),
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiClientProvider.overrideWithValue(api)],
        child: const ShadApp(home: AttendanceScreen()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('attendance-forest')), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('A forest of 2 green trees')), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('attendance-seats')));
    await tester.pumpAndSettle();
    expect(find.text('#3'), findsOneWidget);
    expect(find.byWidgetPredicate((w) => w is Semantics && w.properties.label == 'Day 2, missed'), findsOneWidget);
    // Turning the forest repaints without errors.
    await tester.ensureVisible(find.byKey(const Key('attendance-forest')));
    await tester.pumpAndSettle();
    await tester.drag(find.byKey(const Key('attendance-forest')), const Offset(120, 0));
    await tester.pump();
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });
}
