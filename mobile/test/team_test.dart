import 'package:flutter_test/flutter_test.dart';
import 'package:stackstep/api/json.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/shared/team.dart';

const sam = Persona(id: 'sam', name: 'Sam Rivera', title: 'Team Lead', color: PersonaColor.violet, autoReply: true, archived: false);
const priya = Persona(
  id: 'priya',
  name: 'Priya Sharma',
  title: 'Engineering Manager',
  color: PersonaColor.emerald,
  autoReply: false,
  archived: false,
);

Message msg(String? speaker) => Message(
  id: 'm',
  enrollmentId: 'e',
  personaId: 't',
  author: Author.persona,
  body: 'hi',
  taskId: null,
  clientId: null,
  sentAt: DateTime(2026),
  automated: true,
  speakerId: speaker,
);

void main() {
  test('TR3/TR4: finds who spoke in the team room', () {
    const team = Team(members: [sam, priya], botName: 'Stackbot', botTitle: 'AI teammate');
    expect(speakerOf(msg(null), team).name, 'Stackbot');
    expect(speakerOf(msg('sam'), team).persona, sam);
    expect(speakerOf(msg('gone'), team).name, 'A former teammate');
  });

  test('suggests and inserts @mentions', () {
    expect(mentionQuery('hey @pr'), 'pr');
    expect(mentionQuery('@'), '');
    expect(mentionQuery('mail a@b'), isNull);
    expect(mentionQuery('@sam done'), isNull);
    expect(mentionMatches('pr', [sam, priya]), [priya]);
    expect(mentionMatches('team', [sam, priya]), [sam]);
    expect(insertMention('hey @pr', priya), 'hey @Priya ');
  });

  test('team room persona and speaker decode from JSON', () {
    final m = Message.fromJson(
      const JsonReader({
        'id': 'm',
        'enrollment_id': 'e',
        'persona_id': 't',
        'author': 'persona',
        'body': 'x',
        'task_id': null,
        'client_id': null,
        'sent_at': '2026-11-04T04:30:00Z',
        'automated': true,
        'reactions': <Object?>[],
        'speaker_id': 'sam',
      }),
    );
    expect(m.speakerId, 'sam');
  });
}
