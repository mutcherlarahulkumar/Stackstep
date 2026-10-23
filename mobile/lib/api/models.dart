import 'package:stackstep/api/json.dart';

enum Role {
  student('student'),
  collegeAdmin('college_admin'),
  admin('admin');

  Role(this.wire);
  final String wire;

  bool get isStaff => this == admin || this == collegeAdmin;
}

enum TaskType {
  feature('feature', 'Feature'),
  bugFix('bug_fix', 'Bug fix'),
  dsa('dsa', 'DSA'),
  docReading('doc_reading', 'Doc reading'),
  quiz('quiz', 'Quiz'),
  gitChore('git_chore', 'Git chore'),
  codeReview('code_review', 'Code review'),
  standup('standup', 'Standup');

  TaskType(this.wire, this.label);
  final String wire;
  final String label;
}

enum TaskStatus {
  todo('todo', 'To do'),
  inProgress('in_progress', 'In progress'),
  inReview('in_review', 'In review'),
  changesRequested('changes_requested', 'Changes requested'),
  done('done', 'Done'),
  cancelled('cancelled', 'Cancelled');

  TaskStatus(this.wire, this.label);
  final String wire;
  final String label;

  bool get isTerminal => this == done || this == cancelled;
}

enum EnrollmentStatus {
  active('active'),
  paused('paused'),
  completed('completed'),
  cancelled('cancelled');

  EnrollmentStatus(this.wire);
  final String wire;
}

enum Author {
  student('student'),
  lead('lead');

  Author(this.wire);
  final String wire;
}

/// Closed set of API error codes (mirrors apperr.Code on the server).
enum ErrorCode {
  badRequest('bad_request'),
  payloadTooLarge('payload_too_large'),
  unauthenticated('unauthenticated'),
  forbidden('forbidden'),
  notFound('not_found'),
  validationFailed('validation_failed'),
  invalidTransition('invalid_transition'),
  versionConflict('version_conflict'),
  enrollmentNotActive('enrollment_not_active'),
  noActiveEnrollment('no_active_enrollment'),
  rateLimited('rate_limited'),
  invalidState('invalid_state'),
  invalidCode('invalid_code'),
  notConfigured('not_configured'),
  internal('internal');

  ErrorCode(this.wire);
  final String wire;

  static ErrorCode? fromWire(String? wire) {
    for (final c in values) {
      if (c.wire == wire) return c;
    }
    return null;
  }
}

final class User {
  const User({
    required this.id,
    required this.githubLogin,
    required this.name,
    required this.email,
    required this.avatarUrl,
    required this.role,
    required this.collegeId,
  });

  factory User.fromJson(JsonReader j) => User(
    id: j.string('id'),
    githubLogin: j.string('github_login'),
    name: j.string('name'),
    email: j.stringOrNull('email'),
    avatarUrl: j.stringOrNull('avatar_url'),
    role: j.enumValue('role', Role.values, (r) => r.wire),
    collegeId: j.stringOrNull('college_id'),
  );

  final String id;
  final String githubLogin;
  final String name;
  final String? email;
  final String? avatarUrl;
  final Role role;
  final String? collegeId;

  String get firstName {
    final parts = name.trim().split(RegExp(r'\s+'));
    return parts.first.isEmpty ? githubLogin : parts.first;
  }

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return githubLogin.substring(0, 1).toUpperCase();
    final first = parts.first.substring(0, 1);
    final last = parts.length > 1 ? parts.last.substring(0, 1) : '';
    return (first + last).toUpperCase();
  }
}

final class Program {
  const Program({required this.slug, required this.days, required this.track});

  factory Program.fromJson(JsonReader j) {
    final days = j.integer('days');
    if (days != 30 && days != 60) throw const ContractViolation('program.days', '30 or 60');
    return Program(slug: j.string('slug'), days: days, track: j.string('track'));
  }

  final String slug;
  final int days;
  final String track;
}

final class Enrollment {
  const Enrollment({
    required this.id,
    required this.program,
    required this.startDate,
    required this.endDate,
    required this.timezone,
    required this.status,
    required this.dayNumber,
  });

