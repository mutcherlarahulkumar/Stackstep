import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/shared/errors.dart';
import 'package:stackstep/shared/format.dart';
import 'package:stackstep/shared/state_views.dart';

/// Streaks and badges (feature 30).
final FutureProvider<Achievements> achievementsProvider = FutureProvider.autoDispose<Achievements>(
  (ref) => ref.read(apiClientProvider).achievements(),
);

const _badgeIcons = <BadgeKey, IconData>{
  BadgeKey.firstPr: LucideIcons.gitMerge,
  BadgeKey.reviews5: LucideIcons.thumbsUp,
  BadgeKey.onTimeWeek: LucideIcons.calendarCheck,
  BadgeKey.streak7: LucideIcons.flame,
  BadgeKey.streak30: LucideIcons.flame,
  BadgeKey.bugHunter: LucideIcons.bug,
  BadgeKey.quizAce: LucideIcons.sparkles,
  BadgeKey.tasks10: LucideIcons.listChecks,
  BadgeKey.tasks25: LucideIcons.trophy,
};

const _badgeColors = <BadgeKey, List<Color>>{
  BadgeKey.firstPr: [Color(0xFF10B981), Color(0xFF0D9488)],
  BadgeKey.reviews5: [Color(0xFF0EA5E9), Color(0xFF4F46E5)],
  BadgeKey.onTimeWeek: [Color(0xFFFBBF24), Color(0xFFEA580C)],
  BadgeKey.streak7: [Color(0xFFF97316), Color(0xFFE11D48)],
  BadgeKey.streak30: [Color(0xFFF43F5E), Color(0xFFC026D3)],
  BadgeKey.bugHunter: [Color(0xFF84CC16), Color(0xFF047857)],
  BadgeKey.quizAce: [Color(0xFF8B5CF6), Color(0xFF7E22CE)],
  BadgeKey.tasks10: [Color(0xFF06B6D4), Color(0xFF1D4ED8)],
  BadgeKey.tasks25: [Color(0xFFFACC15), Color(0xFFD97706)],
};

/// "3-day streak", or how to start one.
String streakLabel(Streak s) {
  if (s.current == 0) return 'Start a streak today';
  final days = '${s.current}-day streak';
  return s.activeToday ? days : '$days · keep it going today';
}

/// A round medal: coloured once earned, grey with a lock before.
class BadgeMedal extends StatelessWidget {
  const BadgeMedal(this.badge, {super.key, this.size = 40});
  final AchievementBadge badge;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = ShadTheme.of(context).colorScheme;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: badge.earned ? null : c.muted,
            gradient: badge.earned
                ? LinearGradient(colors: _badgeColors[badge.key]!, begin: Alignment.topLeft, end: Alignment.bottomRight)
                : null,
          ),
          child: Icon(_badgeIcons[badge.key], size: size * 0.5, color: badge.earned ? Colors.white : c.mutedForeground),
        ),
        if (!badge.earned)
          Positioned(
            right: -2,
            bottom: -2,
            child: Container(
              padding: const EdgeInsets.all(2),
              decoration: BoxDecoration(
                color: c.background,
                shape: BoxShape.circle,
                border: Border.all(color: c.border),
              ),
              child: Icon(LucideIcons.lock, size: size * 0.22, color: c.mutedForeground),
            ),
          ),
      ],
    );
  }
}

/// The flame with today's streak.
class StreakChip extends StatelessWidget {
  const StreakChip(this.streak, {super.key});
  final Streak streak;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final hot = streak.current > 0;
    const orange = Color(0xFFEA580C);
    return Semantics(
      label: streakLabel(streak),
      excludeSemantics: true,
      child: Container(
        key: const Key('streak-chip'),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: hot ? orange.withValues(alpha: 0.12) : t.colorScheme.muted,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(LucideIcons.flame, size: 14, color: hot ? orange : t.colorScheme.mutedForeground),
            const SizedBox(width: 4),
            Text(
              '${streak.current}',
              style: t.textTheme.small.copyWith(fontWeight: FontWeight.w700, color: hot ? orange : t.colorScheme.mutedForeground),
            ),
          ],
        ),
      ),
    );
  }
}

/// The strip on top of the board: streak, earned medals, and a button to see them all.
class AchievementsStrip extends ConsumerWidget {
  const AchievementsStrip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = ref.watch(achievementsProvider).value;
    if (a == null) return const SizedBox.shrink();
    final t = ShadTheme.of(context);
    final earned = a.earned;
    return Padding(
      padding: const EdgeInsets.only(bottom: Space.md),
      child: InkWell(
        key: const Key('achievements-strip'),
        borderRadius: BorderRadius.circular(12),
        onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const BadgesScreen())),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: Space.xs),
          child: Row(
            children: [
              StreakChip(a.streak),
              const SizedBox(width: Space.sm),
              Expanded(
                child: Text(streakLabel(a.streak), style: t.textTheme.muted.copyWith(fontSize: 12), overflow: TextOverflow.ellipsis),
              ),
              for (final b in earned.reversed.take(3)) Padding(padding: const EdgeInsets.only(left: 2), child: BadgeMedal(b, size: 22)),
              const SizedBox(width: Space.xs),
              Text('${earned.length}/${a.badges.length}', style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
              const Icon(LucideIcons.chevronRight, size: 16),
            ],
          ),
        ),
      ),
    );
  }
}

/// Every badge with progress, and the streak.
class BadgesScreen extends ConsumerWidget {
  const BadgesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final q = ref.watch(achievementsProvider);
    final t = ShadTheme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Your badges')),
      body: switch (q) {
        AsyncData(:final value) => RefreshIndicator(
          onRefresh: () => ref.refresh(achievementsProvider.future),
          child: ListView(
            key: const Key('badge-list'),
            padding: const EdgeInsets.all(Space.lg),
            children: [
              ShadCard(
                padding: const EdgeInsets.all(Space.lg),
                child: Row(
                  children: [
                    StreakChip(value.streak),
                    const SizedBox(width: Space.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(streakLabel(value.streak), style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
                          Text(
                            'Longest ${value.streak.longest} ${value.streak.longest == 1 ? 'day' : 'days'}. A day counts when you move a task, send a message, take a quiz or review a pull request.',
                            style: t.textTheme.muted.copyWith(fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: Space.lg),
              for (final b in value.badges)
                Padding(
                  padding: const EdgeInsets.only(bottom: Space.sm),
                  child: ShadCard(
                    padding: const EdgeInsets.all(Space.md),
                    child: Row(
                      children: [
                        BadgeMedal(b),
                        const SizedBox(width: Space.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(b.title, style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
                                  ),
                                  Text(
                                    b.earnedAt != null ? dateLabel(b.earnedAt!) : '${b.progress}/${b.target}',
                                    style: t.textTheme.muted.copyWith(fontSize: 12),
                                  ),
                                ],
                              ),
                              Text(b.description, style: t.textTheme.muted.copyWith(fontSize: 12)),
                              if (!b.earned && b.target > 1) ...[const SizedBox(height: 6), ShadProgress(value: b.progress / b.target)],
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
        AsyncError(:final error) => ErrorState(message: messageFor(error), onRetry: () => ref.invalidate(achievementsProvider)),
        _ => const SkeletonList(height: 64),
      },
    );
  }
}
