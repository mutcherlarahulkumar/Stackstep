import 'package:stackstep/api/json.dart';

Json userJson({String role = 'student', String login = 'asha-dev', String name = 'Asha Rao'}) => {
  'id': 'u-1',
  'github_login': login,
  'name': name,
  'email': null,
  'avatar_url': null,
  'role': role,
  'college_id': null,
};

Json enrollmentJson({String status = 'active', int day = 3}) => {
  'id': 'e-1',
  'program': {'slug': 'frontend-30', 'days': 30, 'track': 'frontend'},
  'start_date': '2026-11-02',
  'end_date': '2026-12-01',
  'timezone': 'Asia/Kolkata',
  'status': status,
  'day_number': day,
};

Json taskJson({
  String id = 't-1',
  String status = 'todo',
  String due = '2026-11-04T12:00:00Z',
  int version = 1,
  String title = 'Add filtering',
  String reviewMode = 'manual',
  String personaId = leadId,
  String type = 'feature',
  Json? content,
  Json? quizResult,
}) => {
  'id': id,
  'enrollment_id': 'e-1',
  'type': type,
  'title': title,
  'brief': 'Use Array.filter.',
  'status': status,
  'scheduled_for': '2026-11-04T04:30:00Z',
  'due_at': due,
  'version': version,
  'created_at': '2026-11-04T04:30:00Z',
  'updated_at': '2026-11-04T04:30:00Z',
  'review_mode': reviewMode,
  'persona_id': personaId,
  'from_flow': false,
  'content': content ?? {'resources': <Object?>[], 'quiz': null},
  'submission': null,
  'quiz_result': quizResult,
};

Json messageJson({
  String id = 'm-1',
  String author = 'persona',
  String body = 'Hi',
  String sentAt = '2026-11-04T04:30:00Z',
  String? clientId,
  String personaId = leadId,
  String enrollmentId = 'e-1',
}) => {
  'id': id,
  'enrollment_id': enrollmentId,
  'persona_id': personaId,
  'author': author,
  'body': body,
  'task_id': null,
  'client_id': clientId,
  'sent_at': sentAt,
};

const leadId = '00000000-0000-4000-8000-000000000001';
const managerId = '00000000-0000-4000-8000-0000000000a1';

Json personaJson({String id = leadId, String name = 'Sam Rivera', String title = 'Team Lead', String color = 'violet'}) => {
  'id': id,
  'name': name,
  'title': title,
  'color': color,
  'auto_reply': id == leadId,
  'archived': false,
};

Json threadJson({Json? persona, Json? last, int unread = 0, String enrollmentId = 'e-1', Json? student}) => {
  'enrollment_id': enrollmentId,
  'persona': persona ?? personaJson(),
  'last_message': last,
  'unread': unread,
  'student': ?student,
};

Json tokensJson({String access = 'access-1', String refresh = 'refresh-1', String exp = '2999-01-01T00:00:00Z'}) => {
  'access_token': access,
  'access_expires_at': exp,
  'refresh_token': refresh,
  'refresh_expires_at': '2999-02-01T00:00:00Z',
};

Map<String, Object?> accountJson({bool consentRequired = false, bool onboarded = true}) => {
  'terms_version': 1,
  'consent_required': consentRequired,
  'onboarded': onboarded,
};
