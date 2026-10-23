// Runs the app's real API client against a running backend, so strict decoding is checked
// against what the server actually sends (not hand-written fixtures).
//
//   STACKSTEP_LIVE_API=http://localhost:8080 flutter test test/live
//
// Needs a freshly seeded database (`seed -reset`). Skipped when the variable isn't set.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:stackstep/api/api_client.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/api/realtime.dart';
import 'package:uuid/uuid.dart';

final String? _base = Platform.environment['STACKSTEP_LIVE_API'];
const _lead = '00000000-0000-4000-8000-000000000001';
const _manager = '00000000-0000-4000-8000-0000000000a1';
const _uuid = Uuid();

Future<ApiClient> _signIn(String login) async {
  final api = ApiClient(baseUrl: Uri.parse(_base!), tokenStore: MemoryTokenStore());
  await api.devLogin(login);
  return api;
}

Uri _ws() {
  final u = Uri.parse(_base!);
  return u.replace(scheme: u.scheme == 'https' ? 'wss' : 'ws', path: '${u.path}/v1/ws');
}

void main() {
  // flutter_test blocks real HTTP only once a widget binding exists; plain tests talk to the network.
  group('live API', skip: _base == null ? 'set STACKSTEP_LIVE_API to run' : null, () {
    test('student: me, board, persona threads, send and read', () async {
      final api = await _signIn('asha-dev');
      final me = await api.me();
      expect(me.user.githubLogin, 'asha-dev');
      expect(me.enrollment?.status, EnrollmentStatus.active);

      await api.myTasks(); // decodes every task the server returns
      final threads = await api.threads();
      final lead = threads.firstWhere((t) => t.persona.id == _lead);
      expect(lead.lastMessage, isNotNull);

      final page = await api.messages(_lead);
      expect(page.items, isNotEmpty);
      final clientId = _uuid.v4();
      final sent = await api.sendMessage(_lead, clientId: clientId, body: 'Live test from the app');
      expect(sent.author, Author.student);
      // Same client id: the server returns the stored message instead of a duplicate.
      final again = await api.sendMessage(_lead, clientId: clientId, body: 'Live test from the app');
      expect(again.id, sent.id);
      await api.markRead(_lead);
      expect((await api.threads()).firstWhere((t) => t.persona.id == _lead).unread, 0);
    });

    test('student: validation errors come back typed', () async {
      final api = await _signIn('asha-dev');
      await expectLater(
        api.sendMessage(_lead, clientId: _uuid.v4(), body: 'x' * 4001),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', ErrorCode.validationFailed)),
      );
    });

    test('admin: assign as a persona, the student sees it and finishes a self-check task', () async {
      final admin = await _signIn('admin-demo');
      final personas = await admin.personas();
      expect(personas.map((p) => p.id), containsAll([_lead, _manager]));
      final students = await admin.students(query: 'asha');
      final asha = students.items.single;

      final now = DateTime.now().toUtc();
      final title = 'Live self-check ${now.millisecondsSinceEpoch}';
      final task = await admin.createTask(asha.enrollment.id, (
        type: TaskType.docReading,
        personaId: _manager,
        reviewMode: ReviewMode.self,
        title: title,
        brief: 'Read and mark done.',
        scheduledFor: null,
        dueAt: now.add(const Duration(hours: 2)),
      ));
      expect(task.personaId, _manager);
      expect(task.reviewMode, ReviewMode.self);

      final student = await _signIn('asha-dev');
      final mine = (await student.myTasks()).firstWhere((t) => t.id == task.id);
      final started = await student.transition(taskId: mine.id, to: TaskStatus.inProgress, expectedVersion: mine.version);
      final done = await student.transition(taskId: mine.id, to: TaskStatus.done, expectedVersion: started.version);
      expect(done.status, TaskStatus.done);

      // The engineering manager announced it in their own conversation.
      final thread = (await student.threads()).firstWhere((t) => t.persona.id == _manager);
      expect((await student.messages(_manager)).items.any((m) => m.body.contains(title)), isTrue);
      expect(thread.persona.name, isNotEmpty);

      // Admin inbox sees that conversation and can reply as the persona.
      final inbox = await admin.staffThreads(personaId: _manager);
      final row = inbox.items.firstWhere((t) => t.enrollmentId == asha.enrollment.id);
      expect(row.studentLogin, 'asha-dev');
      final reply = await admin.staffSend(asha.enrollment.id, _manager, clientId: _uuid.v4(), body: 'Nice work.');
      expect(reply.author, Author.persona);
      await admin.staffMarkRead(asha.enrollment.id, _manager);

      final outcome = await admin.broadcast(
        personaId: _manager,
        clientId: _uuid.v4(),
        enrollmentIds: [asha.enrollment.id],
        body: 'Live broadcast',
      );
      expect(outcome.sent, 1);
      expect(outcome.failed, 0);
    });

    test('realtime: the socket says ready and pushes new messages', () async {
      final student = await _signIn('asha-dev');
      final rt = Realtime(wsUrl: _ws(), token: student.accessTokenForSocket)..start();
      addTearDown(rt.dispose);
      await rt.frames.firstWhere((f) => f is ReadyFrame).timeout(const Duration(seconds: 10));

      final admin = await _signIn('admin-demo');
      final asha = (await admin.students(query: 'asha')).items.single;
      final body = 'Live frame ${DateTime.now().millisecondsSinceEpoch}';
      final next = rt.frames.firstWhere((f) => f is MessageFrame && f.message.body == body).timeout(const Duration(seconds: 10));
      await admin.staffSend(asha.enrollment.id, _lead, clientId: _uuid.v4(), body: body);
      expect(await next, isA<MessageFrame>());
    });
  });
}
