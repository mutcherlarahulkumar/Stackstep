import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';
import 'package:stackstep/api/api_client.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/api/realtime.dart';
import 'package:stackstep/core/config.dart';
import 'package:stackstep/core/pkce.dart';

/// Overridden in tests.
final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(baseUrl: AppConfig.apiBaseUrl, tokenStore: const SecureTokenStore());
});

/// Opens the system browser sheet for OAuth and returns the callback URL.
typedef WebAuthenticator = Future<String> Function(Uri url);

final webAuthenticatorProvider = Provider<WebAuthenticator>(
  (ref) =>
      (url) => FlutterWebAuth2.authenticate(url: url.toString(), callbackUrlScheme: AppConfig.callbackScheme),
);

final clockProvider = Provider<DateTime Function()>((ref) => DateTime.now);

sealed class SessionState {
  const SessionState();
}

final class SessionLoading extends SessionState {
  const SessionLoading();
}

final class SignedOut extends SessionState {
  const SignedOut({this.message});

  /// Why the user is here, shown once on the sign-in screen.
  final String? message;
}

final class SignedIn extends SessionState {
  const SignedIn(this.me);
  final Me me;
}

final sessionProvider = NotifierProvider<SessionController, SessionState>(SessionController.new);

final class SessionController extends Notifier<SessionState> {
  ApiClient get _api => ref.read(apiClientProvider);

  @override
  SessionState build() {
    _api.onSessionExpired = () {
      if (state is SignedIn) state = const SignedOut(message: 'Your session expired. Please sign in again.');
    };
    unawaited(_restore());
    return const SessionLoading();
  }

  Future<void> _restore() async {
    try {
      if (await _api.restore()) {
        state = SignedIn(await _api.me());
      } else {
        state = const SignedOut();
      }
    } on NetworkException {
      state = const SignedOut(message: "Can't reach Stackstep. Check your connection and try again.");
    } on Object {
      state = const SignedOut();
    }
  }

  Future<void> retry() async {
    state = const SessionLoading();
    await _restore();
  }

  /// Returns an error message to show, or null on success or cancel.
  Future<String?> signInWithGitHub() async {
    final pkce = createPkce();
    final String result;
    try {
      result = await ref.read(webAuthenticatorProvider)(_api.githubStartUrl(pkce.challenge));
    } on Object {
      return null; // the user closed the sheet
    }
    final callback = Uri.tryParse(result);
    final error = callback?.queryParameters['error'];
    final code = callback?.queryParameters['code'];
    if (error != null || code == null || code.isEmpty) {
      return switch (ErrorCode.fromWire(error)) {
        ErrorCode.unauthenticated => null, // cancelled on GitHub
        ErrorCode.notConfigured => "GitHub sign-in isn't set up on this server yet.",
        _ => "GitHub sign-in didn't complete. Please try again.",
      };
    }
    return await _complete(() => _api.exchangeCode(code: code, verifier: pkce.verifier));
  }

  Future<String?> _complete(Future<void> Function() signIn) async {
    try {
      await signIn();
      state = SignedIn(await _api.me());
      return null;
    } on NetworkException {
      return "Can't reach Stackstep. Check your connection and try again.";
    } on ApiException catch (e) {
      return switch (e.code) {
        ErrorCode.invalidCode => 'That sign-in link expired. Please try again.',
        ErrorCode.validationFailed => e.fields.values.firstOrNull ?? 'Check the details and try again.',
        ErrorCode.rateLimited => 'Too many attempts. Wait a minute and try again.',
        _ => 'Sign-in failed. Please try again.',
      };
    }
  }

  Future<void> refreshMe() async {
    try {
      state = SignedIn(await _api.me());
    } on Exception {
      // Keep the current state; screens show their own errors.
    }
  }

  /// Applies fresh consent/onboarding state without refetching /me.
  void setAccount(Account a) {
    final s = state;
    if (s is SignedIn) state = SignedIn(s.me.withAccount(a));
  }

  Future<void> signOut() async {
    await _api.logout();
    state = const SignedOut();
  }
}

/// One realtime connection per signed-in student.
final Provider<Realtime> realtimeProvider = Provider.autoDispose<Realtime>((ref) {
  final api = ref.watch(apiClientProvider);
  final rt = Realtime(wsUrl: AppConfig.wsUrl, token: api.accessTokenForSocket)..start();
  ref.onDispose(rt.dispose);
  return rt;
});
