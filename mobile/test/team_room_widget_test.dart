import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/api_client.dart';
import 'package:stackstep/api/json.dart';
import 'package:stackstep/api/realtime.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/features/chat/chat_screen.dart';
import 'package:stackstep/features/growth/achievements.dart';

import 'fixtures.dart';

const teamId = '00000000-0000-4000-8000-0000000000f0';

http.Response _json(Object body) => http.Response(jsonEncode(body), 200, headers: {'content-type': 'application/json'});

ApiClient _api(http.Response Function(http.Request r) route, {List<Json>? sent}) => ApiClient(
  baseUrl: Uri.parse('http://api.test'),
  tokenStore: MemoryTokenStore()..value = 'refresh',
  httpClient: MockClient((r) async {
    if (r.url.path == '/v1/auth/refresh') return _json(tokensJson());
    if (r.method == 'POST' && r.url.path.endsWith('/messages')) sent?.add(jsonDecode(r.body) as Json);
    return route(r);
  }),
);

Widget _app(ApiClient api, Widget child) => ProviderScope(
  overrides: [
    apiClientProvider.overrideWithValue(api),
    realtimeProvider.overrideWith((ref) => Realtime(wsUrl: Uri.parse('ws://api.test/v1/ws'), token: () async => null)),
  ],
  child: ShadApp(home: Scaffold(body: child)),
);

void main() {
  testWidgets('TR1/TR3: the team room names each speaker and suggests @mentions', (tester) async {
    final api = _api((r) {
      if (r.url.path == '/v1/me/team') {
        return _json({
          'members': [personaJson(), personaJson(id: managerId, name: 'Priya Sharma', title: 'Engineering Manager', color: 'emerald')],
          'bot': {'name': 'Stackbot', 'title': 'AI teammate'},
        });
      }
      if (r.url.path.endsWith('/read')) return http.Response('', 204);
      return _json({
        'items': [
          {...messageJson(id: 'm-2', body: 'On it', personaId: teamId, sentAt: '2026-11-04T05:30:00Z'), 'speaker_id': leadId},
          {...messageJson(body: 'Welcome to your team room', personaId: teamId, automated: true), 'speaker_id': null},
        ],
        'next_cursor': null,
      });
    });
    await tester.pumpWidget(
      _app(
        api,
        const ChatScreen(target: (personaId: teamId, enrollmentId: null), other: CircleAvatar(), otherName: 'Team room', teamRoom: true),
      ),
    );
    await tester.pumpAndSettle();
    final names = tester.widgetList<Text>(find.byKey(const Key('team-speaker-name'))).map((t) => t.textSpan!.toPlainText()).toList();
    expect(names, containsAll(['Stackbot · AI teammate', 'Sam Rivera · Team Lead']));

    await tester.enterText(find.byKey(const Key('chat-input')).first, 'quick one @pr');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('mention-suggestions')), findsOneWidget);
    await tester.tap(find.text('Priya'));
    await tester.pumpAndSettle();
    expect(find.text('quick one @Priya '), findsOneWidget);
  });

  testWidgets('TR5: staff in a team room speak as the persona they pick', (tester) async {
    final sent = <Json>[];
    final api = _api(sent: sent, (r) {
      if (r.url.path == '/v1/admin/personas') {
        return _json({
          'items': [personaJson(), personaJson(id: managerId, name: 'Priya Sharma', title: 'Engineering Manager', color: 'emerald')],
        });
      }
      if (r.url.path.endsWith('/read')) return http.Response('', 204);
      if (r.method == 'POST') {
        final body = jsonDecode(r.body) as Json;
        return _json({
          ...messageJson(id: 'm-9', body: body['body']! as String, personaId: teamId, clientId: body['client_id']! as String),
          'speaker_id': body['speaker_id'],
        });
      }
      return _json({'items': <Object?>[], 'next_cursor': null});
    });
    await tester.pumpWidget(
      _app(
        api,
        const ChatScreen(target: (personaId: teamId, enrollmentId: 'e-1'), other: CircleAvatar(), otherName: 'Asha Rao', teamRoom: true),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('team-speaker')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('chat-input')).first, 'Demo is Friday');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('chat-send')));
    await tester.pumpAndSettle();
    expect(sent.single['speaker_id'], leadId);
  });

  testWidgets('BG: the board strip shows the streak and earned badges', (tester) async {
    final api = _api(
      (r) => _json({
        'streak': {'current': 4, 'longest': 6, 'active_today': true},
        'badges': [
          {'key': 'bug_hunter', 'title': 'Bug hunter', 'description': 'x', 'target': 1, 'progress': 1, 'earned_at': '2026-11-04T04:30:00Z'},
          {'key': 'tasks_10', 'title': '10 tasks done', 'description': 'x', 'target': 10, 'progress': 3, 'earned_at': null},
        ],
      }),
    );
    await tester.pumpWidget(_app(api, const AchievementsStrip()));
    await tester.pumpAndSettle();
    expect(find.text('4-day streak'), findsOneWidget);
    expect(find.text('1/2'), findsOneWidget);
  });
}
