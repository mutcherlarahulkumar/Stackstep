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
import 'package:stackstep/features/chat/inbox_controller.dart';
import 'package:stackstep/features/tasks/board_controller.dart';
import 'package:stackstep/features/tasks/task_notes.dart';
import 'package:stackstep/features/tasks/task_work.dart';
import 'package:stackstep/shared/errors.dart';
import 'package:stackstep/shared/format.dart';
import 'package:stackstep/shared/motion.dart';
import 'package:stackstep/shared/state_views.dart';
import 'package:stackstep/ui/ui.dart';

class BoardScreen extends ConsumerStatefulWidget {
  const BoardScreen({super.key, this.focusTaskId, this.onFocusHandled});

  /// When set, the sheet for this task opens once the board loads.
  final String? focusTaskId;
  final VoidCallback? onFocusHandled;

  @override
  ConsumerState<BoardScreen> createState() => _BoardScreenState();
}

class _BoardScreenState extends ConsumerState<BoardScreen> {
  @override
  void didUpdateWidget(BoardScreen old) {
    super.didUpdateWidget(old);
    _maybeFocus();
  }

  void _maybeFocus() {
    final id = widget.focusTaskId;
    final tasks = ref.read(boardProvider).value;
    if (id == null || tasks == null) return;
    final task = tasks.where((t) => t.id == id).firstOrNull;
    widget.onFocusHandled?.call();
    if (task == null) {
      showToast(context, "That task isn't on your board anymore.");
      return;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(openTaskSheet(context, task));
    });
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(boardProvider, (_, next) {
      if (next.hasValue) _maybeFocus();
    });
    final board = ref.watch(boardProvider);
    return FadeSwitch(
      child: switch (board) {
        AsyncData(:final value) => _Board(groups: groupBoard(value)),
        AsyncError(:final error) => ErrorState(message: messageFor(error), onRetry: () => ref.invalidate(boardProvider)),
        _ => const SkeletonList(),
      },
    );
  }
}

/// One list of what to do now (feedback to act on first), what's waiting on a reviewer, and a
/// folded list of finished work.
class _Board extends ConsumerWidget {
  const _Board({required this.groups});

  final Map<BoardColumn, List<Task>> groups;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ShadTheme.of(context);
    final todo = [...groups[BoardColumn.changes]!, ...groups[BoardColumn.today]!];
    final review = groups[BoardColumn.inReview]!;
    final done = groups[BoardColumn.done]!;
    Widget title(String text, int count) => Padding(
      padding: const EdgeInsets.only(bottom: Space.sm),
      child: Semantics(
        header: true,
        child: Text.rich(
          TextSpan(
            text: text,
            children: [
              TextSpan(
                text: '  $count',
                style: t.textTheme.muted.copyWith(fontWeight: FontWeight.w400),
              ),
            ],
          ),
          style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600),
        ),
      ),
    );
    Widget cards(List<Task> list) => Column(
      children: [
        for (final task in list)
          Padding(
            padding: const EdgeInsets.only(bottom: Space.md),
            child: TaskCard(task: task, onTap: () => openTaskSheet(context, task)),
          ),
      ],
    );
    return RefreshIndicator(
      onRefresh: () => ref.read(boardProvider.notifier).refresh(),
      child: ListView(
        padding: const EdgeInsets.all(Space.lg),
        children: [
          title('To do', todo.length),
          if (todo.isEmpty)
            const SizedBox(
              height: 300,
              child: EmptyState(
                icon: LucideIcons.coffee,
                title: 'Nothing to do right now',
                body: 'Your lead drops new tickets in chat. Pull down to refresh, or ask what to pick up next.',
              ),
            )
          else
            cards(todo),
          if (review.isNotEmpty) ...[const SizedBox(height: Space.md), title('Waiting for review', review.length), cards(review)],
          if (done.isNotEmpty)
            Theme(
              data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                key: const Key('board-done'),
                tilePadding: EdgeInsets.zero,
                childrenPadding: EdgeInsets.zero,
                title: Text('Done  ${done.length}', style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
                children: [cards(done)],
              ),
            ),
        ],
      ),
    );
  }
}

/// The persona who posted a task, from the student's chats (null until they load).
Persona? taskPersona(WidgetRef ref, Task task) =>
    ref.watch(studentInboxProvider).value?.map((t) => t.persona).where((p) => p.id == task.personaId).firstOrNull;

