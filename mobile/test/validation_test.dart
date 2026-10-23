import 'package:flutter_test/flutter_test.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/api/validation.dart';

void main() {
  test('title bounds mirror the server', () {
    expect(validateTitle('  '), isNotNull);
    expect(validateTitle('ab'), isNotNull);
    expect(validateTitle('abc'), isNull);
    expect(validateTitle('é' * 120), isNull);
    expect(validateTitle('a' * 121), isNotNull);
    expect(validateTitle('bad\u0007title'), isNotNull);
    expect(validateTitle('  many    spaces  '), isNull);
  });

  test('message bounds', () {
    expect(validateMessage(' \n '), isNotNull);
    expect(validateMessage('x' * 4000), isNull);
    expect(validateMessage('x' * 4001), isNotNull);
    expect(validateMessage('line one\nline two'), isNull);
  });

  test('brief and note', () {
    expect(validateBrief('b' * 8000), isNull);
    expect(validateBrief('b' * 8001), isNotNull);
    expect(validateNote('', TaskStatus.changesRequested), isNotNull);
    expect(validateNote('', TaskStatus.done), isNull);
    expect(validateNote('n' * 2001, TaskStatus.done), isNotNull);
  });

  test('schedule rules', () {
    final now = DateTime.utc(2026, 11, 4, 10);
    expect(validateSchedule(now: now, scheduledFor: null, dueAt: now.add(const Duration(minutes: 15))).dueAt, isNull);
    expect(validateSchedule(now: now, scheduledFor: null, dueAt: now.add(const Duration(minutes: 14))).dueAt, isNotNull);
    expect(validateSchedule(now: now, scheduledFor: null, dueAt: null).dueAt, isNotNull);
    expect(
      validateSchedule(
        now: now,
        scheduledFor: now.subtract(const Duration(minutes: 6)),
        dueAt: now.add(const Duration(hours: 1)),
      ).scheduledFor,
      isNotNull,
    );
    expect(
      validateSchedule(
        now: now,
        scheduledFor: now.subtract(const Duration(minutes: 4)),
        dueAt: now.add(const Duration(hours: 1)),
      ).scheduledFor,
      isNull,
    );
  });

  test('student moves follow the server graph', () {
    expect(studentMoves(TaskStatus.todo), [TaskStatus.inProgress]);
    expect(studentMoves(TaskStatus.inProgress), [TaskStatus.inReview]);
    expect(studentMoves(TaskStatus.changesRequested), containsAll([TaskStatus.inReview, TaskStatus.inProgress]));
    for (final s in [TaskStatus.inReview, TaskStatus.done, TaskStatus.cancelled]) {
      expect(studentMoves(s), isEmpty, reason: s.wire);
    }
    // Self-reviewed tasks skip review: the student finishes them.
    expect(studentMoves(TaskStatus.inProgress, ReviewMode.self), [TaskStatus.done]);
    expect(studentMoves(TaskStatus.todo, ReviewMode.self), [TaskStatus.inProgress]);
  });

  test('links and hand-ins mirror the server (R1, S1)', () {
    for (final ok in ['https://go.dev/doc', 'http://localhost:3000/x']) {
      expect(validUrl(ok), isTrue, reason: ok);
    }
    for (final bad in ['javascript:alert(1)', 'ftp://x.org', 'https://', 'go.dev', 'https://a b.com', 'https://u:p@x.com']) {
      expect(validUrl(bad), isFalse, reason: bad);
    }
    expect(validateLink(name: '', url: '').url, isNull);
    expect(validateLink(name: '', url: 'https://go.dev').name, isNotNull);
    expect(validateLink(name: 'Go', url: 'nope').url, isNotNull);
    expect(validateSubmission(url: '', note: '', type: TaskType.feature, required: true)['url'], isNotNull);
    expect(validateSubmission(url: '', note: '', type: TaskType.dsa, required: true)['note'], isNotNull);
    expect(validateSubmission(url: '', note: 'Hash map', type: TaskType.dsa, required: true), isEmpty);
    expect(validateSubmission(url: 'https://x.dev', note: 'x' * 4001, type: TaskType.feature, required: true)['note'], isNotNull);
  });
}
