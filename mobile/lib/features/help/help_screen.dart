import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/features/ai/markdown_view.dart';
import 'package:stackstep/shared/errors.dart';

const _suggestions = [
  'How do I hand in a task?',
  'When does Day 1 start?',
  'What are credits for?',
  'How do I join a live class?',
  'How is attendance marked?',
];

typedef _Turn = ({String role, String content, List<String> topics, bool guide});

/// The help assistant: answers questions about using Stackstep from our student guide.
class HelpScreen extends ConsumerStatefulWidget {
  const HelpScreen({super.key});

  @override
  ConsumerState<HelpScreen> createState() => _HelpScreenState();
}

class _HelpScreenState extends ConsumerState<HelpScreen> {
  final _turns = <_Turn>[];
  final _input = TextEditingController();
  final _scroll = ScrollController();
  var _busy = false;

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _ask(String raw) async {
    final q = raw.trim();
    if (q.isEmpty || _busy) return;
    final history = [for (final t in _turns.reversed.take(6).toList().reversed) (role: t.role, content: t.content)];
    setState(() {
      _turns.add((role: 'user', content: q.length > 500 ? q.substring(0, 500) : q, topics: const [], guide: false));
      _busy = true;
      _input.clear();
    });
    _toEnd();
    try {
      final a = await ref.read(apiClientProvider).askHelp(q, history);
      if (!mounted) return;
      setState(() => _turns.add((role: 'assistant', content: a.answer, topics: a.topics, guide: !a.ai)));
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _turns.add((role: 'assistant', content: messageFor(e), topics: const [], guide: false)));
    } finally {
      if (mounted) setState(() => _busy = false);
      _toEnd();
    }
  }

  void _toEnd() => WidgetsBinding.instance.addPostFrameCallback((_) {
    if (_scroll.hasClients) {
      _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    }
  });

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Stackstep help'),
        actions: [
          if (_turns.isNotEmpty)
            IconButton(tooltip: 'Start over', icon: const Icon(LucideIcons.rotateCcw, size: 18), onPressed: () => setState(_turns.clear)),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                key: const Key('help-list'),
                controller: _scroll,
                padding: const EdgeInsets.all(Space.lg),
                children: [
                  const _Bubble(
                    mine: false,
                    text: 'Hi! Ask me anything about using Stackstep, from applying and Day 1 to hand-ins, reviews, credits, classes and the app.',
                  ),
                  if (_turns.isEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: Space.sm),
                      child: Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final s in _suggestions)
                            ShadButton.secondary(
                              key: Key('help-suggestion-$s'),
                              size: ShadButtonSize.sm,
                              onPressed: () => _ask(s),
                              child: Text(s),
                            ),
                        ],
                      ),
                    ),
                  for (final turn in _turns) _Bubble(mine: turn.role == 'user', text: turn.content, topics: turn.topics, guide: turn.guide),
                  if (_busy)
                    Padding(
                      padding: const EdgeInsets.only(top: Space.sm),
                      child: Text('Looking it up', style: t.textTheme.muted.copyWith(fontSize: 12)),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.md, Space.sm, Space.md, Space.sm),
              child: Row(
                children: [
                  Expanded(
                    child: ShadInput(
                      key: const Key('help-input'),
                      controller: _input,
                      placeholder: const Text('Ask how something works'),
                      maxLength: 500,
                      textInputAction: TextInputAction.send,
                      onSubmitted: _ask,
                    ),
                  ),
                  const SizedBox(width: Space.sm),
                  ShadIconButton(
                    key: const Key('help-send'),
                    icon: const Icon(LucideIcons.sendHorizontal, size: 18),
                    onPressed: _busy ? null : () => _ask(_input.text),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: Space.sm),
              child: Text('For your tasks and reviews, ask your team lead in chat.', style: t.textTheme.muted.copyWith(fontSize: 11)),
            ),
          ],
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.mine, required this.text, this.topics = const [], this.guide = false});
  final bool mine;
  final String text;
  final List<String> topics;
  final bool guide;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.85),
        child: Padding(
          padding: const EdgeInsets.only(top: Space.sm),
          child: Column(
            crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: mine ? t.colorScheme.primary : t.colorScheme.muted,
                  borderRadius: BorderRadius.only(
                    topLeft: const Radius.circular(18),
                    topRight: const Radius.circular(18),
                    bottomLeft: Radius.circular(mine ? 18 : 6),
                    bottomRight: Radius.circular(mine ? 6 : 18),
                  ),
                ),
                child: mine
                    ? Text(text, style: t.textTheme.small.copyWith(color: t.colorScheme.primaryForeground))
                    : MarkdownView(text, key: Key('help-answer-${text.hashCode}')),
              ),
              if (topics.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    '${guide ? 'From the guide' : 'Based on'} · ${topics.take(2).join(', ')}',
                    style: t.textTheme.muted.copyWith(fontSize: 10),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
