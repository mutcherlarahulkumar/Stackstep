import 'package:stackstep/api/api_client.dart';
import 'package:stackstep/api/models.dart';

/// Human copy for every error code. Raw server messages are never shown.
String messageFor(Object error) {
  if (error is NetworkException) return "Can't reach Stackstep. Check your connection.";
  if (error is! ApiException) return 'Something went wrong. Please try again.';
  return switch (error.code) {
    ErrorCode.badRequest || ErrorCode.payloadTooLarge => "That request couldn't be processed.",
    ErrorCode.unauthenticated => 'Your session expired. Please sign in again.',
    ErrorCode.forbidden => "You don't have access to this.",
    ErrorCode.notFound => 'This was removed or never existed.',
    ErrorCode.validationFailed => error.fields.values.firstOrNull ?? 'Check the highlighted fields.',
    ErrorCode.invalidTransition => "This task can't move there right now.",
    ErrorCode.versionConflict => 'Someone else changed this. Refresh and try again.',
    ErrorCode.enrollmentNotActive => 'This internship is paused or finished.',
    ErrorCode.noActiveEnrollment => "You don't have an active internship.",
    ErrorCode.rateLimited => _rateLimited(error.retryAfterSeconds),
    ErrorCode.invalidState || ErrorCode.invalidCode => 'That link expired. Please try again.',
    ErrorCode.notConfigured => "This isn't set up on the server yet.",
    ErrorCode.insufficientCredits => "You're out of credits. Finish tasks to earn more, or ask your admin.",
    ErrorCode.aiUnavailable => "The AI helper couldn't answer right now. Your credit was refunded.",
    ErrorCode.internal || null => 'Something went wrong on our side. Please try again.',
  };
}

String _rateLimited(int? seconds) {
  if (seconds == null) return "You're going a bit fast. Try again shortly.";
  if (seconds >= 3600) return "You've hit today's message limit. It resets in ${(seconds / 3600).ceil()}h.";
  if (seconds >= 60) return 'Too many requests. Try again in ${(seconds / 60).ceil()} min.';
  return 'Too many requests. Try again in ${seconds}s.';
}
