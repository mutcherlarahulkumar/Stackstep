import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/api_client.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/features/ai/ai_controller.dart';
import 'package:stackstep/features/ai/markdown_view.dart';
import 'package:stackstep/features/tasks/board_controller.dart';
import 'package:stackstep/shared/errors.dart';
import 'package:stackstep/shared/format.dart';
import 'package:stackstep/shared/state_views.dart';
import 'package:stackstep/ui/ui.dart';
import 'package:uuid/uuid.dart';

/// The AI helper's round avatar.
class AIAvatar extends StatelessWidget {
  const AIAvatar({super.key, this.size = 40});
  final double size;

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'AI helper',
    child: Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(colors: [Color(0xFF7C3AED), Color(0xFFC026D3)]),
      ),
      child: Icon(LucideIcons.sparkles, color: Colors.white, size: size * 0.5),
    ),
  );
}

/// Points and credits, shown with the AI helper that spends them.
class WalletChips extends ConsumerWidget {
  const WalletChips({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final w = ref.watch(walletProvider).value;
    if (w == null) return const SizedBox.shrink();
    final t = ShadTheme.of(context);
    Widget chip(IconData icon, Color color, String text, String label) => Semantics(
      label: label,
      excludeSemantics: true,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: Space.sm, vertical: 4),
        decoration: BoxDecoration(color: t.colorScheme.muted, borderRadius: BorderRadius.circular(999)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 4),
            Text(text, style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
    return Row(
      key: const Key('wallet-chips'),
      mainAxisSize: MainAxisSize.min,
      children: [
        chip(LucideIcons.trophy, Brand.streak, '${w.points}', '${w.points} points'),
        const SizedBox(width: Space.xs),
        chip(LucideIcons.coins, t.colorScheme.primary, '${w.credits}', '${w.credits} credits'),
      ],
    );
  }
}

/// The helper's home: how to ask well, the student's past questions, and "Ask a question".
class AIHelperScreen extends ConsumerWidget {
  const AIHelperScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ShadTheme.of(context);
    final wallet = ref.watch(walletProvider);
    final list = ref.watch(aiConversationsProvider);
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          children: [
            const AIAvatar(size: 34),
            const SizedBox(width: Space.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('AI helper', style: t.textTheme.large),
                  Text('Hints, not answers · 1 credit per question', style: t.textTheme.muted.copyWith(fontSize: 12)),
                ],
              ),
            ),
          ],
        ),
        actions: const [
          WalletChips(),
          SizedBox(width: Space.md),
        ],
      ),
      body: switch (wallet) {
        AsyncData(:final value) when !value.aiEnabled => const EmptyState(
          icon: LucideIcons.sparkles,
          title: "The AI helper isn't set up yet",
          body: "Your admin hasn't turned it on. Ask your managers in their chats; they reply by hand.",
        ),
        AsyncData(:final value) => RefreshIndicator(
          onRefresh: () async {
            ref
              ..invalidate(walletProvider)
              ..invalidate(aiConversationsProvider);
          },
          child: ListView(
            padding: const EdgeInsets.all(Space.lg),
            children: [
              ShadButton(
                key: const Key('ai-new'),
                size: ShadButtonSize.lg,
                leading: const Icon(LucideIcons.messageSquarePlus, size: 18),
                onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AIQuestionScreen())),
                child: const Text('Ask a question'),
              ),
              const SizedBox(height: Space.sm),
              Text(
                '${value.credits} credits · ${value.questionsLeft} questions left today',
                textAlign: TextAlign.center,
                style: t.textTheme.muted.copyWith(fontSize: 12),
              ),
              const SizedBox(height: Space.lg),
              const _Tips(),
              const SizedBox(height: Space.xl),
              Text('Your questions', style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
              const SizedBox(height: Space.sm),
              switch (list) {
                AsyncData(:final value) when value.isEmpty => Text(
                  "Nothing yet. Try first, then ask when you're stuck.",
                  style: t.textTheme.muted,
                ),
                AsyncData(:final value) => Column(
                  children: [
                    for (final c in value)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(c.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                        subtitle: Text(dateTimeLabel(c.updatedAt), style: t.textTheme.muted.copyWith(fontSize: 12)),
                        trailing: const Icon(LucideIcons.chevronRight, size: 18),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => AIConversationScreen(id: c.id, title: c.title),
                          ),
                        ),
                      ),
                  ],
                ),
                AsyncError(:final error) => ErrorState(message: messageFor(error), onRetry: () => ref.invalidate(aiConversationsProvider)),
                _ => const SizedBox(height: 120, child: SkeletonList(rows: 2, height: 48)),
              },
            ],
          ),
        ),
        AsyncError(:final error) => ErrorState(message: messageFor(error), onRetry: () => ref.invalidate(walletProvider)),
        _ => const SkeletonList(rows: 3, height: 64),
      },
    );
  }
}

