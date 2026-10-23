/// Stackstep's own components, composed from shadcn_ui primitives.
/// Screens use these instead of raw widgets so spacing, states and copy stay consistent.
library;

import 'package:flutter/material.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/core/theme.dart';

/// Label + control + description/error, with the error announced to screen readers.
class AppField extends StatelessWidget {
  const AppField({required this.label, required this.child, super.key, this.description, this.error, this.trailingLabel});

  final String label;
  final Widget child;
  final String? description;
  final String? error;
  final Widget? trailingLabel;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: t.textTheme.small.copyWith(color: error != null ? t.colorScheme.destructive : null),
              ),
            ),
            ?trailingLabel,
          ],
        ),
        const SizedBox(height: 6),
        child,
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Semantics(
              liveRegion: true,
              child: Text(error!, style: t.textTheme.small.copyWith(color: t.colorScheme.destructive, fontWeight: FontWeight.w500)),
            ),
          )
        else if (description != null)
          Padding(padding: const EdgeInsets.only(top: 6), child: Text(description!, style: t.textTheme.muted)),
      ],
    );
  }
}

/// "42 / 120" counter that turns red past the limit.
class CharCounter extends StatelessWidget {
  const CharCounter({required this.length, required this.max, super.key});

  final int length;
  final int max;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    return Text(
      '$length / $max',
      style: t.textTheme.muted.copyWith(
        fontSize: 12,
        color: length > max ? t.colorScheme.destructive : null,
        fontFeatures: const [FontFeature.tabularFigures()],
      ),
    );
  }
}

({Color bg, Color fg}) _statusColors(TaskStatus s, ShadColorScheme c) {
  Color tint(Color x) => Color.alphaBlend(x.withValues(alpha: 0.14), c.background);
  return switch (s) {
    TaskStatus.todo => (bg: c.secondary, fg: c.secondaryForeground),
    TaskStatus.inProgress => (bg: tint(c.primary), fg: c.primary),
    TaskStatus.inReview => (bg: tint(Brand.warning), fg: Brand.warning),
    TaskStatus.changesRequested => (bg: tint(c.destructive), fg: c.destructive),
    TaskStatus.done => (bg: tint(Brand.success), fg: Brand.success),
    TaskStatus.cancelled => (bg: c.muted, fg: c.mutedForeground),
  };
}

class StatusBadge extends StatelessWidget {
  const StatusBadge(this.status, {super.key});
  final TaskStatus status;

  @override
  Widget build(BuildContext context) {
    final colors = _statusColors(status, ShadTheme.of(context).colorScheme);
    return ShadBadge(
      backgroundColor: colors.bg,
      hoverBackgroundColor: colors.bg,
      foregroundColor: colors.fg,
      child: Text(status.label),
    );
  }
}

IconData taskTypeIcon(TaskType t) => switch (t) {
  TaskType.feature => LucideIcons.sparkles,
  TaskType.bugFix => LucideIcons.bug,
  TaskType.dsa => LucideIcons.binary,
  TaskType.docReading => LucideIcons.bookOpen,
  TaskType.quiz => LucideIcons.listChecks,
  TaskType.gitChore => LucideIcons.gitBranch,
  TaskType.codeReview => LucideIcons.messageSquareCode,
  TaskType.standup => LucideIcons.users,
};

class TypeBadge extends StatelessWidget {
  const TypeBadge(this.type, {super.key});
  final TaskType type;

  @override
  Widget build(BuildContext context) => ShadBadge.outline(
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [Icon(taskTypeIcon(type), size: 12), const SizedBox(width: 4), Text(type.label)],
    ),
  );
}

/// Toasts through shadcn's toaster (installed by ShadAppBuilder).
void showToast(BuildContext context, String message, {bool error = false, String? title}) {
  final toaster = ShadToaster.maybeOf(context);
  if (toaster == null) return;
  toaster.show(
    error
        ? ShadToast.destructive(title: Text(title ?? message), description: title == null ? null : Text(message))
        : ShadToast(title: Text(title ?? message), description: title == null ? null : Text(message)),
  );
}

/// Inline alert for form- or screen-level problems.
class ErrorAlert extends StatelessWidget {
  const ErrorAlert({required this.message, super.key, this.title = 'Something went wrong'});

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: ShadAlert.destructive(icon: const Icon(LucideIcons.circleAlert), title: Text(title), description: Text(message)),
  );
}
