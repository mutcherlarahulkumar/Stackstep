import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/json.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/core/config.dart';
import 'package:stackstep/features/progress/progress_screen.dart';

Json certificateJson({String status = 'valid'}) => {
  'code': 'ABCDEFGHJK23',
  'student_name': 'Asha Rao',
  'github_login': 'asha',
  'program_slug': 'frontend-30',
  'program_days': 30,
  'flow_name': null,
  'start_date': '2026-11-02',
  'end_date': '2026-12-01',
  'points': 120,
  'tasks_done': 8,
  'tasks_total': 10,
  'issued_at': '2026-12-01T10:00:00Z',
  'status': status,
  'revoked_at': status == 'revoked' ? '2026-12-02T10:00:00Z' : null,
  'revoke_reason': status == 'revoked' ? 'Plagiarised work' : null,
};

Json progressJson({Json? certificate}) => {
  'released': 10,
  'done': 8,
  'in_review': 1,
  'overdue': 1,
  'on_time': 6,
  'points': 120,
  'day_number': 30,
  'days': 30,
  'completion_percent': 80,
  'bar_percent': 70,
  'meets_bar': true,
  'certificate': certificate,
};

Widget host(Progress p) => ProviderScope(
  overrides: [progressProvider.overrideWith((ref) async => p)],
  child: const ShadApp(home: ProgressScreen()),
);

void main() {
  test('progress and certificates decode strictly (CE1)', () {
    final p = Progress.fromJson(JsonReader(progressJson(certificate: certificateJson())));
    expect(p.completionPercent, 80);
    expect(p.certificate?.status, CertificateStatus.valid);
    expect(p.certificate?.displayCode, 'ABCD-EFGH-JK23');
    expect(Progress.fromJson(JsonReader(progressJson())).certificate, isNull);
    expect(() => Certificate.fromJson(JsonReader(certificateJson(status: 'expired'))), throwsA(isA<ContractViolation>()));
  });

  test('verification links point at the web app', () {
    expect(AppConfig.verifyUrl('ABCDEFGHJK23'), endsWith('/verify/ABCDEFGHJK23'));
  });

  testWidgets('before a certificate: the bar and who issues it', (tester) async {
    await tester.pumpWidget(host(Progress.fromJson(JsonReader(progressJson()))));
    await tester.pumpAndSettle();
    expect(find.text('80%'), findsOneWidget);
    expect(find.byKey(const Key('no-certificate')), findsOneWidget);
    expect(find.byKey(const Key('open-certificate')), findsNothing);
  });

  testWidgets('after a certificate: the code and a verification link', (tester) async {
    await tester.pumpWidget(host(Progress.fromJson(JsonReader(progressJson(certificate: certificateJson())))));
    await tester.pumpAndSettle();
    expect(find.text('ABCD-EFGH-JK23'), findsOneWidget);
    expect(find.byKey(const Key('open-certificate')), findsOneWidget);
  });
}
