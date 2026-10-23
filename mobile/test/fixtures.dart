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

Json taskJson({String id = 't-1', String status = 'todo', String due = '2026-11-04T12:00:00Z', int version = 1, String title = 'Add filtering'}) => {
  'id': id,
  'enrollment_id': 'e-1',
  'type': 'feature',
  'title': title,
  'brief': 'Use Array.filter.',
  'status': status,
  'scheduled_for': '2026-11-04T04:30:00Z',
  'due_at': due,
  'version': version,
  'created_at': '2026-11-04T04:30:00Z',
  'updated_at': '2026-11-04T04:30:00Z',
};

Json messageJson({String id = 'm-1', String author = 'lead', String body = 'Hi', String sentAt = '2026-11-04T04:30:00Z', String? clientId}) => {
  'id': id,
  'author': author,
  'body': body,
  'task_id': null,
  'client_id': clientId,
  'sent_at': sentAt,
};

Json tokensJson({String access = 'access-1', String refresh = 'refresh-1', String exp = '2999-01-01T00:00:00Z'}) => {
  'access_token': access,
  'access_expires_at': exp,
  'refresh_token': refresh,
  'refresh_expires_at': '2999-02-01T00:00:00Z',
};
