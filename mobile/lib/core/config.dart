import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';

/// Build-time configuration via `--dart-define`.
abstract final class AppConfig {
  static const _apiOverride = String.fromEnvironment('API_BASE_URL');

  /// The public web app; certificate verification links point here.
  static const webBaseUrl = String.fromEnvironment('WEB_BASE_URL', defaultValue: 'https://stackstep.app');
  static const webConsoleUrl = String.fromEnvironment('WEB_CONSOLE_URL', defaultValue: 'https://stackstep.app/admin');

  static Uri get apiBaseUrl {
    if (_apiOverride.isNotEmpty) return Uri.parse(_apiOverride);
    // The Android emulator reaches the host machine on 10.0.2.2.
    final host = !kIsWeb && Platform.isAndroid ? '10.0.2.2' : 'localhost';
    return Uri.parse('http://$host:8080');
  }

  static Uri get wsUrl {
    final api = apiBaseUrl;
    return api.replace(scheme: api.scheme == 'https' ? 'wss' : 'ws', path: '${api.path}/v1/ws');
  }

  static String verifyUrl(String code) => '${webBaseUrl.replaceAll(RegExp(r'/+$'), '')}/verify/${Uri.encodeComponent(code)}';

  /// A page on the public web app, e.g. webUrl('/privacy').
  static String webUrl(String path) => '${webBaseUrl.replaceAll(RegExp(r'/+$'), '')}$path';

  static const callbackScheme = 'stackstep';
}
