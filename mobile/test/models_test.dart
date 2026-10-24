import 'package:flutter_test/flutter_test.dart';
import 'package:stackstep/api/json.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/shared/format.dart';

import 'fixtures.dart';

void main() {
  group('strict decoding', () {
    test('parses a valid task', () {
      final t = Task.fromJson(JsonReader(taskJson(status: 'changes_requested')));
      expect(t.status, TaskStatus.changesRequested);
      expect(t.type, TaskType.feature);
      expect(t.dueAt.isUtc, isTrue);
    });

    test('rejects an unknown enum value', () {
      expect(() => Task.fromJson(JsonReader({...taskJson(), 'status': 'archived'})), throwsA(isA<ContractViolation>()));
    });

    test('rejects a missing field', () {
      expect(() => Task.fromJson(JsonReader({...taskJson()}..remove('version'))), throwsA(isA<ContractViolation>()));
    });

    test('rejects a wrong type', () {
      expect(() => Task.fromJson(JsonReader({...taskJson(), 'version': '1'})), throwsA(isA<ContractViolation>()));
    });

    test('rejects a bad timestamp', () {
      expect(() => Task.fromJson(JsonReader({...taskJson(), 'due_at': 'tomorrow'})), throwsA(isA<ContractViolation>()));
    });

    test('program days must be 30 or 60', () {
      final bad = enrollmentJson()..['program'] = {'slug': 'x', 'days': 45, 'track': 'frontend'};
      expect(() => Enrollment.fromJson(JsonReader(bad)), throwsA(isA<ContractViolation>()));
    });

    test('me with and without enrollment', () {
      final withE = Me.fromJson(JsonReader({'user': userJson(), 'enrollment': enrollmentJson(), 'account': accountJson()}));
      expect(withE.enrollment?.dayNumber, 3);
      final without = Me.fromJson(
        JsonReader({'user': userJson(role: 'admin'), 'enrollment': null, 'account': accountJson(consentRequired: true)}),
      );
      expect(without.enrollment, isNull);
      expect(without.user.role.isStaff, isTrue);
      expect(without.account.consentRequired, isTrue);
      expect(without.withAccount(Account.fromJson(JsonReader(accountJson()))).account.consentRequired, isFalse);
      // The account block is required, so an older API can't skip the consent step (AC6).
      expect(() => Me.fromJson(JsonReader({'user': userJson(), 'enrollment': null})), throwsA(isA<ContractViolation>()));
    });

    test('persona tag says who is behind a persona (PT1)', () {
      expect(personaTag(Persona.fromJson(JsonReader({...personaJson(), 'auto_reply': true}))), 'Mentor · some replies automatic');
      expect(personaTag(Persona.fromJson(JsonReader({...personaJson(), 'auto_reply': false}))), 'Played by a mentor');
    });

    test('frames', () {
      expect(Frame.fromJson(const JsonReader({'type': 'ready'})), isA<ReadyFrame>());
      expect(Frame.fromJson(JsonReader({'type': 'message', 'message': messageJson()})), isA<MessageFrame>());
      expect(Frame.fromJson(JsonReader({'type': 'task', 'task': taskJson()})), isA<TaskFrame>());
      expect(() => Frame.fromJson(const JsonReader({'type': 'typing'})), throwsA(isA<ContractViolation>()));
    });

    test('every server error code is known', () {
      const wire = [
        'bad_request',
        'payload_too_large',
        'unauthenticated',
        'forbidden',
        'not_found',
        'validation_failed',
        'invalid_transition',
        'version_conflict',
        'enrollment_not_active',
        'no_active_enrollment',
        'rate_limited',
        'invalid_state',
        'invalid_code',
        'not_configured',
        'insufficient_credits',
        'ai_unavailable',
        'internal',
      ];
      for (final w in wire) {
        expect(ErrorCode.fromWire(w), isNotNull, reason: w);
      }
      expect(ErrorCode.values.length, wire.length);
    });

    test('user initials', () {
      expect(User.fromJson(JsonReader(userJson(name: 'Asha  Rao'))).initials, 'AR');
      expect(User.fromJson(JsonReader(userJson(name: 'Asha'))).initials, 'A');
    });

    test('quiz content: students get null answers; stats decode strictly', () {
      final t = Task.fromJson(
        JsonReader(
          taskJson(
            type: 'quiz',
            reviewMode: 'self',
            content: {
              'resources': [
                {'title': 'Pro Git', 'url': 'https://git-scm.com/book'},
              ],
              'quiz': {
                'pass_percent': 70,
                'questions': [
                  {
                    'prompt': 'What does git add do?',
                    'options': ['Commits', 'Stages'],
                    'answer': null,
                  },
                ],
              },
            },
            quizResult: {
              'attempts': 1,
              'attempts_left': 2,
              'best_score': 0,
              'passed': false,
              'last_correct': [false],
            },
          ),
        ),
      );
      expect(t.isQuiz, isTrue);
      expect(t.content.quiz!.questions.single.answer, isNull);
      expect(t.content.resources.single.title, 'Pro Git');
      expect(t.quizFinished, isFalse);
      final bad = taskJson(content: {'resources': 'nope', 'quiz': null});
      expect(() => Task.fromJson(JsonReader(bad)), throwsA(isA<ContractViolation>()));
    });
  });
}
