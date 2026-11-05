import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/features/chat/inbox_controller.dart';
import 'package:stackstep/shared/errors.dart';
import 'package:stackstep/shared/motion.dart';
import 'package:stackstep/shared/state_views.dart';
import 'package:stackstep/ui/ui.dart';

final FutureProvider<Calendar> calendarProvider = FutureProvider.autoDispose<Calendar>((ref) => ref.watch(apiClientProvider).myCalendar());

/// The internship by day: what's out, what's scheduled, and a marker for surprise tasks
/// (their title and time stay hidden until they land).
class CalendarScreen extends ConsumerWidget {
  const CalendarScreen({required this.onOpenTask, super.key});

  /// Opens a released task on the board.
  final void Function(String taskId) onOpenTask;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cal = ref.watch(calendarProvider);
    return FadeSwitch(
      child: switch (cal) {
        AsyncData(:final value) => _Agenda(calendar: value, onOpenTask: onOpenTask),
        AsyncError(:final error) => ErrorState(message: messageFor(error), onRetry: () => ref.invalidate(calendarProvider)),
        _ => const SkeletonList(rows: 4, height: 96),
      },
    );
  }
}

class _Agenda extends ConsumerStatefulWidget {
  const _Agenda({required this.calendar, required this.onOpenTask});
  final Calendar calendar;
  final void Function(String taskId) onOpenTask;

  @override
  ConsumerState<_Agenda> createState() => _AgendaState();
}

class _AgendaState extends ConsumerState<_Agenda> {
  var _showPast = false;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final now = ref.watch(clockProvider)();
    final today = DateTime(now.year, now.month, now.day);
    final days = widget.calendar.byDate;
    final personas = {for (final th in ref.watch(studentInboxProvider).value ?? const <Thread>[]) th.persona.id: th.persona};
    final past = days.keys.where((d) => d.isBefore(today)).length;
    final shown = days.entries.where((e) => _showPast || !e.key.isBefore(today)).toList();
    if (days.isEmpty) {
      return const EmptyState(
        icon: LucideIcons.calendarDays,
        title: 'Nothing scheduled yet',
        body: 'Your days fill in once your flow is assigned. Your team lead will tell you in chat.',
      );
    }
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(calendarProvider),
      child: ListView(
        key: const Key('calendar-list'),
        padding: const EdgeInsets.all(Space.lg),
        children: [
          if (past > 0)
            Align(
              alignment: Alignment.centerLeft,
              child: ShadButton.ghost(
                key: const Key('calendar-past'),
                size: ShadButtonSize.sm,
                leading: Icon(_showPast ? LucideIcons.chevronUp : LucideIcons.history, size: 16),
                onPressed: () => setState(() => _showPast = !_showPast),
                child: Text(_showPast ? 'Hide earlier days' : 'Show $past earlier ${past == 1 ? 'day' : 'days'}'),
              ),
            ),
          if (shown.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: Space.xl),
              child: Text('Every scheduled day is behind you. Well done.', style: t.textTheme.muted),
            ),
          for (final MapEntry(key: date, value: entries) in shown)
            _DayBlock(date: date, today: today, entries: entries, personas: personas, onOpenTask: widget.onOpenTask),
        ],
      ),
    );
  }
}

class _DayBlock extends StatelessWidget {
  const _DayBlock({required this.date, required this.today, required this.entries, required this.personas, required this.onOpenTask});
  final DateTime date;
  final DateTime today;
  final List<CalendarEntry> entries;
  final Map<String, Persona> personas;
  final void Function(String taskId) onOpenTask;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final isToday = date == today;
    final day = entries.first.day;
    final label = isToday
        ? 'Today'
        : date == today.add(const Duration(days: 1))
        ? 'Tomorrow'
        : DateFormat('EEEE').format(date);
    return Padding(
      key: Key('calendar-day-${DateFormat('yyyy-MM-dd').format(date)}'),
      padding: const EdgeInsets.only(bottom: Space.xl),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 52,
            padding: const EdgeInsets.symmetric(vertical: Space.sm),
            decoration: BoxDecoration(
              color: isToday ? t.colorScheme.primary : t.colorScheme.muted,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              children: [
                Text(
                  DateFormat('MMM').format(date).toUpperCase(),
                  style: t.textTheme.small.copyWith(
                    fontSize: 11,
                    color: isToday ? t.colorScheme.primaryForeground : t.colorScheme.mutedForeground,
                  ),
                ),
                Text(
                  '${date.day}',
                  style: t.textTheme.h4.copyWith(color: isToday ? t.colorScheme.primaryForeground : t.colorScheme.foreground),
                ),
              ],
            ),
          ),
          const SizedBox(width: Space.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Semantics(
                  header: true,
                  child: Text(day > 0 ? '$label · Day $day' : label, style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
                ),
                const SizedBox(height: Space.sm),
                for (final e in entries)
                  Padding(
                    padding: const EdgeInsets.only(bottom: Space.sm),
                    child: _EntryCard(entry: e, persona: e.personaId == null ? null : personas[e.personaId], onOpenTask: onOpenTask),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _EntryCard extends StatelessWidget {
  const _EntryCard({required this.entry, required this.persona, required this.onOpenTask});
  final CalendarEntry entry;
  final Persona? persona;
  final void Function(String taskId) onOpenTask;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final e = entry;
    if (e.kind == CalendarKind.surprise) {
      return Container(
        key: const Key('calendar-surprise'),
        padding: const EdgeInsets.all(Space.md),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: t.colorScheme.primary.withValues(alpha: 0.5)),
          color: t.colorScheme.primary.withValues(alpha: 0.06),
        ),
        child: Row(
          children: [
            Icon(LucideIcons.gift, size: 18, color: t.colorScheme.primary),
            const SizedBox(width: Space.sm),
            Expanded(child: Text('A surprise task lands sometime this day', style: t.textTheme.small)),
          ],
        ),
      );
    }
    final time = e.at == null ? '' : DateFormat('h:mm a').format(e.at!.toLocal());
    final subtitle = switch (e) {
      CalendarEntry(kind: CalendarKind.classSession) => 'Live class at $time',
      CalendarEntry(released: true, status: final s?) => s.label,
      _ => 'Arrives at $time',
    };
    final open = e.taskId == null ? null : () => onOpenTask(e.taskId!);
    return Semantics(
      button: open != null,
      child: ShadCard(
        key: Key('calendar-entry-${e.title ?? e.kind.wire}'),
        padding: EdgeInsets.zero,
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: open,
            child: Padding(
              padding: const EdgeInsets.all(Space.md),
              child: Row(
                children: [
                  Icon(
                    e.kind == CalendarKind.classSession
                        ? LucideIcons.video
                        : (e.taskType == null ? LucideIcons.circleDot : taskTypeIcon(e.taskType!)),
                    size: 18,
                    color: e.released ? t.colorScheme.primary : t.colorScheme.mutedForeground,
                  ),
                  const SizedBox(width: Space.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(e.title ?? '', style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
                        Text(persona == null ? subtitle : '$subtitle · ${persona!.name}', style: t.textTheme.muted.copyWith(fontSize: 12)),
                      ],
                    ),
                  ),
                  if (open != null)
                    const Icon(LucideIcons.chevronRight, size: 16)
                  else
                    Icon(LucideIcons.lock, size: 14, color: t.colorScheme.mutedForeground),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
