import 'package:flutter_test/flutter_test.dart';
import 'package:stackstep/api/json.dart';
import 'package:stackstep/api/models.dart';

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
      final withE = Me.fromJson(JsonReader({'user': userJson(), 'enrollment': enrollmentJson()}));
      expect(withE.enrollment?.dayNumber, 3);
      final without = Me.fromJson(JsonReader({'user': userJson(role: 'admin'), 'enrollment': null}));
      expect(without.enrollment, isNull);
      expect(without.user.role.isStaff, isTrue);
    });

    test('frames', () {
      expect(Frame.fromJson(const JsonReader({'type': 'ready'})), isA<ReadyFrame>());
      expect(Frame.fromJson(JsonReader({'type': 'message', 'message': messageJson()})), isA<MessageFrame>());
      expect(Frame.fromJson(JsonReader({'type': 'task', 'task': taskJson()})), isA<TaskFrame>());
      expect(() => Frame.fromJson(const JsonReader({'type': 'typing'})), throwsA(isA<ContractViolation>()));
    });

    test('every server error code is known', () {
      const wire = [
        'bad_request', 'payload_too_large', 'unauthenticated', 'forbidden', 'not_found', 'validation_failed',
        'invalid_transition', 'version_conflict', 'enrollment_not_active', 'no_active_enrollment', 'rate_limited',
        'invalid_state', 'invalid_code', 'not_configured', 'internal',
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
  });
}
