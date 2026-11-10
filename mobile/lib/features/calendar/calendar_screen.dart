import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/core/config.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/features/chat/inbox_controller.dart';
import 'package:stackstep/features/tasks/task_work.dart';
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
        AsyncData(:final value) => _Views(calendar: value, onOpenTask: onOpenTask),
        AsyncError(:final error) => ErrorState(message: messageFor(error), onRetry: () => ref.invalidate(calendarProvider)),
        _ => const SkeletonList(rows: 4, height: 96),
      },
    );
  }
}

enum _Mode { day, agenda }

/// Day (a week strip over an hour timeline, like Google Calendar) or the agenda list.
class _Views extends StatefulWidget {
  const _Views({required this.calendar, required this.onOpenTask});
  final Calendar calendar;
  final void Function(String taskId) onOpenTask;

  @override
  State<_Views> createState() => _ViewsState();
}

class _ViewsState extends State<_Views> {
  _Mode _mode = _Mode.day;

  @override
  Widget build(BuildContext context) {
    Widget tab(_Mode m, String label, IconData icon) {
      final on = _mode == m;
      final child = Text(label);
      final lead = Icon(icon, size: 16);
      return on
          ? ShadButton.secondary(
              key: Key('calendar-mode-${m.name}'),
              size: ShadButtonSize.sm,
              leading: lead,
              onPressed: () {},
              child: child,
            )
          : ShadButton.ghost(
              key: Key('calendar-mode-${m.name}'),
              size: ShadButtonSize.sm,
              leading: lead,
              onPressed: () => setState(() => _mode = m),
              child: child,
            );
    }

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Space.md, Space.sm, Space.md, 0),
          child: Row(
            children: [
              tab(_Mode.day, 'Day', LucideIcons.calendarClock),
              const SizedBox(width: Space.xs),
              tab(_Mode.agenda, 'Agenda', LucideIcons.list),
            ],
          ),
        ),
        Expanded(
          child: switch (_mode) {
            _Mode.day => _DayTimeline(calendar: widget.calendar, onOpenTask: widget.onOpenTask),
            _Mode.agenda => _Agenda(calendar: widget.calendar, onOpenTask: widget.onOpenTask),
          },
        ),
      ],
    );
  }
}

const double _hour = 56;
const _weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

class _DayTimeline extends ConsumerStatefulWidget {
  const _DayTimeline({required this.calendar, required this.onOpenTask});
  final Calendar calendar;
  final void Function(String taskId) onOpenTask;

  @override
  ConsumerState<_DayTimeline> createState() => _DayTimelineState();
}

