import 'dart:async';
import 'dart:convert';
import 'dart:io' show SocketException;

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:stackstep/api/json.dart';
import 'package:stackstep/api/models.dart';

/// An error the API returned in its envelope.
final class ApiException implements Exception {
  const ApiException({required this.status, required this.code, required this.message, this.fields = const {}, this.retryAfterSeconds});

  final int status;

  /// Null only when the server sent a code this build doesn't know.
  final ErrorCode? code;
  final String message;
  final Map<String, String> fields;
  final int? retryAfterSeconds;

  @override
  String toString() => 'ApiException($status, ${code?.wire}): $message';
}

/// The request never got a usable answer (offline, timeout, bad gateway).
final class NetworkException implements Exception {
  const NetworkException(this.cause);
  final Object cause;

  @override
  String toString() => 'NetworkException: $cause';
}

/// Persists the refresh token. Access tokens live in memory only.
abstract interface class TokenStore {
  Future<String?> read();
  Future<void> write(String refreshToken);
  Future<void> clear();
}

final class SecureTokenStore implements TokenStore {
  const SecureTokenStore([this._storage = const FlutterSecureStorage()]);

  final FlutterSecureStorage _storage;
  static const _key = 'stackstep.refresh_token';

  @override
  Future<String?> read() => _storage.read(key: _key);

  @override
  Future<void> write(String refreshToken) => _storage.write(key: _key, value: refreshToken);

  @override
  Future<void> clear() => _storage.delete(key: _key);
}

final class MemoryTokenStore implements TokenStore {
  String? value;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String refreshToken) async => value = refreshToken;

  @override
  Future<void> clear() async => value = null;
}

typedef CreateTaskInput = ({TaskType type, String title, String brief, DateTime? scheduledFor, DateTime dueAt});

final class ApiClient {
  ApiClient({
    required this.baseUrl,
    required TokenStore tokenStore,
    http.Client? httpClient,
    DateTime Function()? now,
    this.timeout = const Duration(seconds: 15),
  }) : _store = tokenStore,
       _http = httpClient ?? http.Client(),
       _now = now ?? DateTime.now;

  final Uri baseUrl;
  final Duration timeout;
  final TokenStore _store;
  final http.Client _http;
  final DateTime Function() _now;

  String? _access;
  DateTime? _accessExpiresAt;
  Future<bool>? _refreshing;

  /// Called when the session can't be recovered; the app returns to sign-in.
  void Function()? onSessionExpired;

  bool get hasSession => _access != null;

  /// A valid access token for the WebSocket, refreshing first if needed.
  Future<String?> accessTokenForSocket() async {
    if (!await _ensureFresh()) return null;
    return _access;
  }

  // ---- Session ----

  Future<void> devLogin(String githubLogin) async {
    final j = await _send('POST', '/v1/auth/dev-login', body: {'github_login': githubLogin}, auth: false);
    await _accept(Tokens.fromJson(asObject(j)));
  }

  Future<void> exchangeCode({required String code, required String verifier}) async {
    final j = await _send('POST', '/v1/auth/exchange', body: {'code': code, 'code_verifier': verifier}, auth: false);
    await _accept(Tokens.fromJson(asObject(j)));
  }

  /// Restores a session from the stored refresh token. False means "signed out".
  Future<bool> restore() => _refresh();

  Future<void> logout() async {
    final refresh = await _store.read();
    _access = null;
    _accessExpiresAt = null;
    await _store.clear();
    if (refresh == null) return;
    try {
      await _send('POST', '/v1/auth/logout', body: {'refresh_token': refresh}, auth: false);
    } on Exception {
      // Best effort: the local session is already gone.
    }
  }

  Uri githubStartUrl(String codeChallenge) => baseUrl.replace(
    path: '${baseUrl.path}/v1/auth/github/start',
    queryParameters: {'client': 'mobile', 'code_challenge': codeChallenge, 'code_challenge_method': 'S256'},
  );

  // ---- Student ----

  Future<Me> me() async => Me.fromJson(asObject(await _send('GET', '/v1/me')));

  Future<List<Task>> myTasks() async => asObject(await _send('GET', '/v1/me/tasks')).list('items', Task.fromJson);

  Future<Page<Message>> messages({String? cursor, int limit = 50}) async {
    final j = asObject(await _send('GET', '/v1/me/messages', query: {'limit': '$limit', 'cursor': ?cursor}));
    return Page(items: j.list('items', Message.fromJson), nextCursor: j.stringOrNull('next_cursor'));
  }

  Future<Message> sendMessage({required String clientId, required String body}) async =>
      Message.fromJson(asObject(await _send('POST', '/v1/me/messages', body: {'client_id': clientId, 'body': body})));