class TaskCard extends ConsumerWidget {
  const TaskCard({required this.task, required this.onTap, super.key});

  final Task task;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ShadTheme.of(context);
    final now = ref.watch(clockProvider)();
    final overdue = !task.status.isTerminal && task.status != TaskStatus.inReview && isOverdue(task.dueAt, now);
    final persona = taskPersona(ref, task);
    return Semantics(
      button: true,
      label:
          '${task.type.label}: ${task.title}. ${task.status.label}. ${taskTimeLabel(task, now)}${persona == null ? '' : '. From ${persona.name}'}',
      child: ShadCard(
        padding: EdgeInsets.zero,
        child: InkWell(
          borderRadius: const BorderRadius.all(Radii.md),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(Space.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [TypeBadge(task.type), const Spacer(), StatusBadge(task.status)]),
                const SizedBox(height: Space.md),
                Text(task.title, style: t.textTheme.large, maxLines: 2, overflow: TextOverflow.ellipsis),
                const SizedBox(height: Space.sm),
                Row(
                  children: [
                    Icon(
                      overdue ? LucideIcons.alarmClock : LucideIcons.clock,
                      size: 14,
                      color: overdue ? t.colorScheme.destructive : t.colorScheme.mutedForeground,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      taskTimeLabel(task, now),
                      style: t.textTheme.small.copyWith(
                        color: overdue ? t.colorScheme.destructive : t.colorScheme.mutedForeground,
                        fontWeight: overdue ? FontWeight.w600 : FontWeight.w400,
                      ),
                    ),
                    const Spacer(),
                    if (persona != null) ...[
                      PersonaAvatar(persona, size: 20),
                      const SizedBox(width: 6),
                      Text(persona.name.split(' ').first, style: t.textTheme.small.copyWith(color: t.colorScheme.mutedForeground)),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

Future<void> openTaskSheet(BuildContext context, Task task) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (_) => TaskSheet(taskId: task.id),
);

String _actionLabel(TaskStatus from, TaskStatus to) => switch ((from, to)) {
  (TaskStatus.todo, TaskStatus.inProgress) => 'Start working',
  (TaskStatus.inProgress, TaskStatus.inReview) => 'Submit for review',
  (TaskStatus.inProgress, TaskStatus.done) => 'Mark as done',
  (TaskStatus.changesRequested, TaskStatus.inReview) => 'Resubmit for review',
  (TaskStatus.changesRequested, TaskStatus.inProgress) => 'Keep working',
  _ => to.label,
};

String _nextStepHint(Task task) => switch (task.status) {
  _ when task.type == TaskType.quiz && task.status == TaskStatus.done => 'Finished. The answer key is below.',
  _ when task.type == TaskType.quiz => 'Answer every question, then check your answers. The best of three attempts counts.',
  TaskStatus.todo when task.reviewMode == ReviewMode.self => 'Tap Start working when you begin. You mark this one done yourself.',
  TaskStatus.inProgress when task.reviewMode == ReviewMode.self => 'No review needed. Mark it done once you’ve finished.',
  TaskStatus.todo => 'Create a branch for this ticket, then tap Start working.',
  TaskStatus.inProgress => 'Push your branch and open a PR, then submit it for review.',
  TaskStatus.inReview => "Reviews usually come back within a day, in this task's chat. Pick up a smaller task while you wait.",
  TaskStatus.changesRequested => 'Read the review in chat, push fixes to the same branch, then resubmit.',
  TaskStatus.done => 'Approved. Merge your PR if you haven’t yet.',
  TaskStatus.cancelled => 'This task was cancelled. No action needed.',
};

class TaskSheet extends ConsumerStatefulWidget {
  const TaskSheet({required this.taskId, super.key});
  final String taskId;

  @override
  ConsumerState<TaskSheet> createState() => _TaskSheetState();
}

class _TaskSheetState extends ConsumerState<TaskSheet> {
  TaskStatus? _pending;

  Future<void> _move(Task task, TaskStatus to) async {
    SubmissionInput? submission;
    if (to == TaskStatus.inReview) {
      submission = await askForHandIn(context, task);
      if (submission == null || !mounted) return;
    }
    setState(() => _pending = to);
    final err = await ref.read(boardProvider.notifier).move(task, to, submission: submission);
    if (!mounted) return;
    setState(() => _pending = null);
    if (err != null) {
      showToast(context, err, error: true);
    } else {
      unawaited(HapticFeedback.mediumImpact());
      showToast(context, switch (to) {
        TaskStatus.inReview => 'Sent for review',
        TaskStatus.done => 'Nice work. Marked as done.',
        _ => 'Moved to ${to.label}',
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final task = ref.watch(boardProvider).value?.where((x) => x.id == widget.taskId).firstOrNull;
    if (task == null) {
      return const SizedBox(
        height: 240,
        child: EmptyState(icon: LucideIcons.archive, title: 'Task removed', body: 'This task is no longer on your board.'),
      );
    }
    final now = ref.watch(clockProvider)();
    // Quizzes finish only through grading.
    final moves = task.isQuiz ? const <TaskStatus>[] : studentMoves(task.status, task.reviewMode);
    final persona = taskPersona(ref, task);
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.7,
      maxChildSize: 0.95,
      builder: (context, scroll) => ListView(
        controller: scroll,
        padding: const EdgeInsets.fromLTRB(Space.xl, 0, Space.xl, Space.xl),
        children: [
          Row(
            children: [
              TypeBadge(task.type),
              const SizedBox(width: Space.sm),
              StatusBadge(task.status),
            ],
          ),
          const SizedBox(height: Space.md),
          Text(task.title, style: t.textTheme.h3),
          const SizedBox(height: Space.sm),
          if (persona != null) ...[
            Row(
              children: [
                PersonaAvatar(persona, size: 20),
                const SizedBox(width: 6),
                Text('From ${persona.name} · ${persona.title}', style: t.textTheme.muted),
              ],
            ),
            const SizedBox(height: Space.xs),
          ],
          Row(
            children: [
              Icon(LucideIcons.calendarClock, size: 14, color: t.colorScheme.mutedForeground),
              const SizedBox(width: 6),
              Text(
                task.status == TaskStatus.done || task.status == TaskStatus.cancelled
                    ? taskTimeLabel(task, now)
                    : '${dueLabel(task.dueAt, now)} · ${dateTimeLabel(task.dueAt)}',
                style: t.textTheme.muted,
              ),
            ],
          ),
          const SizedBox(height: Space.lg),
          ShadAlert(icon: const Icon(LucideIcons.footprints), title: const Text('Next step'), description: Text(_nextStepHint(task))),
          const SizedBox(height: Space.xl),
          Text('Brief', style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: Space.sm),
          if (task.brief.isEmpty)
            Text('No brief for this one. Ask ${persona?.name ?? 'your lead'} in chat if anything is unclear.', style: t.textTheme.muted)
          else
            SelectableText(task.brief, style: t.textTheme.p.copyWith(height: 1.55)),
          ResourceLinks(resources: task.content.resources),
          if (task.content.rubric.isNotEmpty) RubricCard(criteria: task.content.rubric, ticks: task.submission?.rubric),
          if (task.submission case final sub?) SubmissionCard(submission: sub),
          if (task.isQuiz) QuizPlayer(key: ValueKey('quiz-${task.version}'), task: task, onGraded: ref.read(boardProvider.notifier).apply),
          const SizedBox(height: Space.xl),
          for (final (i, to) in moves.indexed) ...[
            if (i == 0)
              ShadButton(
                key: Key('move-${to.wire}'),
                width: double.infinity,
                size: ShadButtonSize.lg,
                enabled: _pending == null,
                onPressed: () => _move(task, to),
                leading: _pending == to
                    ? SizedBox.square(
                        dimension: 16,
                        child: CircularProgressIndicator(strokeWidth: 2, color: t.colorScheme.primaryForeground),
                      )
                    : null,
                child: Text(_actionLabel(task.status, to)),
              )
            else
              ShadButton.outline(
                key: Key('move-${to.wire}'),
                width: double.infinity,
                size: ShadButtonSize.lg,
                enabled: _pending == null,
                onPressed: () => _move(task, to),
                child: Text(_actionLabel(task.status, to)),
              ),
            const SizedBox(height: Space.sm),
          ],
          if (task.content.practice case final p? when task.type == TaskType.dsa) PracticeCard(practice: p),
          TaskNotesSection(taskId: task.id),
          const SizedBox(height: Space.xl),
        ],
      ),
    );
  }
}
