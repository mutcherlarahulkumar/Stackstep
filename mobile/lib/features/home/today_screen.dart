import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/core/config.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/features/ai/ai_screen.dart';
import 'package:stackstep/features/attendance/attendance_screen.dart';
import 'package:stackstep/features/calendar/calendar_screen.dart';
import 'package:stackstep/features/chat/inbox_controller.dart';
import 'package:stackstep/features/chat/inbox_screen.dart';
import 'package:stackstep/features/growth/achievements.dart';
import 'package:stackstep/features/growth/portfolio_screen.dart';
import 'package:stackstep/features/growth/review_lab_screen.dart';
import 'package:stackstep/features/home/today.dart';
import 'package:stackstep/features/progress/progress_screen.dart';
import 'package:stackstep/features/tasks/board_controller.dart';
import 'package:stackstep/features/tasks/board_screen.dart';
import 'package:stackstep/features/tasks/task_work.dart';
import 'package:stackstep/shared/brand_mark.dart';
import 'package:stackstep/shared/format.dart';
import 'package:stackstep/shared/motion.dart';
import 'package:stackstep/ui/ui.dart';

/// The student's home: where they stand, what's next and shortcuts to everything else.
class TodayScreen extends ConsumerWidget {
  const TodayScreen({required this.me, required this.onOpenTask, required this.onOpenTab, super.key});

  final Me me;

  /// Opens a task on the board.
  final void Function(String taskId) onOpenTask;

  /// Switches to another tab (1 Chats, 2 Tasks).
  final void Function(int tab) onOpenTab;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final now = ref.watch(clockProvider)();
    final tasks = ref.watch(boardProvider);
    final next = upNext(tasks.value ?? const []);
    final klass = nextClass(ref.watch(calendarProvider).value, now);
    final team = teamThread(ref.watch(studentInboxProvider).value ?? const []);
    return RefreshIndicator(
      onRefresh: () async {
        ref
          ..invalidate(progressProvider)
          ..invalidate(achievementsProvider)
          ..invalidate(calendarProvider);
        await ref.read(boardProvider.notifier).refresh();
      },
      child: ListView(
        key: const Key('today'),
        padding: const EdgeInsets.fromLTRB(Space.lg, Space.lg, Space.lg, Space.xxl),
        children: [
          Enter(
            child: _Hero(me: me, now: now),
          ),
          const SizedBox(height: Space.lg),
          const Enter(delay: Duration(milliseconds: 60), child: _Stats()),
          const SizedBox(height: Space.xl),
          _SectionTitle(title: 'Up next', action: next.isEmpty ? null : ('See your board', () => onOpenTab(2))),
          const SizedBox(height: Space.sm),
          if (tasks.isLoading && !tasks.hasValue)
            const _Placeholder(height: 96)
          else if (next.isEmpty)
            const _Calm()
          else
            for (final (i, task) in next.indexed)
              Enter(
                delay: Duration(milliseconds: 90 + 40 * i),
                child: Padding(
                  padding: const EdgeInsets.only(bottom: Space.md),
                  child: TaskCard(key: Key('today-task-${task.id}'), task: task, onTap: () => onOpenTask(task.id)),
                ),
              ),
          if (klass != null) ...[const SizedBox(height: Space.md), _ClassCard(entry: klass, now: now)],
          if (team != null) ...[const SizedBox(height: Space.md), _TeamCard(thread: team, onOpenTask: onOpenTask)],
          const SizedBox(height: Space.xl),
          const _SectionTitle(title: 'Shortcuts'),
          const SizedBox(height: Space.sm),
          const _Shortcuts(),
        ],
      ),
    );
  }
}

class _Hero extends ConsumerWidget {
  const _Hero({required this.me, required this.now});
  final Me me;
  final DateTime now;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final e = me.enrollment;
    final progress = ref.watch(progressProvider).value;
    final pct = progress?.completionPercent ?? 0;
    final first = me.user.name.trim().split(RegExp(r'\s+')).first;
    final caption = switch (e) {
      null => '',
      _ when e.status == EnrollmentStatus.paused => 'Your internship is paused',
      _ when e.dayNumber == 0 => startsCaption(e.startDate, now),
      _ => 'Day ${e.dayNumber} of ${e.program.days}${e.flowName == null ? '' : ' · ${e.flowName}'}',
    };
    return Semantics(
      container: true,
      label: '${greeting(now.hour)}, $first. $caption. $pct percent done.',
      excludeSemantics: true,
      child: Container(
        key: const Key('today-hero'),
        padding: const EdgeInsets.all(Space.xl),
        decoration: BoxDecoration(
          gradient: BrandMark.gradient,
          borderRadius: const BorderRadius.all(Radii.lg),
          boxShadow: [BoxShadow(color: const Color(0xFF7008E7).withValues(alpha: 0.18), blurRadius: 20, offset: const Offset(0, 6))],
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${greeting(now.hour)}, $first',
                    style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w700, height: 1.2),
                  ),
                  const SizedBox(height: Space.xs),
                  Text(caption, style: TextStyle(color: Colors.white.withValues(alpha: 0.86), fontSize: 14)),
                  const SizedBox(height: Space.md),
                  _GlassButton(
                    key: const Key('today-progress'),
                    icon: LucideIcons.award,
                    label: progress == null ? 'Your progress' : '$pct% done · ${progress.points} points',
                    onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const ProgressScreen())),
                  ),
                ],
              ),
            ),
            const SizedBox(width: Space.md),
            _Ring(percent: pct),
          ],
        ),
      ),
    );
  }
}

