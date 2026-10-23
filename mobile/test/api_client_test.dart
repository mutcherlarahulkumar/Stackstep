import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:stackstep/api/api_client.dart';
import 'package:stackstep/api/models.dart';

import 'fixtures.dart';

http.Response json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  late MemoryTokenStore store;
  setUp(() => store = MemoryTokenStore()..value = 'refresh-0');

  test('concurrent calls share a single refresh', () async {
    var refreshes = 0;
    final gate = Completer<void>();
    final client = MockClient((req) async {
      if (req.url.path == '/v1/auth/refresh') {
        refreshes++;
        await gate.future;
        return json(tokensJson(refresh: 'refresh-$refreshes'));
      }
      expect(req.headers['Authorization'], 'Bearer access-1');
      return json({'items': <Object>[]});
    });
    final api = ApiClient(baseUrl: Uri.parse('http://api.test'), tokenStore: store, httpClient: client);
    final calls = [api.myTasks(), api.myTasks(), api.myTasks()];
    gate.complete();
    await Future.wait(calls);
    expect(refreshes, 1);
    expect(store.value, 'refresh-1');
  });

  test('401 triggers one refresh and a retry', () async {
    var first = true;
    final client = MockClient((req) async {
      if (req.url.path == '/v1/auth/refresh') return json(tokensJson(access: 'access-2'));
      if (first) {
        first = false;
        return json({
          'error': {'code': 'unauthenticated', 'message': 'expired'},
        }, 401);
      }
      return json({'items': <Object>[]});
    });
    final api = ApiClient(baseUrl: Uri.parse('http://api.test'), tokenStore: store, httpClient: client);
    expect(await api.myTasks(), isEmpty);
  });

  test('a rejected refresh clears the session and reports expiry', () async {
    var expired = false;
    final client = MockClient(
      (req) async => json({
        'error': {'code': 'unauthenticated', 'message': 'no'},
      }, 401),
    );
    final api = ApiClient(baseUrl: Uri.parse('http://api.test'), tokenStore: store, httpClient: client)
      ..onSessionExpired = () => expired = true;
    expect(await api.restore(), isFalse);
    expect(store.value, isNull);
    await expectLater(api.me(), throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)));
    expect(expired, isTrue);
  });

  test('error envelope is parsed into typed fields', () async {
    final client = MockClient((req) async {
      if (req.url.path == '/v1/auth/refresh') return json(tokensJson());
      return json({
        'error': {
          'code': 'rate_limited',
          'message': 'slow down',
          'retry_after_seconds': 120,
          'fields': {'body': 'too long'},
        },
      }, 429);
    });
    final api = ApiClient(baseUrl: Uri.parse('http://api.test'), tokenStore: store, httpClient: client);
    await expectLater(
      api.sendMessage(clientId: 'c', body: 'hi'),
      throwsA(
        isA<ApiException>()
            .having((e) => e.code, 'code', ErrorCode.rateLimited)
            .having((e) => e.retryAfterSeconds, 'retry', 120)
            .having((e) => e.fields['body'], 'field', 'too long'),
      ),
    );
  });

  test('gateway errors and dropped connections are network errors', () async {
    final client = MockClient((req) async {
      if (req.url.path == '/v1/auth/refresh') return json(tokensJson());
      if (req.url.path == '/v1/me') return http.Response('bad gateway', 502);
      throw http.ClientException('connection reset');
    });
    final api = ApiClient(baseUrl: Uri.parse('http://api.test'), tokenStore: store, httpClient: client);
    await expectLater(api.me(), throwsA(isA<NetworkException>()));
    await expectLater(api.myTasks(), throwsA(isA<NetworkException>()));
  });

  test('requests carry the mobile client header and JSON body', () async {
    late http.Request seen;
    final client = MockClient((req) async {
      if (req.url.path == '/v1/auth/refresh') return json(tokensJson());
      seen = req;
      return json(messageJson(author: 'student', clientId: 'c-1'), 201);
    });
    final api = ApiClient(baseUrl: Uri.parse('http://api.test'), tokenStore: store, httpClient: client);
    final m = await api.sendMessage(clientId: 'c-1', body: 'hello');
    expect(m.author, Author.student);
    expect(seen.headers['X-Client'], 'mobile');
    expect(jsonDecode(seen.body), {'client_id': 'c-1', 'body': 'hello'});
  });
}