class _DayTimelineState extends ConsumerState<_DayTimeline> {
  DateTime? _picked;
  final _scroll = ScrollController();
  var _scrolled = false;

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final now = ref.watch(clockProvider)();
    final today = DateTime(now.year, now.month, now.day);
    final day = _picked ?? today;
    final monday = DateTime(day.year, day.month, day.day - (day.weekday - 1));
    final week = [for (var i = 0; i < 7; i++) DateTime(monday.year, monday.month, monday.day + i)];
    final byDate = widget.calendar.byDate;
    final entries = byDate[day] ?? const <CalendarEntry>[];
    final personas = {for (final th in ref.watch(studentInboxProvider).value ?? const <Thread>[]) th.persona.id: th.persona};
    final timed = entries.where((e) => e.at != null).toList()..sort((a, b) => a.at!.compareTo(b.at!));
    final allDay = entries.where((e) => e.at == null).toList();
    final isToday = day == today;
    final nowMin = now.hour * 60 + now.minute;
    if (!_scrolled) {
      _scrolled = true;
      final first = timed.isEmpty ? 8 * 60 : _minutes(timed.first.at!);
      final target = ((isToday ? nowMin : first) - 60).clamp(0, 24 * 60) / 60 * _hour;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) _scroll.jumpTo(target.clamp(0, _scroll.position.maxScrollExtent));
      });
    }

    void sheet(CalendarEntry e) => showModalBottomSheet<void>(
      context: context,
      backgroundColor: t.colorScheme.background,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(Space.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(DateFormat('EEEE d MMMM').format(e.date), style: t.textTheme.muted),
              const SizedBox(height: Space.sm),
              _EntryCard(
                entry: e,
                persona: e.personaId == null ? null : personas[e.personaId],
                onOpenTask: (id) {
                  Navigator.of(ctx).pop();
                  widget.onOpenTask(id);
                },
              ),
              if (e.kind == CalendarKind.task && e.taskId == null) ...[
                const SizedBox(height: Space.sm),
                Text('It opens on your board the moment it arrives.', style: t.textTheme.muted.copyWith(fontSize: 12)),
              ],
            ],
          ),
        ),
      ),
    );

    // Overlapping blocks share the width, side by side.
    final placed = <({CalendarEntry e, double top, double height, int col})>[];
    for (final e in timed) {
      final top = _minutes(e.at!).toDouble();
      final span = e.kind == CalendarKind.classSession && e.dueAt != null ? e.dueAt!.difference(e.at!).inMinutes.toDouble() : 30.0;
      final height = span.clamp(24.0, 24 * 60 - top);
      final used = {
        for (final p in placed)
          if (p.top + p.height > top) p.col,
      };
      var col = 0;
      while (used.contains(col)) {
        col++;
      }
      placed.add((e: e, top: top, height: height, col: col));
    }
    final cols = placed.fold(1, (m, p) => p.col + 1 > m ? p.col + 1 : m);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(calendarProvider),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: Space.xs, vertical: Space.sm),
            child: Row(
              children: [
                IconButton(
                  tooltip: 'Previous week',
                  icon: const Icon(LucideIcons.chevronLeft, size: 18),
                  onPressed: () => setState(() => _picked = DateTime(day.year, day.month, day.day - 7)),
                ),
                Expanded(
                  child: Row(
                    children: [
                      for (final (i, d) in week.indexed)
                        Expanded(
                          child: _StripDay(
                            date: d,
                            letter: _weekdays[i],
                            selected: d == day,
                            today: d == today,
                            busy: byDate.containsKey(d),
                            onTap: () => setState(() => _picked = d),
                          ),
                        ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Next week',
                  icon: const Icon(LucideIcons.chevronRight, size: 18),
                  onPressed: () => setState(() => _picked = DateTime(day.year, day.month, day.day + 7)),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: Space.lg),
            child: Row(
              children: [
                Flexible(
                  child: Semantics(
                    header: true,
                    child: Text(
                      isToday ? 'Today' : DateFormat('EEE d MMM').format(day),
                      key: const Key('calendar-day-title'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
                if (entries.isNotEmpty && entries.first.day > 0) ...[
                  const SizedBox(width: Space.sm),
                  ShadBadge.outline(child: Text('Day ${entries.first.day}')),
                ],
                const SizedBox(width: Space.sm),
                const Spacer(),
                if (!isToday)
                  ShadButton.link(size: ShadButtonSize.sm, onPressed: () => setState(() => _picked = null), child: const Text('Today')),
              ],
            ),
          ),
          for (final e in allDay)
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.lg, Space.sm, Space.lg, 0),
              child: _EntryCard(entry: e, persona: null, onOpenTask: widget.onOpenTask),
            ),
          const SizedBox(height: Space.sm),
          const Divider(height: 1),
          Expanded(
            child: SingleChildScrollView(
              key: const Key('calendar-timeline'),
              controller: _scroll,
              physics: const AlwaysScrollableScrollPhysics(),
              child: SizedBox(
                height: 24 * _hour + Space.lg,
                child: LayoutBuilder(
                  builder: (context, box) {
                    const gutter = 56.0;
                    final width = box.maxWidth - gutter - Space.md;
                    return Stack(
                      children: [
                        for (var h = 0; h < 24; h++) ...[
                          Positioned(
                            top: h * _hour,
                            left: gutter,
                            right: 0,
                            child: Divider(height: 1, color: t.colorScheme.border.withValues(alpha: 0.7)),
                          ),
                          if (h > 0)
                            Positioned(
                              top: h * _hour - 7,
                              left: 0,
                              width: gutter - 8,
                              child: Text(
                                DateFormat('h a').format(DateTime(2000, 1, 1, h)),
                                textAlign: TextAlign.right,
                                style: t.textTheme.muted.copyWith(fontSize: 10),
                              ),
                            ),
                        ],
                        for (final p in placed)
                          Positioned(
                            top: p.top / 60 * _hour + 1,
                            height: p.height / 60 * _hour - 2,
                            left: gutter + 2 + p.col * width / cols,
                            width: width / cols - 4,
                            child: _Block(entry: p.e, onTap: () => sheet(p.e)),
                          ),
                        if (isToday)
                          Positioned(
                            key: const Key('calendar-now'),
                            top: nowMin / 60 * _hour - 5,
                            left: gutter - 5,
                            right: 0,
                            child: IgnorePointer(
                              child: Row(
                                children: [
                                  Container(
                                    width: 10,
                                    height: 10,
                                    decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
                                  ),
                                  Expanded(child: Container(height: 2, color: Colors.red)),
                                ],
                              ),
                            ),
                          ),
                        if (entries.isEmpty)
                          Positioned(
                            top: 9 * _hour,
                            left: gutter,
                            right: Space.md,
                            child: Text(
                              'Nothing scheduled. A good day to catch up or read ahead.',
                              textAlign: TextAlign.center,
                              style: t.textTheme.muted,
                            ),
                          ),
                      ],
                    );
                  },
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

int _minutes(DateTime at) {
  final l = at.toLocal();
  return l.hour * 60 + l.minute;
}

class _StripDay extends StatelessWidget {
  const _StripDay({
    required this.date,
    required this.letter,
    required this.selected,
    required this.today,
    required this.busy,
    required this.onTap,
  });
  final DateTime date;
  final String letter;
  final bool selected;
  final bool today;
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    return Semantics(
      selected: selected,
      button: true,
      label: DateFormat('EEEE d MMMM').format(date),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          key: Key('calendar-strip-${DateFormat('yyyy-MM-dd').format(date)}'),
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Ink(
            padding: const EdgeInsets.symmetric(vertical: Space.xs),
            decoration: BoxDecoration(color: selected ? t.colorScheme.accent : null, borderRadius: BorderRadius.circular(12)),
            child: ExcludeSemantics(
              child: Column(
                children: [
                  Text(letter, style: t.textTheme.muted.copyWith(fontSize: 10, color: today ? t.colorScheme.primary : null)),
                  const SizedBox(height: 2),
                  Container(
                    width: 28,
                    height: 28,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: today ? t.colorScheme.primary : null, shape: BoxShape.circle),
                    child: Text(
                      '${date.day}',
                      style: t.textTheme.small.copyWith(
                        color: today ? t.colorScheme.primaryForeground : t.colorScheme.foreground,
                        fontWeight: today ? FontWeight.w700 : FontWeight.w500,
                      ),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Container(
                    width: 4,
                    height: 4,
                    decoration: BoxDecoration(color: busy ? t.colorScheme.primary : Colors.transparent, shape: BoxShape.circle),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Block extends StatelessWidget {
  const _Block({required this.entry, required this.onTap});
  final CalendarEntry entry;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final e = entry;
    final (bg, fg, border) = switch (e) {
      CalendarEntry(kind: CalendarKind.classSession) => (const Color(0x26F43F5E), t.colorScheme.foreground, const Color(0x80F43F5E)),
      CalendarEntry(status: TaskStatus.done) => (const Color(0x1F22C55E), t.colorScheme.foreground, const Color(0x6622C55E)),
      CalendarEntry(released: true) => (
        t.colorScheme.primary.withValues(alpha: 0.15),
        t.colorScheme.foreground,
        t.colorScheme.primary.withValues(alpha: 0.5),
      ),
      _ => (t.colorScheme.muted, t.colorScheme.mutedForeground, t.colorScheme.border),
    };
    final time = DateFormat('h:mm a').format(e.at!.toLocal());
    final end = e.kind == CalendarKind.classSession && e.dueAt != null ? ' to ${DateFormat('h:mm a').format(e.dueAt!.toLocal())}' : '';
    return Semantics(
      button: true,
      label: '${e.title ?? ''}, $time$end',
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          key: Key('calendar-block-${e.title ?? e.kind.wire}'),
          borderRadius: BorderRadius.circular(8),
          onTap: onTap,
          child: Ink(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
            decoration: BoxDecoration(
              color: bg,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: border),
            ),
            child: ExcludeSemantics(
              child: LayoutBuilder(
                builder: (context, box) => Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          e.kind == CalendarKind.classSession
                              ? LucideIcons.video
                              : (e.taskType == null ? LucideIcons.circleDot : taskTypeIcon(e.taskType!)),
                          size: 12,
                          color: fg,
                        ),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            e.title ?? '',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: t.textTheme.small.copyWith(fontSize: 12, color: fg, fontWeight: FontWeight.w600),
                          ),
                        ),
                        if (e.kind == CalendarKind.task && e.taskId == null) Icon(LucideIcons.lock, size: 11, color: fg),
                      ],
                    ),
                    if (box.maxHeight >= 34) Text('$time$end', maxLines: 1, style: t.textTheme.muted.copyWith(fontSize: 11)),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
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
        : date == DateTime(today.year, today.month, today.day + 1)
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
    final open = switch (e) {
      CalendarEntry(classId: final id?) => () => openLink(context, AppConfig.classUrl(id)),
      CalendarEntry(taskId: final id?) => () => onOpenTask(id),
      _ => null,
    };
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