class _Tips extends StatelessWidget {
  const _Tips();

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    return ShadCard(
      padding: const EdgeInsets.all(Space.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(LucideIcons.lightbulb, size: 18, color: Brand.warning),
              const SizedBox(width: Space.sm),
              Text('Learn to write good prompts', style: t.textTheme.small.copyWith(fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: Space.sm),
          Text(
            'Spend some time on the problem yourself first: read the error, check the docs, try one fix. Then explain everything in one go.',
            style: t.textTheme.muted,
          ),
          const SizedBox(height: Space.sm),
          Row(
            key: const Key('ai-privacy-note'),
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(LucideIcons.eye, size: 14, color: t.colorScheme.mutedForeground),
              const SizedBox(width: Space.xs),
              Expanded(
                child: Text(
                  "Mentors can read your helper chats. Questions are sent to an AI provider, so don't paste passwords, keys or personal details.",
                  style: t.textTheme.muted.copyWith(fontSize: 12),
                ),
              ),
            ],
          ),
          const SizedBox(height: Space.sm),
          for (final (title, body) in promptTips)
            Padding(
              padding: const EdgeInsets.only(top: Space.xs),
              child: Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: '$title. ',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    TextSpan(text: body, style: t.textTheme.muted),
                  ],
                ),
                style: t.textTheme.small,
              ),
            ),
        ],
      ),
    );
  }
}

/// The "explain it in one go" form.
class AIQuestionScreen extends ConsumerStatefulWidget {
  const AIQuestionScreen({super.key});

  @override
  ConsumerState<AIQuestionScreen> createState() => _AIQuestionScreenState();
}

