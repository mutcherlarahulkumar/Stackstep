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
import 'package:stackstep/api/realtime.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/features/mail/mail_screen.dart';

import 'fixtures.dart';

Json mailJson({String id = 'm-1', String kind = 'review', String subject = 'Changes requested', bool read = false, String? body, String? taskId = 't-1'}) => {
  'id': id,
  'kind': kind,
  'subject': subject,
  'preview': 'Your reviewer asked for a few changes.',
  'body': body,
  'from_name': 'Priya Sharma',
  'persona_id': null,
  'announcement_id': null,
  'task_id': taskId,
  'class_id': null,
  'created_at': '2026-11-04T04:30:00Z',
  'read': read,
};

void main() {
  test('MA8 mail decodes strictly, including the live frame', () {
    final page = MailPage.fromJson(JsonReader({'items': [mailJson()], 'next_cursor': null, 'unread': 1}));
    expect(page.items.single.kind, MailKind.review);
    expect(page.items.single.asRead().read, isTrue);
    expect(Frame.fromJson(JsonReader({'type': 'mail', 'mail': mailJson()})), isA<MailFrame>());
    expect(() => Mail.fromJson(JsonReader(mailJson(kind: 'spam'))), throwsA(isA<ContractViolation>()));
  });

  testWidgets('MA8 the mailbox opens a letter as Markdown, marks it read and links to the task', (tester) async {
    var opened = 0;
    String? task;
    final api = ApiClient(
      baseUrl: Uri.parse('http://api.test'),
      tokenStore: MemoryTokenStore()..value = 'refresh',
      httpClient: MockClient((r) async {
        final Object body = switch (r.url.path) {
          '/v1/auth/refresh' => tokensJson(),
          '/v1/me/mail' => {
            'items': [mailJson(), mailJson(id: 'm-2', kind: 'announcement', subject: 'Demo day on Friday', read: true, taskId: null)],
            'next_cursor': null,
            'unread': 1,
          },
          _ => () {
            opened++;
            return mailJson(read: true, body: '## Next steps\n\n> Add an empty state.');
          }(),
        };
        return http.Response(jsonEncode(body), 200, headers: {'content-type': 'application/json'});
      }),
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(api),
          clockProvider.overrideWithValue(() => DateTime(2026, 11, 4, 12)),
          realtimeProvider.overrideWith((ref) => Realtime(wsUrl: Uri.parse('ws://api.test/v1/ws'), token: () async => null)),
        ],
        child: ShadApp(
          home: Consumer(
            builder: (context, ref, _) => Scaffold(
              appBar: AppBar(title: Text('unread ${ref.watch(mailProvider).value?.unread ?? '-'}')),
              body: MailScreen(onOpenTask: (id) => task = id),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('unread 1'), findsOneWidget);
    expect(find.text('Demo day on Friday'), findsOneWidget);
    await tester.tap(find.text('Changes requested'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('mail-reader')), findsOneWidget);
    expect(find.text('Next steps'), findsOneWidget);
    expect(find.textContaining('## Next'), findsNothing);
    expect(opened, 1);
    await tester.tap(find.byKey(const Key('mail-open-task')));
    await tester.pumpAndSettle();
    expect(task, 't-1');
    expect(find.text('unread 0'), findsOneWidget);
  });
}
