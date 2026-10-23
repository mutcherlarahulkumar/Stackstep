import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/core/providers.dart';

/// Points, credits and AI limits. Invalidate after anything that changes them.
final FutureProvider<Wallet> walletProvider = FutureProvider.autoDispose<Wallet>((ref) => ref.read(apiClientProvider).wallet());

final FutureProvider<List<AIConversation>> aiConversationsProvider = FutureProvider.autoDispose<List<AIConversation>>(
  (ref) => ref.read(apiClientProvider).aiConversations(),
);

/// Client mirror of the server's AI helper bounds.
abstract final class AIBounds {
  static const goalMin = 20;
  static const goalMax = 1000;
  static const triedMin = 30;
  static const triedMax = 2000;
  static const errorMax = 2000;
  static const codeMax = 4000;
  static const followUpMin = 10;
  static const followUpMax = 1500;
  static const triedSinceMin = 20;
}

String? _check(String v, String label, int min, int max) {
  final n = v.trim().runes.length;
  if (min > 0 && n < min) return '$label needs at least $min characters.';
  if (n > max) return '$label can be at most $max characters.';
  return null;
}

Map<String, String> validateAIQuestion({required String goal, required String tried, required String error, required String code}) => {
  'goal': ?_check(goal, "What you're trying to do", AIBounds.goalMin, AIBounds.goalMax),
  'tried': ?_check(tried, "What you've tried", AIBounds.triedMin, AIBounds.triedMax),
  'error': ?_check(error, 'What happens', 0, AIBounds.errorMax),
  'code': ?_check(code, 'Code', 0, AIBounds.codeMax),
};

Map<String, String> validateAIFollowUp({required String triedSince, required String body}) => {
  'tried_since': ?_check(triedSince, 'What you tried since', AIBounds.triedSinceMin, AIBounds.triedMax),
  'body': ?_check(body, 'Your question', AIBounds.followUpMin, AIBounds.followUpMax),
};

/// "4:05" until a time, or null once it has passed.
String? countdown(DateTime? until, DateTime now) {
  if (until == null) return null;
  final s = (until.difference(now).inMilliseconds / 1000).ceil();
  if (s <= 0) return null;
  if (s >= 3600) return '${s ~/ 3600}h ${((s % 3600) / 60).ceil()}m';
  return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
}

/// How to write a prompt the helper can answer.
const promptTips = [
  ('Say the goal, not just the symptom', '“Filter tasks by status without a reload” beats “filter broken”.'),
  ('Show what you tried', "Name the docs you read and the fix you attempted. It skips advice you've already used."),
  ('Paste the exact error', 'Copy the message and the line it points to.'),
  ('Trim the code', 'Only the part that matters. Never paste passwords or API keys.'),
  ('Say what you expected', '“I expected 3 items, got 0” tells the helper where to look.'),
];
