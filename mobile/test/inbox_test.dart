import 'package:flutter_test/flutter_test.dart';
import 'package:stackstep/api/json.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/features/chat/inbox_controller.dart';
import 'package:stackstep/shared/format.dart';

import 'fixtures.dart';

Thread thread({String persona = leadId, String name = 'Sam Rivera', Json? last, int unread = 0, String enrollment = 'e-1'}) =>
    Thread.fromJson(
      JsonReader(
        threadJson(
          persona: personaJson(id: persona, name: name),
          last: last,
          unread: unread,
          enrollmentId: enrollment,
        ),
      ),
    );

Message message({String id = 'm-9', String author = 'persona', String persona = leadId, String at = '2026-11-04T10:00:00Z'}) =>
    Message.fromJson(JsonReader(messageJson(id: id, author: author, personaId: persona, sentAt: at)));

void main() {
  final lead = thread(
    last: messageJson(id: 'm-1', sentAt: '2026-11-04T09:00:00Z'),
  );
  final manager = thread(
    persona: managerId,
    name: 'Priya Sharma',
    last: messageJson(id: 'm-2', personaId: managerId),
  );

  test('a persona message moves its thread to the top and counts as unread for the student', () {
    final next = applyMessage([manager, lead], message(), staff: false)!;
    expect(next.map((t) => t.persona.id), [leadId, managerId]);
    expect(next.first.unread, 1);
    expect(next.first.lastMessage?.id, 'm-9');
  });

  test("the student's own message does not count as unread for them, but does for staff", () {
    final mine = message(author: 'student');
    expect(applyMessage([lead], mine, staff: false)!.first.unread, 0);
    expect(applyMessage([lead], mine, staff: true)!.first.unread, 1);
  });

  test('duplicate and older frames leave the list unchanged', () {
    final list = [lead];
    expect(identical(applyMessage(list, message(id: 'm-1'), staff: false), list), isTrue);
    expect(identical(applyMessage(list, message(id: 'm-0', at: '2026-11-04T08:00:00Z'), staff: false), list), isTrue);
  });

  test('a message for an unknown thread asks the caller to refetch', () {
    expect(applyMessage([lead], message(persona: managerId), staff: false), isNull);
    final otherStudent = Message.fromJson(JsonReader(messageJson(id: 'x', enrollmentId: 'e-2')));
    expect(applyMessage([lead], otherStudent, staff: true), isNull);
  });

  test('clearing unread touches only the target thread', () {
    final list = [thread(unread: 3), thread(persona: managerId, unread: 2)];
    final cleared = clearUnread(list, (personaId: leadId, enrollmentId: null));
    expect(cleared.map((t) => t.unread), [0, 2]);
    expect(totalUnread(cleared), 2);
    final staff = clearUnread([thread(unread: 1), thread(unread: 4, enrollment: 'e-2')], (personaId: leadId, enrollmentId: 'e-2'));
    expect(staff.map((t) => t.unread), [1, 0]);
  });

  test('chat targets decide whose bubbles are "mine"', () {
    const student = (personaId: leadId, enrollmentId: null);
    const staff = (personaId: leadId, enrollmentId: 'e-1');
    final fromPersona = message();
    expect(student.isMine(fromPersona), isFalse);
    expect(staff.isMine(fromPersona), isTrue);
    expect(student.contains(message(persona: managerId)), isFalse);
    expect(const (personaId: leadId, enrollmentId: 'e-2').contains(fromPersona), isFalse);
  });

  test('persona initials and strict decoding', () {
    expect(Persona.fromJson(JsonReader(personaJson(name: 'Priya  Sharma'))).initials, 'PS');
    expect(Persona.fromJson(JsonReader(personaJson(name: 'Neha'))).initials, 'N');
    expect(() => Persona.fromJson(JsonReader(personaJson(color: 'pink'))), throwsA(isA<ContractViolation>()));
  });

  test('inbox labels', () {
    final now = DateTime(2026, 11, 4, 18);
    expect(inboxTimeLabel(DateTime(2026, 11, 3, 9), now), 'Yesterday');
    expect(previewLine('line one\n\nline   two'), 'line one line two');
    expect(previewLine('x' * 200).runes.length, 90);
  });
}
