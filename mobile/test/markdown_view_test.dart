import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/features/ai/markdown_view.dart';

void main() {
  testWidgets('RD3 callouts render as labelled boxes without the marker, plain quotes stay quotes', (tester) async {
    await tester.pumpWidget(
      const ShadApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: MarkdownView('> [!TIP]\n> Predict before you run it.\n\n> [!WARNING]\n> Never commit secrets.\n\n> Just a quote.'),
          ),
        ),
      ),
    );
    expect(find.text('Tip'), findsOneWidget);
    expect(find.text('Watch out'), findsOneWidget);
    expect(find.textContaining('[!TIP]'), findsNothing);
    expect(find.textContaining('Predict before you run it.'), findsOneWidget);
    expect(find.textContaining('Just a quote.'), findsOneWidget);
    expect(find.byIcon(LucideIcons.lightbulb), findsOneWidget);
  });
}
