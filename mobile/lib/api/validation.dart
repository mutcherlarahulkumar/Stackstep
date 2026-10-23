/// Client-side mirrors of the server's bounds (backend/internal/domain/task.go).
/// The server stays the authority; these give instant feedback.
library;

import 'package:stackstep/api/models.dart';

abstract final class Bounds {
  static const titleMin = 3;
  static const titleMax = 120;
  static const briefMax = 8000;
  static const noteMax = 2000;
  static const messageMax = 4000;
  static const minTaskDuration = Duration(minutes: 15);
  static const backdateGrace = Duration(minutes: 5);
}

final _control = RegExp('[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]');
final _controlInLine = RegExp('[\u0000-\u001F\u007F-\u009F\u2028\u2029]');

/// Collapses whitespace runs like the server's NormalizeText.
String normalizeLine(String s) => s.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).join(' ');

int runeLength(String s) => s.runes.length;

String? validateTitle(String raw) {
  final t = normalizeLine(raw);
  final n = runeLength(t);
  if (n == 0) return 'Title is required.';
  if (n < Bounds.titleMin) return 'Title must be at least 3 characters.';
  if (n > Bounds.titleMax) return 'Title can be at most 120 characters.';
  if (_controlInLine.hasMatch(t)) return "Title contains characters that can't be displayed.";
  return null;
}

String? validateBrief(String raw) {
  final b = raw.trim();
  if (runeLength(b) > Bounds.briefMax) return 'Brief can be at most 8000 characters.';
  if (_control.hasMatch(b)) return "Brief contains characters that can't be displayed.";
  return null;
}

String? validateMessage(String raw) {
  final b = raw.trim();
  if (b.isEmpty) return 'Write a message first.';
  if (runeLength(b) > Bounds.messageMax) return 'Messages can be at most 4000 characters.';
  if (_control.hasMatch(b)) return "Message contains characters that can't be displayed.";
  return null;
}

String? validateNote(String raw, TaskStatus to) {
  final n = raw.trim();
  if (to == TaskStatus.changesRequested && n.isEmpty) return 'Tell the student what to change.';
  if (runeLength(n) > Bounds.noteMax) return 'Note can be at most 2000 characters.';
  return null;
}

/// Validates schedule and due times against the rules the client can check
/// without the enrollment's time zone. The server also checks the internship
/// window and its field errors are shown on the same inputs.
({String? scheduledFor, String? dueAt}) validateSchedule({
  required DateTime now,
  required DateTime? scheduledFor,
  required DateTime? dueAt,
}) {
  final start = scheduledFor ?? now;
  String? s;
  String? d;
  if (start.isBefore(now.subtract(Bounds.backdateGrace))) {
    s = "Start time can't be in the past.";
  }
  if (dueAt == null) {
    d = 'Pick a due time.';
  } else if (dueAt.isBefore(start.add(Bounds.minTaskDuration))) {
    d = 'Due time must be at least 15 minutes after the start.';
  }
  return (scheduledFor: s, dueAt: d);
}

/// Student-allowed moves, mirroring the server's transition graph.
/// Self-reviewed tasks are finished by the student instead of going to review.
List<TaskStatus> studentMoves(TaskStatus from, [ReviewMode mode = ReviewMode.manual]) => switch (from) {
  TaskStatus.todo => const [TaskStatus.inProgress],
  TaskStatus.inProgress => mode == ReviewMode.self ? const [TaskStatus.done] : const [TaskStatus.inReview],
  TaskStatus.changesRequested => const [TaskStatus.inReview, TaskStatus.inProgress],
  TaskStatus.inReview || TaskStatus.done || TaskStatus.cancelled => const [],
};
