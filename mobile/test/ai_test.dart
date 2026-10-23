import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/json.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/features/ai/ai_controller.dart';
import 'package:stackstep/features/ai/ai_screen.dart';
import 'package:stackstep/features/ai/markdown_view.dart';

Json walletJson({bool enabled = true, int balance = 19, String? nextQuestionAt}) => {
  'points': {'total': 25, 'finished': 1, 'on_time': 1},
  'credits': {
    'balance': balance,
    'history': [
      {'id': 1, 'delta': -1, 'reason': 'ai_question', 'note': 'x', 'task_id': null, 'created_at': '2026-11-04T04:30:00Z'},
    ],
  },
  'ai': {'enabled': enabled, 'daily_limit': 8, 'used_today': 1, 'cost_per_question': 1, 'next_question_at': nextQuestionAt},
};

Widget host(Widget child, {required Wallet wallet}) => ProviderScope(
  overrides: [
    walletProvider.overrideWith((ref) async => wallet),
    aiConversationsProvider.overrideWith((ref) async => const <AIConversation>[]),
  ],
  child: ShadApp(home: child),
);

void main() {
  test('wallet decodes strictly; unknown credit reasons are rejected', () {
    final w = Wallet.fromJson(JsonReader(walletJson()));
    expect(w.credits, 19);
    expect(w.questionsLeft, 7);
    expect(w.history.single.reason, CreditReason.aiQuestion);
    final bad = walletJson();
    ((bad['credits']! as Json)['history']! as List<Object?>)[0] = {
      'id': 1,
      'delta': 1,
      'reason': 'bonus',
      'note': '',
      'task_id': null,
      'created_at': '2026-11-04T04:30:00Z',
    };
    expect(() => Wallet.fromJson(JsonReader(bad)), throwsA(isA<ContractViolation>()));
  });

  test('questions must be explained in one go; follow-ups say what was tried (A1, A4)', () {
    expect(validateAIQuestion(goal: 'fix it', tried: 'nothing', error: '', code: '').keys, containsAll(['goal', 'tried']));
    expect(
      validateAIQuestion(
        goal: 'Filter the task list by status without a reload.',
        tried: 'I used Array.filter and logged the result; it is right but the list does not change.',
        error: '',
        code: '',
      ),
      isEmpty,
    );
    expect(validateAIFollowUp(triedSince: '', body: 'Why?').keys, containsAll(['tried_since', 'body']));
    final now = DateTime.utc(2026, 11, 4, 10);
    expect(countdown(now.add(const Duration(minutes: 4, seconds: 5)), now), '4:05');
    expect(countdown(now.subtract(const Duration(seconds: 1)), now), isNull);
  });

  test('bold-only lines become headings', () {
    expect(sectionHeadings('**Hints**\n1. Look **here**'), '#### Hints\n1. Look **here**');
  });

  testWidgets('answers render as formatted Markdown, never raw markup', (tester) async {
    await tester.pumpWidget(
      const ShadApp(
        home: Scaffold(
          body: MarkdownView(
            "**What's going on**\nThe list is computed once.\n\n**Hints**\n1. Check `shown`.\n2. Watch status.\n\n```js\nconst x = 1;\n```\n<script>alert(1)</script>",
          ),
        ),
      ),
    );
    expect(find.text("What's going on"), findsOneWidget);
    expect(find.textContaining('Check '), findsOneWidget);
    expect(find.text('const x = 1;'), findsOneWidget);
    expect(find.textContaining('**'), findsNothing);
  });

  testWidgets('helper says when it is not set up (A9)', (tester) async {
    await tester.pumpWidget(host(const AIHelperScreen(), wallet: Wallet.fromJson(JsonReader(walletJson(enabled: false)))));
    await tester.pumpAndSettle();
    expect(find.text("The AI helper isn't set up yet"), findsOneWidget);
    expect(find.byKey(const Key('ai-new')), findsNothing);
  });

  testWidgets('helper home shows prompt tips, credits and the ask button', (tester) async {
    await tester.pumpWidget(host(const AIHelperScreen(), wallet: Wallet.fromJson(JsonReader(walletJson()))));
    await tester.pumpAndSettle();
    expect(find.text('Learn to write good prompts'), findsOneWidget);
    expect(find.text('19 credits · 7 questions left today'), findsOneWidget);
    expect(find.byKey(const Key('ai-new')), findsOneWidget);
  });
}