  Future<Task> transition({required String taskId, required TaskStatus to, required int expectedVersion, String note = ''}) async =>
      Task.fromJson(
        asObject(
          await _send('POST', '/v1/tasks/$taskId/transitions', body: {'to': to.wire, 'expected_version': expectedVersion, 'note': note}),
        ),
      );

  // ---- Admin ----

  Future<Page<StudentRow>> students({String query = '', String? cursor, int limit = 30}) async {
    final j = asObject(
      await _send('GET', '/v1/admin/students', query: {'limit': '$limit', if (query.isNotEmpty) 'q': query, 'cursor': ?cursor}),
    );
    return Page(items: j.list('items', StudentRow.fromJson), nextCursor: j.stringOrNull('next_cursor'));
  }

  Future<Task> createTask(String enrollmentId, CreateTaskInput input) async => Task.fromJson(
    asObject(
      await _send(
        'POST',
        '/v1/admin/enrollments/$enrollmentId/tasks',
        body: {
          'type': input.type.wire,
          'title': input.title,
          'brief': input.brief,
          'scheduled_for': input.scheduledFor?.toUtc().toIso8601String(),
          'due_at': input.dueAt.toUtc().toIso8601String(),
        },
      ),
    ),
  );

  // ---- Transport ----

  Future<void> _accept(Tokens t) async {
    _access = t.accessToken;
    _accessExpiresAt = t.accessExpiresAt;
    await _store.write(t.refreshToken);
  }

  Future<bool> _ensureFresh() async {
    final exp = _accessExpiresAt;
    if (_access != null && exp != null && exp.isAfter(_now().toUtc().add(const Duration(seconds: 30)))) return true;
    return await _refresh();
  }

  /// Single-flight: concurrent callers share one refresh, because a second
  /// rotation of the same token would be treated as theft by the server.
  Future<bool> _refresh() => _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);

  Future<bool> _doRefresh() async {
    final refresh = await _store.read();
    if (refresh == null) return false;
    try {
      final j = await _send('POST', '/v1/auth/refresh', body: {'refresh_token': refresh}, auth: false);
      await _accept(Tokens.fromJson(asObject(j)));
      return true;
    } on ApiException catch (e) {
      if (e.status == 401) {
        _access = null;
        _accessExpiresAt = null;
        await _store.clear();
        return false;
      }
      rethrow;
    }
  }

  Future<Object?> _send(
    String method,
    String path, {
    Map<String, Object?>? body,
    Map<String, String>? query,
    bool auth = true,
    bool retried = false,
  }) async {
    if (auth && !await _ensureFresh()) {
      onSessionExpired?.call();
      throw const ApiException(status: 401, code: ErrorCode.unauthenticated, message: 'Please sign in again.');
    }
    final uri = baseUrl.replace(path: '${baseUrl.path}$path', queryParameters: (query?.isEmpty ?? true) ? null : query);
    final req = http.Request(method, uri)
      ..headers['Accept'] = 'application/json'
      ..headers['X-Client'] = 'mobile';
    if (auth) req.headers['Authorization'] = 'Bearer $_access';
    if (body != null) {
      req.headers['Content-Type'] = 'application/json';
      req.body = jsonEncode(body);
    }

    final http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req).timeout(timeout));
    } on TimeoutException catch (e) {
      throw NetworkException(e);
    } on SocketException catch (e) {
      throw NetworkException(e);
    } on http.ClientException catch (e) {
      throw NetworkException(e);
    }

    if (res.statusCode == 401 && auth && !retried) {
      _access = null;
      if (await _refresh()) return await _send(method, path, body: body, query: query, retried: true);
      onSessionExpired?.call();
    }
    if (res.statusCode == 204) return null;
    if (res.statusCode >= 200 && res.statusCode < 300) {
      try {
        return jsonDecode(utf8.decode(res.bodyBytes));
      } on FormatException catch (e) {
        throw NetworkException(e);
      }
    }
    throw _parseError(res);
  }

  Exception _parseError(http.Response res) {
    if (res.statusCode >= 502 && res.statusCode <= 504) return NetworkException('HTTP ${res.statusCode}');
    try {
      final env = asObject(jsonDecode(utf8.decode(res.bodyBytes))).object('error');
      final fields = env.objectOrNull('fields')?.raw.map((k, v) => MapEntry(k, v is String ? v : '$v')) ?? const {};
      final retry = env.raw['retry_after_seconds'];
      return ApiException(
        status: res.statusCode,
        code: ErrorCode.fromWire(env.string('code')),
        message: env.string('message'),
        fields: fields,
        retryAfterSeconds: retry is int ? retry : null,
      );
    } on Object {
      return ApiException(status: res.statusCode, code: null, message: 'Unexpected response (${res.statusCode}).');
    }
  }
}