/// The completion ring.
class _Ring extends StatelessWidget {
  const _Ring({required this.percent});
  final int percent;

  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
    tween: Tween(begin: 0, end: percent / 100),
    duration: Motion.of(context, const Duration(milliseconds: 900)),
    curve: Curves.easeOutCubic,
    builder: (context, v, _) => SizedBox.square(
      dimension: 84,
      child: CustomPaint(
        painter: _RingPainter(value: v),
        child: Center(
          child: Text(
            '${(v * 100).round()}%',
            style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700),
          ),
        ),
      ),
    ),
  );
}

class _RingPainter extends CustomPainter {
  const _RingPainter({required this.value});
  final double value;

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 8.0;
    final rect = (Offset.zero & size).deflate(stroke / 2);
    final track = Paint()
      ..color = Colors.white.withValues(alpha: 0.22)
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke;
    final fill = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = stroke;
    canvas
      ..drawArc(rect, -math.pi / 2, 2 * math.pi, false, track)
      ..drawArc(rect, -math.pi / 2, 2 * math.pi * value.clamp(0, 1), false, fill);
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.value != value;
}

class _GlassButton extends StatelessWidget {
  const _GlassButton({required this.icon, required this.label, required this.onTap, super.key});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white.withValues(alpha: 0.18),
    borderRadius: const BorderRadius.all(Radii.pill),
    child: InkWell(
      borderRadius: const BorderRadius.all(Radii.pill),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 15, color: Colors.white),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                label,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// Streak, badges and how many tasks are waiting for review.
class _Stats extends ConsumerWidget {
  const _Stats();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = ref.watch(achievementsProvider).value;
    final p = ref.watch(progressProvider).value;
    void badges() => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const BadgesScreen()));
    return Row(
      children: [
        Expanded(
          child: _Tile(
            key: const Key('today-streak'),
            icon: LucideIcons.flame,
            color: const Color(0xFFEA580C),
            value: a == null ? '…' : '${a.streak.current}',
            label: 'day streak',
            onTap: badges,
          ),
        ),
        const SizedBox(width: Space.md),
        Expanded(
          child: _Tile(
            key: const Key('today-badges'),
            icon: LucideIcons.medal,
            color: const Color(0xFF7C3AED),
            value: a == null ? '…' : '${a.earned.length}/${a.badges.length}',
            label: 'badges',
            onTap: badges,
          ),
        ),
        const SizedBox(width: Space.md),
        Expanded(
          child: _Tile(
            icon: LucideIcons.listChecks,
            color: Brand.success,
            value: p == null ? '…' : '${p.done}',
            label: 'tasks done',
            onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const ProgressScreen())),
          ),
        ),
      ],
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.icon, required this.color, required this.value, required this.label, required this.onTap, super.key});
  final IconData icon;
  final Color color;
  final String value;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    return Semantics(
      button: true,
      label: '$value $label',
      excludeSemantics: true,
      child: ShadCard(
        padding: EdgeInsets.zero,
        child: InkWell(
          borderRadius: const BorderRadius.all(Radii.md),
          onTap: () {
            unawaited(HapticFeedback.selectionClick());
            onTap();
          },
          child: Padding(
            padding: const EdgeInsets.all(Space.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(color: color.withValues(alpha: 0.12), shape: BoxShape.circle),
                  child: Icon(icon, size: 16, color: color),
                ),
                const SizedBox(height: Space.sm),
                Text(value, style: t.textTheme.large.copyWith(fontSize: 20, fontWeight: FontWeight.w700)),
                Text(label, style: t.textTheme.muted.copyWith(fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, this.action});
  final String title;
  final (String, VoidCallback)? action;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    return Row(
      children: [
        Expanded(
          child: Semantics(header: true, child: Text(title, style: t.textTheme.large.copyWith(fontSize: 17))),
        ),
        if (action case (final label, final onTap)) ShadButton.link(size: ShadButtonSize.sm, onPressed: onTap, child: Text(label)),
      ],
    );
  }
}

class _Calm extends StatelessWidget {
  const _Calm();

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    return ShadCard(
      key: const Key('today-calm'),
      padding: const EdgeInsets.all(Space.lg),
      child: Row(
        children: [
          Icon(LucideIcons.coffee, color: t.colorScheme.mutedForeground),
          const SizedBox(width: Space.md),
          Expanded(
            child: Text(
              "You're all caught up. New tickets arrive in your chats, so it's a good time to practise in the review lab.",
              style: t.textTheme.muted,
            ),
          ),
        ],
      ),
    );
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder({required this.height});
  final double height;

  @override
  Widget build(BuildContext context) => Container(
    height: height,
    decoration: BoxDecoration(color: ShadTheme.of(context).colorScheme.muted, borderRadius: const BorderRadius.all(Radii.md)),
  );
}

/// The next live class, with a button to join on the web once it's close.
class _ClassCard extends StatelessWidget {
  const _ClassCard({required this.entry, required this.now});
  final CalendarEntry entry;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final at = entry.at!;
    final soon = at.difference(now).inMinutes <= 15;
    return ShadCard(
      key: const Key('today-class'),
      padding: const EdgeInsets.all(Space.lg),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFFE11D48).withValues(alpha: 0.12),
              borderRadius: const BorderRadius.all(Radii.md),
            ),
            child: const Icon(LucideIcons.video, color: Color(0xFFE11D48), size: 20),
          ),
          const SizedBox(width: Space.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(entry.title ?? 'Live class', style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
                Text(soon ? 'Starting now' : dateTimeLabel(at), style: t.textTheme.muted.copyWith(fontSize: 12)),
              ],
            ),
          ),
          if (entry.classId case final id?)
            ShadButton(
              size: ShadButtonSize.sm,
              onPressed: () => openLink(context, AppConfig.classUrl(id)),
              child: Text(soon ? 'Join' : 'Open'),
            ),
        ],
      ),
    );
  }
}