class _AIQuestionScreenState extends ConsumerState<AIQuestionScreen> {
  final _goal = TextEditingController();
  final _tried = TextEditingController();
  final _error = TextEditingController();
  final _code = TextEditingController();
  String? _taskId;
  Map<String, String> _errors = {};
  String? _formError;
  bool _busy = false;
  // The error and code boxes stay folded until wanted, or until the server flags one.
  bool _extras = false;
  // One id per draft, so a retry after a dropped connection is never charged twice.
  String _clientId = const Uuid().v4();
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    for (final c in [_goal, _tried, _error, _code]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    final e = validateAIQuestion(goal: _goal.text, tried: _tried.text, error: _error.text, code: _code.text);
    setState(() {
      _errors = e;
      _formError = null;
    });
    if (e.isNotEmpty) return;
    setState(() => _busy = true);
    try {
      final d = await ref
          .read(apiClientProvider)
          .askAI(
            clientId: _clientId,
            question: (
              taskId: _taskId,
              goal: _goal.text.trim(),
              tried: _tried.text.trim(),
              error: _error.text.trim(),
              code: _code.text.trim(),
            ),
          );
      ref
        ..invalidate(walletProvider)
        ..invalidate(aiConversationsProvider);
      if (!mounted) return;
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(
          builder: (_) => AIConversationScreen(id: d.conversation.id, title: d.conversation.title, initial: d),
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        if (e.code == ErrorCode.validationFailed && e.fields.isNotEmpty) {
          _errors = e.fields;
        } else {
          _formError = messageFor(e);
        }
        _clientId = const Uuid().v4(); // nothing was stored, so a new try is a new question
      });
      ref.invalidate(walletProvider);
    } on NetworkException catch (e) {
      if (mounted) setState(() => _formError = messageFor(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final wallet = ref.watch(walletProvider).value;
    final tasks = (ref.watch(boardProvider).value ?? const <Task>[])
        .where((x) => x.type != TaskType.quiz && x.status != TaskStatus.cancelled)
        .toList();
    final wait = countdown(wallet?.nextQuestionAt, ref.read(clockProvider)());
    final blocked = wallet == null
        ? null
        : wallet.questionsLeft == 0
        ? "You've used today's questions. They reset at midnight."
        : wallet.credits < wallet.costPerQuestion
        ? "You're out of credits. Finish tasks to earn more, or ask your admin."
        : null;
    return Scaffold(
      appBar: AppBar(title: const Text('Ask the AI helper')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(Space.lg),
          children: [
            Text(
              'The helper only knows what you write here. You get hints and a next step, not the finished solution.',
              style: t.textTheme.muted,
            ),
            if (_formError case final err?) ...[const SizedBox(height: Space.lg), ErrorAlert(title: "Couldn't ask", message: err)],
            const SizedBox(height: Space.lg),
            AppField(
              label: 'About a task (optional)',
              child: DropdownButtonFormField<String?>(
                initialValue: _taskId,
                isExpanded: true,
                items: [
                  const DropdownMenuItem(child: Text('Not about a specific task')),
                  for (final task in tasks)
                    DropdownMenuItem(
                      value: task.id,
                      child: Text(task.title, overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (v) => setState(() => _taskId = v),
              ),
            ),
            const SizedBox(height: Space.lg),
            AppField(
              label: 'What are you trying to do?',
              error: _errors['goal'],
              child: ShadTextarea(
                key: const Key('ai-goal'),
                controller: _goal,
                minHeight: 60,
                placeholder: const Text('e.g. Filter the task list by status without reloading.'),
              ),
            ),
            const SizedBox(height: Space.lg),
            AppField(
              label: 'What have you tried so far?',
              description: 'At least a couple of sentences. This is the most useful part.',
              error: _errors['tried'],
              child: ShadTextarea(
                key: const Key('ai-tried'),
                controller: _tried,
                minHeight: 90,
                placeholder: const Text('The docs you read, the fixes you tried, what each did.'),
              ),
            ),
            const SizedBox(height: Space.lg),
            if (_extras || _errors['error'] != null || _errors['code'] != null) ...[
              AppField(
                label: 'What happens instead? (optional)',
                error: _errors['error'],
                child: ShadTextarea(controller: _error, minHeight: 60, placeholder: const Text('The exact error, or expected vs actual.')),
              ),
              const SizedBox(height: Space.lg),
              AppField(
                label: 'Relevant code (optional)',
                error: _errors['code'],
                child: ShadTextarea(
                  controller: _code,
                  minHeight: 100,
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 13),
                  placeholder: const Text('Only the part that matters. Never paste API keys.'),
                ),
              ),
            ] else
              Align(
                alignment: Alignment.centerLeft,
                child: ShadButton.ghost(
                  key: const Key('ai-extras'),
                  size: ShadButtonSize.sm,
                  leading: const Icon(LucideIcons.plus, size: 16),
                  onPressed: () => setState(() => _extras = true),
                  child: const Text('Add the error or code (optional)'),
                ),
              ),
            if (blocked != null) ...[
              const SizedBox(height: Space.lg),
              Text(blocked, style: t.textTheme.small.copyWith(color: t.colorScheme.destructive)),
            ],
            const SizedBox(height: Space.xl),
            ShadButton(
              key: const Key('ai-ask'),
              size: ShadButtonSize.lg,
              enabled: !_busy && blocked == null && wait == null,
              onPressed: _submit,
              leading: _busy
                  ? SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2, color: t.colorScheme.primaryForeground))
                  : Icon(wait == null ? LucideIcons.send : LucideIcons.clock, size: 16),
              child: Text(
                _busy
                    ? 'Thinking…'
                    : wait != null
                    ? 'Next question in $wait'
                    : 'Ask · ${wallet?.costPerQuestion ?? 1} credit',
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// One conversation with the helper, plus the follow-up box once it opens.
class AIConversationScreen extends ConsumerStatefulWidget {
  const AIConversationScreen({required this.id, required this.title, super.key, this.initial});
  final String id;
  final String title;
  final AIConversationDetail? initial;

  @override
  ConsumerState<AIConversationScreen> createState() => _AIConversationScreenState();
}

class _AIConversationScreenState extends ConsumerState<AIConversationScreen> {
  AIConversationDetail? _detail;
  Object? _loadError;
  final _triedSince = TextEditingController();
  final _body = TextEditingController();
  Map<String, String> _errors = {};
  bool _busy = false;
  String _clientId = const Uuid().v4();
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _detail = widget.initial;
    if (_detail == null) unawaited(_load());
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    _triedSince.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final d = await ref.read(apiClientProvider).aiConversation(widget.id);
      if (mounted) setState(() => _detail = d);
    } on Exception catch (e) {
      if (mounted) setState(() => _loadError = e);
    }
  }

  Future<void> _send() async {
    final e = validateAIFollowUp(triedSince: _triedSince.text, body: _body.text);
    setState(() => _errors = e);
    if (e.isNotEmpty) return;
    setState(() => _busy = true);
    try {
      final d = await ref
          .read(apiClientProvider)
          .followUpAI(widget.id, clientId: _clientId, triedSince: _triedSince.text.trim(), body: _body.text.trim());
      ref.invalidate(walletProvider);
      if (!mounted) return;
      setState(() {
        _detail = d;
        _triedSince.clear();
        _body.clear();
        _clientId = const Uuid().v4();
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.code == ErrorCode.validationFailed && e.fields.isNotEmpty) {
        setState(() => _errors = e.fields);
      } else {
        showToast(context, messageFor(e), error: true);
      }
      _clientId = const Uuid().v4();
      unawaited(_load());
    } on NetworkException catch (e) {
      if (mounted) showToast(context, messageFor(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final d = _detail;
    return Scaffold(
      appBar: AppBar(title: Text(widget.title, overflow: TextOverflow.ellipsis)),
      body: d == null
          ? _loadError != null
                ? ErrorState(message: messageFor(_loadError!), onRetry: _load)
                : const SkeletonList(rows: 3, height: 80)
          : Column(
              children: [
                Expanded(
                  child: ListView(
                    key: const Key('ai-thread'),
                    padding: const EdgeInsets.all(Space.lg),
                    children: [for (final m in d.messages) _Turn(m)],
                  ),
                ),
                _followUp(context, t, d),
              ],
            ),
    );
  }

  Widget _followUp(BuildContext context, ShadThemeData t, AIConversationDetail d) {
    final wait = countdown(d.followUpAt, ref.read(clockProvider)());
    Widget bar(Widget child) => DecoratedBox(
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: t.colorScheme.border)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(padding: const EdgeInsets.all(Space.md), child: child),
      ),
    );
    if (d.followUpsLeft == 0) {
      return bar(Text("This conversation is full. Start a new question with everything you've learned.", style: t.textTheme.muted));
    }
    if (wait != null) {
      return bar(
        Row(
          key: const Key('ai-cooldown'),
          children: [
            Icon(LucideIcons.lock, size: 16, color: t.colorScheme.mutedForeground),
            const SizedBox(width: Space.sm),
            Expanded(
              child: Text.rich(
                TextSpan(
                  children: [
                    const TextSpan(
                      text: 'Try the hint yourself first. ',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                    TextSpan(text: 'Follow-ups open in $wait.', style: t.textTheme.muted),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    }
    return bar(
      Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppField(
            label: 'What did you try after the last answer?',
            error: _errors['tried_since'],
            child: ShadTextarea(key: const Key('ai-tried-since'), controller: _triedSince, minHeight: 50),
          ),
          const SizedBox(height: Space.sm),
          AppField(
            label: 'Your follow-up question',
            error: _errors['body'],
            child: ShadTextarea(key: const Key('ai-follow-up'), controller: _body, minHeight: 50),
          ),
          const SizedBox(height: Space.sm),
          ShadButton(
            key: const Key('ai-follow-up-send'),
            enabled: !_busy,
            onPressed: _send,
            child: Text(_busy ? 'Thinking…' : 'Follow up · ${d.wallet.costPerQuestion} credit · ${d.followUpsLeft} left'),
          ),
        ],
      ),
    );
  }
}

class _Turn extends StatelessWidget {
  const _Turn(this.m);
  final AIMessage m;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final c = t.colorScheme;
    if (m.role == AIRole.assistant) {
      return Padding(
        padding: const EdgeInsets.only(bottom: Space.lg),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const AIAvatar(size: 28),
            const SizedBox(width: Space.sm),
            Flexible(
              child: Container(
                key: const Key('ai-answer'),
                padding: const EdgeInsets.all(Space.md),
                decoration: BoxDecoration(color: c.muted, borderRadius: const BorderRadius.all(Radii.lg)),
                child: MarkdownView(m.body),
              ),
            ),
          ],
        ),
      );
    }
    final p = m.parts;
    final fg = c.primaryForeground;
    Widget part(String label, String value, {bool mono = false}) => Padding(
      padding: const EdgeInsets.only(bottom: Space.xs),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(color: fg.withValues(alpha: 0.75), fontSize: 12, fontWeight: FontWeight.w600),
          ),
          Text(
            value,
            style: TextStyle(color: fg, fontFamily: mono ? 'monospace' : null, fontSize: mono ? 13 : null),
          ),
        ],
      ),
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: Space.lg, left: Space.xxl),
      child: Align(
        alignment: Alignment.centerRight,
        child: Opacity(
          opacity: m.status == AIMessageStatus.failed ? 0.6 : 1,
          child: Container(
            padding: const EdgeInsets.all(Space.md),
            decoration: BoxDecoration(color: c.primary, borderRadius: const BorderRadius.all(Radii.lg)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (p != null && m.kind == AIMessageKind.question) ...[
                  part('Trying to do', p.goal),
                  part('Tried', p.tried),
                  if (p.error.isNotEmpty) part('What happens', p.error),
                  if (p.code.isNotEmpty) part('Code', p.code, mono: true),
                ] else if (p != null) ...[
                  part('Tried since', p.triedSince),
                  part('Question', p.question),
                ] else
                  Text(m.body, style: TextStyle(color: fg)),
                if (m.status == AIMessageStatus.failed)
                  Text('No answer came back. Your credit was refunded.', style: TextStyle(color: fg, fontSize: 12)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
