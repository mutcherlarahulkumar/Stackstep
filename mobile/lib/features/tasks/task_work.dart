import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/api_client.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/api/validation.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/shared/errors.dart';
import 'package:stackstep/shared/format.dart';
import 'package:stackstep/ui/ui.dart';
import 'package:url_launcher/url_launcher.dart';

/// Opens a task link in the browser. Only http(s) links ever reach here.
Future<void> openLink(BuildContext context, String url) async {
  final uri = Uri.tryParse(url);
  if (uri == null || !validUrl(url)) return;
  final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!ok && context.mounted) showToast(context, "Couldn't open the link.", error: true);
}

class ResourceLinks extends StatelessWidget {
  const ResourceLinks({required this.resources, super.key});
  final List<Resource> resources;

  @override
  Widget build(BuildContext context) {
    if (resources.isEmpty) return const SizedBox.shrink();
    final t = ShadTheme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: Space.xl),
        Text('Links', style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: Space.xs),
        for (final r in resources)
          ShadButton.link(
            padding: EdgeInsets.zero,
            leading: const Icon(LucideIcons.externalLink, size: 14),
            onPressed: () => openLink(context, r.url),
            child: Flexible(child: Text(r.title, overflow: TextOverflow.ellipsis)),
          ),
      ],
    );
  }
}

class SubmissionCard extends StatelessWidget {
  const SubmissionCard({required this.submission, super.key});
  final Submission submission;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: Space.xl),
      child: ShadCard(
        padding: const EdgeInsets.all(Space.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(LucideIcons.fileCheck2, size: 16, color: t.colorScheme.mutedForeground),
                const SizedBox(width: Space.sm),
                Text('Your hand-in', style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
                const Spacer(),
                Text('#${submission.attempt} · ${dateTimeLabel(submission.submittedAt)}', style: t.textTheme.muted.copyWith(fontSize: 12)),
              ],
            ),
            if (submission.url case final url?) ...[
              const SizedBox(height: Space.xs),
              GestureDetector(
                onTap: () => openLink(context, url),
                child: Text(
                  url,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: t.textTheme.small.copyWith(color: t.colorScheme.primary, decoration: TextDecoration.underline),
                ),
              ),
            ],
            if (submission.note.isNotEmpty) ...[const SizedBox(height: Space.xs), Text(submission.note, style: t.textTheme.p)],
          ],
        ),
      ),
    );
  }
}

/// Asks for the link and note sent with "Submit for review". Returns null when cancelled.
Future<SubmissionInput?> askForHandIn(BuildContext context, Task task) => showModalBottomSheet<SubmissionInput>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (_) => Padding(
    padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
    child: _HandInForm(task: task),
  ),
);

class _HandInForm extends StatefulWidget {
  const _HandInForm({required this.task});
  final Task task;

  @override
  State<_HandInForm> createState() => _HandInFormState();
}

class _HandInFormState extends State<_HandInForm> {
  late final _url = TextEditingController(text: widget.task.submission?.url ?? '');
  final _note = TextEditingController();
  Map<String, String> _errors = {};

  @override
  void dispose() {
    _url.dispose();
    _note.dispose();
    super.dispose();
  }

  void _submit() {
    final e = validateSubmission(url: _url.text, note: _note.text, type: widget.task.type, required: true);
    setState(() => _errors = e);
    if (e.isEmpty) Navigator.pop(context, (url: _url.text.trim(), note: _note.text.trim()));
  }

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final link = needsLink(widget.task.type);
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(Space.xl, Space.lg, Space.xl, Space.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Submit for review', style: t.textTheme.h4),
          const SizedBox(height: Space.xs),
          Text(
            link ? 'Link the pull request (or post) and tell the reviewer what changed.' : 'Share your solution or a link.',
            style: t.textTheme.muted,
          ),
          const SizedBox(height: Space.lg),
          AppField(
            label: link ? 'Link' : 'Link (optional)',
            error: _errors['url'],
            child: ShadInput(
              key: const Key('hand-in-url'),
              controller: _url,
              keyboardType: TextInputType.url,
              autocorrect: false,
              placeholder: const Text('https://github.com/you/repo/pull/1'),
            ),
          ),
          const SizedBox(height: Space.lg),
          AppField(
            label: link ? 'Note (optional)' : 'Solution or note',
            error: _errors['note'],
            child: ShadTextarea(
              key: const Key('hand-in-note'),
              controller: _note,
              minHeight: link ? 80 : 140,
              placeholder: Text(link ? 'What changed, and what to look at.' : 'Your approach, with time and space complexity.'),
            ),
          ),
          const SizedBox(height: Space.xl),
          ShadButton(
            key: const Key('hand-in-submit'),
            size: ShadButtonSize.lg,
            onPressed: _submit,
            leading: const Icon(LucideIcons.send, size: 16),
            child: const Text('Submit'),
          ),
        ],
      ),
    );
  }
}

/// Takes the quiz; grading happens on the server against the answer key.
class QuizPlayer extends ConsumerStatefulWidget {
  const QuizPlayer({required this.task, required this.onGraded, super.key});
  final Task task;
  final ValueChanged<Task> onGraded;

  @override
  ConsumerState<QuizPlayer> createState() => _QuizPlayerState();
}

class _QuizPlayerState extends ConsumerState<QuizPlayer> {
  late List<int?> _answers = [for (final _ in widget.task.content.quiz?.questions ?? const <QuizQuestion>[]) null];
  bool _busy = false;
  String? _error;