/// The team room, with its unread count and the last message.
class _TeamCard extends StatelessWidget {
  const _TeamCard({required this.thread, required this.onOpenTask});
  final Thread thread;
  final void Function(String taskId) onOpenTask;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final last = thread.lastMessage;
    return ShadCard(
      key: const Key('today-team'),
      padding: EdgeInsets.zero,
      child: InkWell(
        borderRadius: const BorderRadius.all(Radii.md),
        onTap: () => openStudentThread(context, thread.persona, onOpenTask: onOpenTask),
        child: Padding(
          padding: const EdgeInsets.all(Space.lg),
          child: Row(
            children: [
              PersonaAvatar(thread.persona, size: 42),
              const SizedBox(width: Space.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Team room', style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
                    Text(
                      last == null ? 'Say hi to your team' : previewLine(last.body, max: 70),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: t.textTheme.muted.copyWith(fontSize: 13),
                    ),
                  ],
                ),
              ),
              if (thread.unread > 0)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(color: t.colorScheme.primary, borderRadius: const BorderRadius.all(Radii.pill)),
                  child: Text(
                    '${thread.unread}',
                    style: TextStyle(color: t.colorScheme.primaryForeground, fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                )
              else
                Icon(LucideIcons.chevronRight, size: 18, color: t.colorScheme.mutedForeground),
            ],
          ),
        ),
      ),
    );
  }
}

class _Shortcuts extends StatelessWidget {
  const _Shortcuts();

  @override
  Widget build(BuildContext context) {
    void push(Widget w) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => w));
    final items = <(Key, IconData, Color, String, VoidCallback)>[
      (const Key('shortcut-ai'), LucideIcons.sparkles, const Color(0xFFC026D3), 'AI helper', () => push(const AIHelperScreen())),
      (const Key('shortcut-lab'), LucideIcons.gitPullRequest, const Color(0xFF059669), 'Review lab', () => push(const ReviewLabScreen())),
      (const Key('shortcut-attendance'), LucideIcons.treePine, const Color(0xFF16A34A), 'Attendance', () => push(const AttendanceScreen())),
      (const Key('shortcut-badges'), LucideIcons.medal, const Color(0xFF7C3AED), 'Badges', () => push(const BadgesScreen())),
      (const Key('shortcut-portfolio'), LucideIcons.globe, const Color(0xFF0284C7), 'Portfolio', () => push(const PortfolioScreen())),
      (const Key('shortcut-progress'), LucideIcons.award, const Color(0xFFD97706), 'Progress', () => push(const ProgressScreen())),
    ];
    return LayoutBuilder(
      builder: (context, c) {
        final columns = c.maxWidth > 520 ? 6 : 3;
        final w = (c.maxWidth - Space.md * (columns - 1)) / columns;
        return Wrap(
          spacing: Space.md,
          runSpacing: Space.md,
          children: [
            for (final (key, icon, color, label, onTap) in items)
              SizedBox(
                width: w,
                child: _Shortcut(key: key, icon: icon, color: color, label: label, onTap: onTap),
              ),
          ],
        );
      },
    );
  }
}

class _Shortcut extends StatelessWidget {
  const _Shortcut({required this.icon, required this.color, required this.label, required this.onTap, super.key});
  final IconData icon;
  final Color color;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: ShadCard(
        padding: EdgeInsets.zero,
        child: InkWell(
          borderRadius: const BorderRadius.all(Radii.md),
          onTap: () {
            unawaited(HapticFeedback.selectionClick());
            onTap();
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: Space.lg, horizontal: Space.sm),
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: const BorderRadius.all(Radii.md)),
                  child: Icon(icon, color: color, size: 22),
                ),
                const SizedBox(height: Space.sm),
                Text(
                  label,
                  style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600),
                  textAlign: TextAlign.center,
                  maxLines: 1,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
