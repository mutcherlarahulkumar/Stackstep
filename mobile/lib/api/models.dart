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
  standup('standup', 'Standup'),
  blog('blog', 'Blog');

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

  String get label => switch (this) {
    EnrollmentStatus.active => 'Active',
    EnrollmentStatus.paused => 'Paused',
    EnrollmentStatus.completed => 'Completed',
    EnrollmentStatus.cancelled => 'Cancelled',
  };
}

enum ReviewMode {
  manual('manual', 'Admin reviews'),
  self('self', 'Student marks done');

  ReviewMode(this.wire, this.label);
  final String wire;
  final String label;
}

enum PersonaColor {
  violet('violet'),
  blue('blue'),
  emerald('emerald'),
  amber('amber'),
  rose('rose'),
  cyan('cyan'),
  slate('slate');

  PersonaColor(this.wire);
  final String wire;
}

enum FlowVersionStatus {
  draft('draft'),
  published('published'),
  retired('retired');

  FlowVersionStatus(this.wire);
  final String wire;
}

enum Author {
  student('student'),
  persona('persona');

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
  insufficientCredits('insufficient_credits'),
  aiUnavailable('ai_unavailable'),
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
    required this.flowName,
  });

  factory Enrollment.fromJson(JsonReader j) => Enrollment(
    id: j.string('id'),
    program: Program.fromJson(j.object('program')),
    startDate: j.string('start_date'),
    endDate: j.string('end_date'),
    timezone: j.string('timezone'),
    status: j.enumValue('status', EnrollmentStatus.values, (s) => s.wire),
    dayNumber: j.integer('day_number'),
    flowName: j.objectOrNull('flow')?.string('name'),
  );

  final String id;
  final Program program;
  final String startDate;
  final String endDate;
  final String timezone;
  final EnrollmentStatus status;
  final int dayNumber;

  /// The flow (course) this internship follows, if one is assigned.
  final String? flowName;
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
    required this.reviewMode,
    required this.personaId,
    required this.fromFlow,
    required this.content,
    required this.submission,
    required this.quizResult,
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
    reviewMode: j.enumValue('review_mode', ReviewMode.values, (m) => m.wire),
    personaId: j.string('persona_id'),
    fromFlow: j.boolean('from_flow'),
    content: TaskContent.fromJson(j.object('content')),
    submission: switch (j.objectOrNull('submission')) {
      final s? => Submission.fromJson(s),
      null => null,
    },
    quizResult: switch (j.objectOrNull('quiz_result')) {
      final q? => QuizStats.fromJson(q),
      null => null,
    },
  );

  Task withStatus(TaskStatus s) => Task(
    id: id,
    enrollmentId: enrollmentId,
    type: type,
    title: title,
    brief: brief,
    status: s,
    scheduledFor: scheduledFor,
    dueAt: dueAt,
    version: version,
    createdAt: createdAt,
    updatedAt: updatedAt,
    reviewMode: reviewMode,
    personaId: personaId,
    fromFlow: fromFlow,
    content: content,
    submission: submission,
    quizResult: quizResult,
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
  final ReviewMode reviewMode;
  final String personaId;
  final bool fromFlow;
  final TaskContent content;
  final Submission? submission;
  final QuizStats? quizResult;

  bool get isQuiz => type == TaskType.quiz && content.quiz != null;

  /// No more attempts: passed, used all three, or done.
  bool get quizFinished => status == TaskStatus.done || (quizResult?.passed ?? false) || (quizResult?.attemptsLeft == 0);
}

final class Resource {
  const Resource({required this.title, required this.url});
  factory Resource.fromJson(JsonReader j) => Resource(title: j.string('title'), url: j.string('url'));
  final String title;
  final String url;
}

final class QuizQuestion {
  const QuizQuestion({required this.prompt, required this.options, required this.answer});
  factory QuizQuestion.fromJson(JsonReader j) =>
      QuizQuestion(prompt: j.string('prompt'), options: j.values<String>('options'), answer: j.integerOrNull('answer'));
  final String prompt;
  final List<String> options;

  /// Null for students until the quiz is finished.
  final int? answer;
}

final class Quiz {
  const Quiz({required this.questions, required this.passPercent});
  factory Quiz.fromJson(JsonReader j) =>
      Quiz(questions: j.list('questions', QuizQuestion.fromJson), passPercent: j.integer('pass_percent'));
  final List<QuizQuestion> questions;
  final int passPercent;
}

