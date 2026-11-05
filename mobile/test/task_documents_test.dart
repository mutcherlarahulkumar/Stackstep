import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/api_client.dart';
import 'package:stackstep/api/json.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/api/validation.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/features/admin/assign_screen.dart';
import 'package:stackstep/features/ai/markdown_view.dart';
import 'package:stackstep/features/chat/inbox_controller.dart';
import 'package:stackstep/features/tasks/task_documents.dart';

import 'fixtures.dart';

Iterable<TextSpan> spans(InlineSpan span) sync* {
  if (span is! TextSpan) return;
  yield span;
  for (final child in span.children ?? const <InlineSpan>[]) {
    yield* spans(child);
  }
}

void main() {
  test('authored reading decodes strictly while old tasks still work', () {
    for (final content in <Json>[
      {'resources': <Object?>[], 'quiz': null},
      {'resources': <Object?>[], 'quiz': null, 'documents': null},
    ]) {
      expect(TaskContent.fromJson(JsonReader(content)).documents, isEmpty);
    }
    const body = '\n## Understand the task\n\n```js\nconst items = [];\n```\n';
    final content = TaskContent.fromJson(
      const JsonReader({
        'resources': <Object?>[],
        'quiz': null,
        'documents': [
          {'title': 'Filtering guide', 'body': body},
        ],
      }),
    );
    expect(content.documents.single.title, 'Filtering guide');
    expect(content.documents.single.body, body);
    for (final malformed in <Object?>[
      'not an array',
      [null],
      [{'title': 'Missing body'}],
      [{'title': 42, 'body': 'text'}],
      [{'title': 'Wrong body', 'body': true}],
    ]) {
      expect(
        () => TaskContent.fromJson(JsonReader({'resources': <Object?>[], 'quiz': null, 'documents': malformed})),
        throwsA(isA<ContractViolation>()),
      );
    }
  });

  test('reading validation counts raw Unicode text and preserves Markdown whitespace', () {
    expect(validateDocument(title: '', body: ''), (title: null, body: null));
    expect(validateDocument(title: '', body: 'A guide').title, isNotNull);
    expect(validateDocument(title: 'A guide', body: ' \n ').body, isNotNull);
    expect(validateDocument(title: '📚' * 80, body: 'é' * 20000), (title: null, body: null));
    expect(validateDocument(title: 'x' * 81, body: 'A guide').title, isNotNull);
    expect(validateDocument(title: 'A\u0085guide', body: 'Text').title, isNotNull);
    expect(validateDocument(title: 'A\u2028guide', body: 'Text').title, isNotNull);
    expect(validateDocument(title: 'A\n\tguide', body: 'Text').title, isNull);
    expect(validateDocument(title: 'A guide', body: ' ${'x' * 20000}').body, isNotNull);
    expect(validateDocument(title: 'A guide', body: '\u0001Text').body, isNotNull);
    expect(validateDocument(title: '  A   guide  ', body: '\n    indented code\n'), (title: null, body: null));
  });

  test('task creation sends reading bodies unchanged and defaults to no reading', () async {
    final sent = <Json>[];
    final api = ApiClient(
      baseUrl: Uri.parse('http://api.test'),
      tokenStore: MemoryTokenStore()..value = 'refresh',
      httpClient: MockClient((request) async {
        if (request.url.path == '/v1/auth/refresh') {
          return http.Response(jsonEncode(tokensJson()), 200, headers: {'content-type': 'application/json'});
        }
        sent.add(jsonDecode(request.body) as Json);
        return http.Response(jsonEncode(taskJson()), 201, headers: {'content-type': 'application/json'});
      }),
    );
    final input = (
      type: TaskType.docReading,
      personaId: null,
      reviewMode: ReviewMode.self,
      title: 'Read the guide',
      brief: 'Explain the idea in your own words.',
      scheduledFor: null,
      dueAt: DateTime.utc(2026, 11, 7),
      resources: const <Resource>[],
    );
    const document = TaskDocument(title: 'A guide', body: '\n    indented example\n');
    await api.createTask('enrollment-1', input, documents: const [document]);
    await api.createTask('enrollment-1', input);
    expect((sent.first['content']! as Json)['documents'], [
      {'title': document.title, 'body': document.body},
    ]);
    expect((sent.last['content']! as Json)['documents'], isEmpty);
  });

  testWidgets('reading opens inside the app and Back restores the task', (tester) async {
    await tester.pumpWidget(
      const ShadApp(
        home: Scaffold(
          body: TaskDocuments(
            documents: [TaskDocument(title: 'Filtering guide', body: '## Try it\n\nFilter by `status`.')],
          ),
        ),
      ),
    );
    await tester.tap(find.byKey(const Key('task-document-0')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('task-document-reader')), findsOneWidget);
    expect(find.text('Try it'), findsOneWidget);
    expect(find.textContaining('Filter by '), findsOneWidget);
    expect(find.textContaining('## Try it'), findsNothing);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('task-document-reader')), findsNothing);
    expect(find.byKey(const Key('task-document-0')), findsOneWidget);
  });

  testWidgets('phone author previews a reading and assigns its original Markdown', (tester) async {
    Json? sent;
    final api = ApiClient(
      baseUrl: Uri.parse('http://api.test'),
      tokenStore: MemoryTokenStore()..value = 'refresh',
      httpClient: MockClient((request) async {
        if (request.url.path == '/v1/auth/refresh') {
          return http.Response(jsonEncode(tokensJson()), 200, headers: {'content-type': 'application/json'});
        }
        sent = jsonDecode(request.body) as Json;
        return http.Response(jsonEncode(taskJson()), 201, headers: {'content-type': 'application/json'});
      }),
    );
    final student = StudentRow.fromJson(
      JsonReader({'user': userJson(), 'enrollment': enrollmentJson(), 'open_tasks': 0, 'in_review': 0}),
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(api),
          clockProvider.overrideWithValue(() => DateTime(2026, 11, 4, 10)),
          personasProvider.overrideWith((ref) async => [Persona.fromJson(JsonReader(personaJson()))]),
        ],
        child: ShadApp(home: AssignTaskScreen(student: student)),
      ),
    );
    await tester.pumpAndSettle();
    final scroll = find.descendant(of: find.byKey(const Key('assign-form')), matching: find.byType(Scrollable)).first;
    Future<void> enter(String key, String value) async {
      await tester.scrollUntilVisible(find.byKey(Key(key)), 250, scrollable: scroll);
      await tester.enterText(find.descendant(of: find.byKey(Key(key)), matching: find.byType(EditableText)), value);
      await tester.pump();
    }

    await enter('task-title', 'Build a useful filter');
    await enter('task-document-title', '  Filtering   guide  ');
    const body = '\n## A runnable example\n\n    const result = items.filter(matches);\n';
    await enter('task-document-body', body);
    await tester.scrollUntilVisible(find.byKey(const Key('task-document-preview')), 200, scrollable: scroll);
    await tester.tap(find.byKey(const Key('task-document-preview')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('task-document-reader')), findsOneWidget);
    expect(find.text('A runnable example'), findsOneWidget);
    expect(sent, isNull);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('assign-submit')), 300, scrollable: scroll);
    await tester.tap(find.byKey(const Key('assign-submit')));
    await tester.pumpAndSettle();
    expect((sent?['content'] as Json?)?['documents'], [
      {'title': 'Filtering guide', 'body': body},
    ]);
    expect(find.text('Task assigned'), findsOneWidget);
  });

  testWidgets('reading tables, checklists and long code fit a phone without external links or images', (tester) async {
    tester.view.physicalSize = const Size(320, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      const ShadApp(
        home: TaskDocumentScreen(
          document: TaskDocument(
            title: 'Your reading',
            body: '# Start here\n\n'
                '- [x] Read the brief\n- [ ] Try the example\n\n'
                '| Input | Result |\n| --- | --- |\n| Empty list | No matches |\n\n'
                '> Keep the original list unchanged.\n\n'
                '```js\nconst longExample = "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz";\n```\n\n'
                '[Reference](https://example.com) [Unsafe](javascript:alert(1))\n\n'
                '![Remote image](https://example.com/image.png)',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(Table), findsOneWidget);
    expect(find.byIcon(Icons.check_box_outlined), findsOneWidget);
    expect(find.byIcon(Icons.check_box_outline_blank), findsOneWidget);
    expect(find.text('Keep the original list unchanged.'), findsOneWidget);
    expect(find.byType(Image), findsNothing);
    expect(
      tester.widgetList<RichText>(find.byType(RichText)).expand((text) => spans(text.text)).where((span) => span.recognizer != null),
      isEmpty,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('shared Markdown permits only safe links and disposes link recognizers on rebuild', (tester) async {
    await tester.pumpWidget(
      const ShadApp(home: Scaffold(body: MarkdownView('[Safe](https://example.com) [Unsafe](javascript:alert(1))'))),
    );
    final interactive = tester.widgetList<RichText>(find.byType(RichText)).expand((text) => spans(text.text)).where((span) => span.recognizer != null);
    expect(interactive.map((span) => span.text), ['Safe']);
    await tester.pumpWidget(const ShadApp(home: Scaffold(body: MarkdownView('No link now.'))));
    expect(tester.takeException(), isNull);
  });
}
