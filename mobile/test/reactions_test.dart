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
import 'package:stackstep/features/chat/chat_screen.dart';

import 'fixtures.dart';

void main() {
  test('CH7 reactions decode strictly and toggle per side', () {
    final m = Message.fromJson(
      JsonReader({
        ...messageJson(),
        'reactions': [
          {'emoji': 'heart', 'by': 'student'},
        ],
      }),
    );
    expect(m.reactions.single.emoji, ReactionEmoji.heart);
    final both = m.withReaction(ReactionEmoji.heart, Author.persona, on: true);
    expect(both.reactions.length, 2);
    expect(both.withReaction(ReactionEmoji.heart, Author.student, on: false).reactions.single.by, Author.persona);
    expect(
      () => Message.fromJson(
        JsonReader({
          ...messageJson(),
          'reactions': [
            {'emoji': 'fire', 'by': 'student'},
          ],
        }),
      ),
      throwsA(isA<ContractViolation>()),
    );
    expect(Frame.fromJson(JsonReader({'type': 'reaction', 'message': messageJson()})), isA<ReactionFrame>());
  });

  testWidgets('CH7 long press reacts at once, the chip undoes it, and the server is told', (tester) async {
    final sent = <Json>[];
    final api = ApiClient(
      baseUrl: Uri.parse('http://api.test'),
      tokenStore: MemoryTokenStore()..value = 'refresh',
      httpClient: MockClient((r) async {
        if (r.url.path == '/v1/auth/refresh') return http.Response(jsonEncode(tokensJson()), 200, headers: {'content-type': 'application/json'});
        if (r.url.path.endsWith('/reactions')) {
          final body = jsonDecode(r.body) as Json;
          sent.add(body);
          return http.Response(
            jsonEncode({
              ...messageJson(body: 'Ship it today'),
              'reactions': [
                if (body['on'] == true) {'emoji': body['emoji'], 'by': 'student'},
              ],
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (r.url.path.endsWith('/read')) return http.Response('', 204);
        return http.Response(
          jsonEncode({
            'items': [messageJson(body: 'Ship it today')],
            'next_cursor': null,
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(api),
          realtimeProvider.overrideWith((ref) => Realtime(wsUrl: Uri.parse('ws://api.test/v1/ws'), token: () async => null)),
        ],
        child: const ShadApp(
          home: Scaffold(
            body: ChatScreen(target: (personaId: leadId, enrollmentId: null), other: CircleAvatar(), otherName: 'Sam Rivera'),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.longPress(find.text('Ship it today'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('reaction-bar')), findsOneWidget);
    await tester.tap(find.byKey(const Key('react-heart')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('chip-heart')), findsOneWidget);
    expect(sent.last, {'emoji': 'heart', 'on': true});
    await tester.tap(find.byKey(const Key('chip-heart')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('chip-heart')), findsNothing);
    expect(sent.last, {'emoji': 'heart', 'on': false});
  });
}