final class TaskContent {
  const TaskContent({required this.resources, required this.quiz});
  factory TaskContent.fromJson(JsonReader j) => TaskContent(
    resources: j.list('resources', Resource.fromJson),
    quiz: switch (j.objectOrNull('quiz')) {
      final q? => Quiz.fromJson(q),
      null => null,
    },
  );
  final List<Resource> resources;
  final Quiz? quiz;
}

final class Submission {
  const Submission({required this.attempt, required this.url, required this.note, required this.submittedAt});
  factory Submission.fromJson(JsonReader j) => Submission(
    attempt: j.integer('attempt'),
    url: j.stringOrNull('url'),
    note: j.string('note'),
    submittedAt: j.dateTime('submitted_at'),
  );
  final int attempt;
  final String? url;
  final String note;
  final DateTime submittedAt;
}

final class QuizStats {
  const QuizStats({
    required this.attempts,
    required this.attemptsLeft,
    required this.bestScore,
    required this.passed,
    required this.lastCorrect,
  });
  factory QuizStats.fromJson(JsonReader j) => QuizStats(
    attempts: j.integer('attempts'),
    attemptsLeft: j.integer('attempts_left'),
    bestScore: j.integer('best_score'),
    passed: j.boolean('passed'),
    lastCorrect: j.values<bool>('last_correct'),
  );
  final int attempts;
  final int attemptsLeft;
  final int bestScore;
  final bool passed;
  final List<bool> lastCorrect;
}

final class QuizAttemptResult {
  const QuizAttemptResult({
    required this.attempt,
    required this.score,
    required this.passed,
    required this.correct,
    required this.attemptsLeft,
  });
  factory QuizAttemptResult.fromJson(JsonReader j) => QuizAttemptResult(
    attempt: j.integer('attempt'),
    score: j.integer('score'),
    passed: j.boolean('passed'),
    correct: j.values<bool>('correct'),
    attemptsLeft: j.integer('attempts_left'),
  );
  final int attempt;
  final int score;
  final bool passed;
  final List<bool> correct;
  final int attemptsLeft;
}

final class Message {
  const Message({
    required this.id,
    required this.enrollmentId,
    required this.personaId,
    required this.author,
    required this.body,
    required this.taskId,
    required this.clientId,
    required this.sentAt,
  });

  factory Message.fromJson(JsonReader j) => Message(
    id: j.string('id'),
    enrollmentId: j.string('enrollment_id'),
    personaId: j.string('persona_id'),
    author: j.enumValue('author', Author.values, (a) => a.wire),
    body: j.string('body'),
    taskId: j.stringOrNull('task_id'),
    clientId: j.stringOrNull('client_id'),
    sentAt: j.dateTime('sent_at'),
  );

  final String id;
  final String enrollmentId;
  final String personaId;
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

final class Persona {
  const Persona({
    required this.id,
    required this.name,
    required this.title,
    required this.color,
    required this.autoReply,
    required this.archived,
  });

  factory Persona.fromJson(JsonReader j) => Persona(
    id: j.string('id'),
    name: j.string('name'),
    title: j.string('title'),
    color: j.enumValue('color', PersonaColor.values, (c) => c.wire),
    autoReply: j.boolean('auto_reply'),
    archived: j.boolean('archived'),
  );

  final String id;
  final String name;
  final String title;
  final PersonaColor color;
  final bool autoReply;
  final bool archived;

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    return (parts.first.substring(0, 1) + (parts.length > 1 ? parts.last.substring(0, 1) : '')).toUpperCase();
  }
}

/// One conversation: a student with a persona.
final class Thread {
  const Thread({
    required this.enrollmentId,
    required this.persona,
    required this.lastMessage,
    required this.unread,
    this.studentName,
    this.studentLogin,
  });

  factory Thread.fromJson(JsonReader j) {
    final last = j.objectOrNull('last_message');
    final student = j.objectOrNull('student');
    return Thread(
      enrollmentId: j.string('enrollment_id'),
      persona: Persona.fromJson(j.object('persona')),
      lastMessage: last == null ? null : Message.fromJson(last),
      unread: j.integer('unread'),
      studentName: student?.string('name'),
      studentLogin: student?.string('github_login'),
    );
  }

  final String enrollmentId;
  final Persona persona;
  final Message? lastMessage;
  final int unread;

  /// Set in the admin inbox only.
  final String? studentName;
  final String? studentLogin;

  String get key => '$enrollmentId/${persona.id}';

