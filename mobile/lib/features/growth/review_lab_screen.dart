import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/core/config.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/features/tasks/task_work.dart';
import 'package:stackstep/shared/errors.dart';
import 'package:stackstep/shared/state_views.dart';

/// The review lab library (feature 27). Reviewing a diff needs a wide screen, so it opens on the web.
final FutureProvider<List<LabSummary>> reviewLabProvider = FutureProvider.autoDispose<List<LabSummary>>(
  (ref) => ref.read(apiClientProvider).reviewLab(),
);

String reviewLabUrl(String key, {String? taskId}) =>
    AppConfig.webUrl('/review-lab/${Uri.encodeComponent(key)}${taskId == null ? '' : '?task=${Uri.encodeComponent(taskId)}'}');

const Map<LabDifficulty, String> _difficulty = {LabDifficulty.easy: 'Easy', LabDifficulty.medium: 'Medium', LabDifficulty.hard: 'Hard'};

class ReviewLabScreen extends ConsumerWidget {
  const ReviewLabScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final q = ref.watch(reviewLabProvider);
    final t = ShadTheme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Review lab')),
      body: switch (q) {
        AsyncData(:final value) when value.isEmpty => const EmptyState(
          icon: LucideIcons.gitPullRequest,
          title: 'No pull requests yet',
          body: 'New practice pull requests show up here.',
        ),
        AsyncData(:final value) => RefreshIndicator(
          onRefresh: () => ref.refresh(reviewLabProvider.future),
          child: ListView(
            key: const Key('review-lab-list'),
            padding: const EdgeInsets.all(Space.lg),
            children: [
              Text(
                'Practice code review on pull requests with planted problems. Reviewing a diff needs a bigger screen, so each one opens in the web app.',
                style: t.textTheme.muted,
              ),
              const SizedBox(height: Space.lg),
              for (final ex in value)
                Padding(
                  padding: const EdgeInsets.only(bottom: Space.md),
                  child: ShadCard(
                    padding: const EdgeInsets.all(Space.lg),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            ShadBadge.outline(child: Text(_difficulty[ex.difficulty]!)),
                            const SizedBox(width: Space.xs),
                            ShadBadge.secondary(child: Text(ex.language)),
                            const Spacer(),
                            Text(
                              ex.bestScore == null ? 'Not tried' : 'Best ${ex.bestScore}%',
                              style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600),
                            ),
                          ],
                        ),
                        const SizedBox(height: Space.sm),
                        Text(ex.title, style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
                        Text(ex.summary, style: t.textTheme.muted.copyWith(fontSize: 13)),
                        const SizedBox(height: Space.md),
                        ShadButton.outline(
                          key: Key('lab-${ex.key}'),
                          leading: const Icon(LucideIcons.externalLink, size: 16),
                          onPressed: () => openLink(context, reviewLabUrl(ex.key)),
                          child: const Text('Review on the web'),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
        AsyncError(:final error) => ErrorState(message: messageFor(error), onRetry: () => ref.invalidate(reviewLabProvider)),
        _ => const SkeletonList(rows: 4, height: 110),
      },
    );
  }
}

/// On a code review task that is a review lab pull request: the score so far and a link to it.
class ReviewLabTaskCard extends StatelessWidget {
  const ReviewLabTaskCard({required this.task, super.key});
  final Task task;

  @override
  Widget build(BuildContext context) {
    final lab = task.content.reviewLab;
    if (lab == null) return const SizedBox.shrink();
    final t = ShadTheme.of(context);
    final r = task.labResult;
    return Padding(
      padding: const EdgeInsets.only(top: Space.xl),
      child: ShadCard(
        key: const Key('review-lab-card'),
        padding: const EdgeInsets.all(Space.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(LucideIcons.gitPullRequest, size: 16, color: Color(0xFF059669)),
                const SizedBox(width: Space.sm),
                Semantics(
                  header: true,
                  child: Text('Practice pull request', style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
                ),
              ],
            ),
            const SizedBox(height: Space.sm),
            Text(
              "Review it like a teammate's pull request. Pass mark ${lab.passPercent}%. Three tries; the best one counts.",
              style: t.textTheme.muted,
            ),
            if (r != null) ...[
              const SizedBox(height: Space.sm),
              Text(
                'Best score ${r.bestScore}% · ${r.attempts} of 3 tries used${r.passed ? ' · passed' : ''}',
                key: const Key('review-lab-stats'),
                style: t.textTheme.small,
              ),
            ],
            const SizedBox(height: Space.md),
            ShadButton(
              key: const Key('open-review-lab'),
              leading: const Icon(LucideIcons.externalLink, size: 16),
              onPressed: () => openLink(context, reviewLabUrl(lab.exercise, taskId: task.id)),
              child: Text(task.status == TaskStatus.done ? 'See the review on the web' : 'Review it on the web'),
            ),
          ],
        ),
      ),
    );
  }
}