  factory Enrollment.fromJson(JsonReader j) => Enrollment(
    id: j.string('id'),
    program: Program.fromJson(j.object('program')),
    startDate: j.string('start_date'),
    endDate: j.string('end_date'),
    timezone: j.string('timezone'),
    status: j.enumValue('status', EnrollmentStatus.values, (s) => s.wire),
    dayNumber: j.integer('day_number'),
  );

  final String id;
  final Program program;
  final String startDate;
  final String endDate;
  final String timezone;
  final EnrollmentStatus status;
  final int dayNumber;
}

final class Me {
  const Me({required this.user, required this.enrollment});

  factory Me.fromJson(JsonReader j) {
    final e = j.objectOrNull('enrollment');
    return Me(user: User.fromJson(j.object('user')), enrollment: e == null ? null : Enrollment.fromJson(e));
  }

  final User user;
  final Enrollment? enrollment;
}

final class Task {
  const Task({
    required this.id,
    required this.enrollmentId,
    required this.type,
    required this.title,
    required this.brief,
    required this.status,
    required this.scheduledFor,
    required this.dueAt,
    required this.version,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Task.fromJson(JsonReader j) => Task(
    id: j.string('id'),
    enrollmentId: j.string('enrollment_id'),
    type: j.enumValue('type', TaskType.values, (t) => t.wire),
    title: j.string('title'),
    brief: j.string('brief'),
    status: j.enumValue('status', TaskStatus.values, (s) => s.wire),
    scheduledFor: j.dateTime('scheduled_for'),
    dueAt: j.dateTime('due_at'),
    version: j.integer('version'),
    createdAt: j.dateTime('created_at'),
    updatedAt: j.dateTime('updated_at'),
  );

  final String id;
  final String enrollmentId;
  final TaskType type;
  final String title;
  final String brief;
  final TaskStatus status;
  final DateTime scheduledFor;
  final DateTime dueAt;
  final int version;
  final DateTime createdAt;
  final DateTime updatedAt;
}

final class Message {
  const Message({
    required this.id,
    required this.author,
    required this.body,
    required this.taskId,
    required this.clientId,
    required this.sentAt,
  });

  factory Message.fromJson(JsonReader j) => Message(
    id: j.string('id'),
    author: j.enumValue('author', Author.values, (a) => a.wire),
    body: j.string('body'),
    taskId: j.stringOrNull('task_id'),
    clientId: j.stringOrNull('client_id'),
    sentAt: j.dateTime('sent_at'),
  );

  final String id;
  final Author author;
  final String body;
  final String? taskId;
  final String? clientId;
  final DateTime sentAt;
}

final class Page<T> {
  const Page({required this.items, required this.nextCursor});

  final List<T> items;
  final String? nextCursor;
}

final class StudentRow {
  const StudentRow({required this.user, required this.enrollment, required this.openTasks, required this.inReview});

  factory StudentRow.fromJson(JsonReader j) => StudentRow(
    user: User.fromJson(j.object('user')),
    enrollment: Enrollment.fromJson(j.object('enrollment')),
    openTasks: j.integer('open_tasks'),
    inReview: j.integer('in_review'),
  );

  final User user;
  final Enrollment enrollment;
  final int openTasks;
  final int inReview;
}

final class Tokens {
  const Tokens({required this.accessToken, required this.accessExpiresAt, required this.refreshToken});

  /// Mobile always receives the refresh token in the body.
  factory Tokens.fromJson(JsonReader j) => Tokens(
    accessToken: j.string('access_token'),
    accessExpiresAt: j.dateTime('access_expires_at'),
    refreshToken: j.string('refresh_token'),
  );

  final String accessToken;
  final DateTime accessExpiresAt;
  final String refreshToken;
}

/// A realtime frame from /v1/ws.
sealed class Frame {
  const Frame();

  factory Frame.fromJson(JsonReader j) {
    return switch (j.string('type')) {
      'ready' => const ReadyFrame(),
      'message' => MessageFrame(Message.fromJson(j.object('message'))),
      'task' => TaskFrame(Task.fromJson(j.object('task'))),
      final other => throw ContractViolation('type', 'ready, message or task, got "$other"'),
    };
  }
}

final class ReadyFrame extends Frame {
  const ReadyFrame();
}

final class MessageFrame extends Frame {
  const MessageFrame(this.message);
  final Message message;
}

final class TaskFrame extends Frame {
  const TaskFrame(this.task);
  final Task task;
}