  Thread copyWith({Message? lastMessage, int? unread}) => Thread(
    enrollmentId: enrollmentId,
    persona: persona,
    lastMessage: lastMessage ?? this.lastMessage,
    unread: unread ?? this.unread,
    studentName: studentName,
    studentLogin: studentLogin,
  );
}

final class BroadcastOutcome {
  const BroadcastOutcome({required this.sent, required this.failed});
  final int sent;
  final int failed;
}

enum CreditReason {
  welcome('welcome', 'Starting credits'),
  taskDone('task_done', 'Finished a task'),
  adminGrant('admin_grant', 'Given by an admin'),
  adminRevoke('admin_revoke', 'Removed by an admin'),
  aiQuestion('ai_question', 'AI question'),
  aiRefund('ai_refund', 'AI refund');

  CreditReason(this.wire, this.label);
  final String wire;
  final String label;
}

final class CreditEntry {
  const CreditEntry({required this.id, required this.delta, required this.reason, required this.note, required this.createdAt});
  factory CreditEntry.fromJson(JsonReader j) => CreditEntry(
    id: j.integer('id'),
    delta: j.integer('delta'),
    reason: j.enumValue('reason', CreditReason.values, (r) => r.wire),
    note: j.string('note'),
    createdAt: j.dateTime('created_at'),
  );
  final int id;
  final int delta;
  final CreditReason reason;
  final String note;
  final DateTime createdAt;
}

/// Points, credits and the AI helper's limits for the signed-in student.
final class Wallet {
  const Wallet({
    required this.points,
    required this.finished,
    required this.onTime,
    required this.credits,
    required this.history,
    required this.aiEnabled,
    required this.dailyLimit,
    required this.usedToday,
    required this.costPerQuestion,
    required this.nextQuestionAt,
  });

  factory Wallet.fromJson(JsonReader j) {
    final p = j.object('points');
    final c = j.object('credits');
    final a = j.object('ai');
    return Wallet(
      points: p.integer('total'),
      finished: p.integer('finished'),
      onTime: p.integer('on_time'),
      credits: c.integer('balance'),
      history: c.list('history', CreditEntry.fromJson),
      aiEnabled: a.boolean('enabled'),
      dailyLimit: a.integer('daily_limit'),
      usedToday: a.integer('used_today'),
      costPerQuestion: a.integer('cost_per_question'),
      nextQuestionAt: a.stringOrNull('next_question_at') == null ? null : a.dateTime('next_question_at'),
    );
  }

  final int points;
  final int finished;
  final int onTime;
  final int credits;
  final List<CreditEntry> history;
  final bool aiEnabled;
  final int dailyLimit;
  final int usedToday;
  final int costPerQuestion;
  final DateTime? nextQuestionAt;

  int get questionsLeft => (dailyLimit - usedToday).clamp(0, dailyLimit);
}

final class AIConversation {
  const AIConversation({required this.id, required this.taskId, required this.title, required this.followUps, required this.updatedAt});
  factory AIConversation.fromJson(JsonReader j) => AIConversation(
    id: j.string('id'),
    taskId: j.stringOrNull('task_id'),
    title: j.string('title'),
    followUps: j.integer('follow_ups'),
    updatedAt: j.dateTime('updated_at'),
  );
  final String id;
  final String? taskId;
  final String title;
  final int followUps;
  final DateTime updatedAt;
}

enum AIRole {
  student('student'),
  assistant('assistant');

  AIRole(this.wire);
  final String wire;
}

enum AIMessageStatus {
  pending('pending'),
  answered('answered'),
  failed('failed'),
  ok('ok');

  AIMessageStatus(this.wire);
  final String wire;
}

enum AIMessageKind {
  question('question'),
  followUp('follow_up'),
  answer('answer');

  AIMessageKind(this.wire);
  final String wire;
}

final class AIParts {
  const AIParts({
    required this.goal,
    required this.tried,
    required this.error,
    required this.code,
    required this.triedSince,
    required this.question,
  });
  factory AIParts.fromJson(JsonReader j) => AIParts(
    goal: j.string('goal'),
    tried: j.string('tried'),
    error: j.string('error'),
    code: j.string('code'),
    triedSince: j.string('tried_since'),
    question: j.string('question'),
  );
  final String goal;
  final String tried;
  final String error;
  final String code;
  final String triedSince;
  final String question;
}