  Future<void> _submit() async {
    final quiz = widget.task.content.quiz!;
    if (_answers.contains(null)) {
      setState(() => _error = 'Answer all ${quiz.questions.length} questions first.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final res = await ref
          .read(apiClientProvider)
          .submitQuiz(taskId: widget.task.id, expectedVersion: widget.task.version, answers: [for (final a in _answers) a!]);
      if (!mounted) return;
      widget.onGraded(res.task);
      unawaited(HapticFeedback.mediumImpact());
      final r = res.result;
      showToast(
        context,
        r.passed
            ? 'Passed with ${r.score}%'
            : r.attemptsLeft > 0
            ? '${r.score}%: not quite. ${r.attemptsLeft} ${r.attemptsLeft == 1 ? 'attempt' : 'attempts'} left.'
            : 'Finished with a best score of ${res.task.quizResult?.bestScore ?? r.score}%',
      );
      setState(() => _answers = [for (final _ in quiz.questions) null]);
    } on ApiException catch (e) {
      if (!mounted) return;
      final msg = e.code == ErrorCode.versionConflict ? 'This quiz changed on another device. Close and reopen it.' : messageFor(e);
      setState(() => _error = msg);
    } on NetworkException catch (e) {
      if (mounted) setState(() => _error = messageFor(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final quiz = widget.task.content.quiz;
    if (quiz == null) return const SizedBox.shrink();
    final t = ShadTheme.of(context);
    final c = t.colorScheme;
    final stats = widget.task.quizResult;
    final finished = widget.task.quizFinished;
    final unanswered = _answers.where((a) => a == null).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: Space.xl),
        Row(
          children: [
            Expanded(
              child: Text(
                'Quiz · ${quiz.questions.length} questions · pass ${quiz.passPercent}%',
                style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600),
              ),
            ),
            Text(
              stats == null ? '3 attempts' : 'Best ${stats.bestScore}% · ${finished ? 'finished' : '${stats.attemptsLeft} left'}',
              key: const Key('quiz-stats'),
              style: t.textTheme.muted.copyWith(fontSize: 12),
            ),
          ],
        ),
        for (final (i, q) in quiz.questions.indexed) ...[
          const SizedBox(height: Space.md),
          ShadCard(
            padding: const EdgeInsets.all(Space.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('${i + 1}. ${q.prompt}', style: t.textTheme.p.copyWith(fontWeight: FontWeight.w600)),
                if (!finished && stats != null && i < stats.lastCorrect.length)
                  Text(
                    stats.lastCorrect[i] ? 'Right last time' : 'Wrong last time',
                    style: t.textTheme.muted.copyWith(fontSize: 12, color: stats.lastCorrect[i] ? Brand.success : c.destructive),
                  ),
                const SizedBox(height: Space.sm),
                for (final (oi, o) in q.options.indexed)
                  _Option(
                    key: Key('quiz-q$i-o$oi'),
                    label: o,
                    selected: _answers[i] == oi,
                    isKey: finished && q.answer == oi,
                    mine: finished && stats != null && i < stats.lastAnswers.length && stats.lastAnswers[i] == oi,
                    enabled: !finished && !_busy,
                    onTap: () => setState(() => _answers[i] = oi),
                  ),
              ],
            ),
          ),
        ],
        if (_error case final e?) ...[const SizedBox(height: Space.md), Text(e, style: t.textTheme.small.copyWith(color: c.destructive))],
        if (!finished) ...[
          const SizedBox(height: Space.lg),
          ShadButton(
            key: const Key('quiz-submit'),
            size: ShadButtonSize.lg,
            enabled: !_busy,
            onPressed: _submit,
            child: Text(unanswered > 0 ? 'Answer $unanswered more' : 'Check my answers'),
          ),
        ],
      ],
    );
  }
}

class _Option extends StatelessWidget {
  const _Option({
    required this.label,
    required this.selected,
    required this.isKey,
    required this.enabled,
    required this.onTap,
    this.mine = false,
    super.key,
  });

  final String label;
  final bool selected;
  final bool isKey;

  /// The student's pick in their latest attempt (shown once the quiz is finished).
  final bool mine;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final c = t.colorScheme;
    final wrongPick = mine && !isKey;
    final border = isKey
        ? Brand.success
        : wrongPick
        ? c.destructive
        : selected
        ? c.primary
        : c.border;
    return Semantics(
      inMutuallyExclusiveGroup: true,
      checked: selected,
      label: [label, if (mine) 'your answer', if (isKey) 'right answer'].join(', '),
      child: Padding(
        padding: const EdgeInsets.only(top: Space.xs),
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: const BorderRadius.all(Radii.md),
          child: Container(
            constraints: const BoxConstraints(minHeight: 44),
            padding: const EdgeInsets.symmetric(horizontal: Space.md, vertical: Space.sm),
            decoration: BoxDecoration(
              border: Border.all(color: border, width: selected || isKey ? 1.5 : 1),
              borderRadius: const BorderRadius.all(Radii.md),
              color: isKey
                  ? Brand.success.withValues(alpha: 0.08)
                  : wrongPick
                  ? c.destructive.withValues(alpha: 0.08)
                  : selected
                  ? c.primary.withValues(alpha: 0.06)
                  : null,
            ),
            child: Row(
              children: [
                Icon(selected ? LucideIcons.circleDot : LucideIcons.circle, size: 18, color: selected ? c.primary : c.mutedForeground),
                const SizedBox(width: Space.sm),
                Expanded(child: Text(label, style: t.textTheme.p)),
                if (mine) Text('Your answer', style: t.textTheme.muted.copyWith(fontSize: 12)),
                if (mine) const SizedBox(width: Space.xs),
                if (isKey)
                  const Icon(LucideIcons.check, size: 18, color: Brand.success)
                else if (wrongPick)
                  Icon(LucideIcons.x, size: 18, color: c.destructive),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