final class AIMessage {
  const AIMessage({
    required this.id,
    required this.role,
    required this.status,
    required this.kind,
    required this.body,
    required this.parts,
  });
  factory AIMessage.fromJson(JsonReader j) => AIMessage(
    id: j.string('id'),
    role: j.enumValue('role', AIRole.values, (r) => r.wire),
    status: j.enumValue('status', AIMessageStatus.values, (s) => s.wire),
    kind: j.enumValue('kind', AIMessageKind.values, (k) => k.wire),
    body: j.string('body'),
    parts: switch (j.objectOrNull('parts')) {
      final p? => AIParts.fromJson(p),
      null => null,
    },
  );
  final String id;
  final AIRole role;
  final AIMessageStatus status;
  final AIMessageKind kind;
  final String body;
  final AIParts? parts;
}

final class AIConversationDetail {
  const AIConversationDetail({
    required this.conversation,
    required this.messages,
    required this.followUpsLeft,
    required this.followUpAt,
    required this.wallet,
  });
  factory AIConversationDetail.fromJson(JsonReader j) => AIConversationDetail(
    conversation: AIConversation.fromJson(j.object('conversation')),
    messages: j.list('messages', AIMessage.fromJson),
    followUpsLeft: j.integer('follow_ups_left'),
    followUpAt: j.stringOrNull('follow_up_at') == null ? null : j.dateTime('follow_up_at'),
    wallet: Wallet.fromJson(j.object('wallet')),
  );
  final AIConversation conversation;
  final List<AIMessage> messages;
  final int followUpsLeft;
  final DateTime? followUpAt;
  final Wallet wallet;
}

enum CertificateStatus {
  valid('valid'),
  revoked('revoked');

  CertificateStatus(this.wire);
  final String wire;
}

/// An issued certificate (a snapshot taken at issue time).
final class Certificate {
  const Certificate({
    required this.code,
    required this.studentName,
    required this.githubLogin,
    required this.programDays,
    required this.flowName,
    required this.startDate,
    required this.endDate,
    required this.points,
    required this.tasksDone,
    required this.tasksTotal,
    required this.issuedAt,
    required this.status,
    required this.revokeReason,
  });

  factory Certificate.fromJson(JsonReader j) => Certificate(
    code: j.string('code'),
    studentName: j.string('student_name'),
    githubLogin: j.string('github_login'),
    programDays: j.integer('program_days'),
    flowName: j.stringOrNull('flow_name'),
    startDate: j.string('start_date'),
    endDate: j.string('end_date'),
    points: j.integer('points'),
    tasksDone: j.integer('tasks_done'),
    tasksTotal: j.integer('tasks_total'),
    issuedAt: j.dateTime('issued_at'),
    status: j.enumValue('status', CertificateStatus.values, (s) => s.wire),
    revokeReason: j.stringOrNull('revoke_reason'),
  );

  final String code;
  final String studentName;
  final String githubLogin;
  final int programDays;
  final String? flowName;
  final String startDate;
  final String endDate;
  final int points;
  final int tasksDone;
  final int tasksTotal;
  final DateTime issuedAt;
  final CertificateStatus status;
  final String? revokeReason;

  /// "ABCD-EFGH-JK23": easier to read aloud and type from paper.
  String get displayCode => [for (var i = 0; i < code.length; i += 4) code.substring(i, i + 4 > code.length ? code.length : i + 4)].join('-');
}

/// The student's progress toward a certificate.
final class Progress {
  const Progress({
    required this.released,
    required this.done,
    required this.inReview,
    required this.overdue,
    required this.onTime,
    required this.points,
    required this.dayNumber,
    required this.days,
    required this.completionPercent,
    required this.barPercent,
    required this.meetsBar,
    required this.certificate,
  });

  factory Progress.fromJson(JsonReader j) {
    final c = j.objectOrNull('certificate');
    return Progress(
      released: j.integer('released'),
      done: j.integer('done'),
      inReview: j.integer('in_review'),
      overdue: j.integer('overdue'),
      onTime: j.integer('on_time'),
      points: j.integer('points'),
      dayNumber: j.integer('day_number'),
      days: j.integer('days'),
      completionPercent: j.integer('completion_percent'),
      barPercent: j.integer('bar_percent'),
      meetsBar: j.boolean('meets_bar'),
      certificate: c == null ? null : Certificate.fromJson(c),
    );
  }

  final int released;
  final int done;
  final int inReview;
  final int overdue;
  final int onTime;
  final int points;
  final int dayNumber;
  final int days;
  final int completionPercent;
  final int barPercent;
  final bool meetsBar;
  final Certificate? certificate;
}
