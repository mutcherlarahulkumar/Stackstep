import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/api_client.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/api/validation.dart';
import 'package:stackstep/core/config.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/features/admin/students_controller.dart';
import 'package:stackstep/features/chat/inbox_controller.dart';
import 'package:stackstep/shared/errors.dart';
import 'package:stackstep/shared/format.dart';
import 'package:stackstep/shared/state_views.dart';
import 'package:stackstep/ui/ui.dart';

/// The one admin job the mobile app supports. Everything else lives on desktop.
class DesktopNotice extends StatelessWidget {
  const DesktopNotice({super.key});

  @override
  Widget build(BuildContext context) {
    return ShadAlert(
      key: const Key('desktop-notice'),
      icon: const Icon(LucideIcons.monitor),
      title: const Text('The admin console lives on desktop'),
      description: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Flows, the task library and reviews need a bigger screen. On your phone you can assign tasks and reply to students.'),
          const SizedBox(height: Space.sm),
          ShadButton.outline(
            size: ShadButtonSize.sm,
            leading: const Icon(LucideIcons.copy, size: 14),
            onPressed: () {
              unawaited(Clipboard.setData(const ClipboardData(text: AppConfig.webConsoleUrl)));
              showToast(context, 'Link copied', title: 'Open it on your computer');
            },
            child: const Text('Copy desktop link'),
          ),
        ],
      ),
    );
  }
}

class StudentPickerScreen extends ConsumerWidget {
  const StudentPickerScreen({required this.onPick, super.key});

  final ValueChanged<StudentRow> onPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final students = ref.watch(studentsProvider);
    final t = ShadTheme.of(context);
    return CustomScrollView(
      slivers: [
        const SliverPadding(
          padding: EdgeInsets.fromLTRB(Space.lg, Space.sm, Space.lg, 0),
          sliver: SliverToBoxAdapter(child: DesktopNotice()),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(Space.lg, Space.lg, Space.lg, Space.sm),
          sliver: SliverToBoxAdapter(
            child: ShadInput(
              key: const Key('student-search'),
              placeholder: const Text('Search by name or GitHub login'),
              leading: const Icon(LucideIcons.search, size: 16),
              maxLength: 100,
              onChanged: ref.read(studentsProvider.notifier).search,
            ),
          ),
        ),
        if (students.value?.searching ?? false) const SliverToBoxAdapter(child: LinearProgressIndicator(minHeight: 2)),
        switch (students) {
          AsyncData(:final value) when value.items.isEmpty => SliverFillRemaining(
            hasScrollBody: false,
            child: EmptyState(
              icon: LucideIcons.userSearch,
              title: value.query.isEmpty ? 'No students yet' : 'No students match “${value.query}”',
              body: value.query.isEmpty
                  ? 'Students appear here once they join a cohort you manage.'
                  : 'Check the spelling, or search by their GitHub login.',
            ),
          ),
          AsyncValue(:final value?) => SliverList.builder(
            itemCount: value.items.length + (value.nextCursor != null ? 1 : 0),
            itemBuilder: (context, i) {
              if (i == value.items.length) {
                unawaited(ref.read(studentsProvider.notifier).loadMore());
                return const Padding(
                  padding: EdgeInsets.all(Space.lg),
                  child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
                );
              }
              final s = value.items[i];
              final paused = s.enrollment.status != EnrollmentStatus.active;
              return ListTile(
                key: Key('student-${s.user.githubLogin}'),
                minTileHeight: 64,
                contentPadding: const EdgeInsets.symmetric(horizontal: Space.lg),
                leading: ShadAvatar(s.user.avatarUrl ?? '', placeholder: Text(s.user.initials), size: const Size.square(40)),
                title: Text(s.user.name, style: t.textTheme.large.copyWith(fontSize: 16)),
                subtitle: Text(
                  '@${s.user.githubLogin} · Day ${s.enrollment.dayNumber}/${s.enrollment.program.days} · ${s.openTasks} open',
                  style: t.textTheme.muted,
                ),
                trailing: paused
                    ? ShadBadge.secondary(child: Text(s.enrollment.status.wire == 'paused' ? 'Paused' : 'Inactive'))
                    : const Icon(LucideIcons.chevronRight, size: 18),
                enabled: !paused,
                onTap: paused ? null : () => onPick(s),
              );
            },
          ),
          AsyncError(:final error) => SliverFillRemaining(
            hasScrollBody: false,
            child: ErrorState(message: messageFor(error), onRetry: () => ref.invalidate(studentsProvider)),
          ),
          _ => const SliverFillRemaining(child: SkeletonList(rows: 6, height: 56)),
        },
      ],
    );
  }
}

enum _DuePreset { twoHours, todayEvening, tomorrowEvening, custom }

class AssignTaskScreen extends ConsumerStatefulWidget {
  const AssignTaskScreen({required this.student, super.key});
  final StudentRow student;

  @override
  ConsumerState<AssignTaskScreen> createState() => _AssignTaskScreenState();
}

class _AssignTaskScreenState extends ConsumerState<AssignTaskScreen> {
  final _title = TextEditingController();
  final _brief = TextEditingController();
  final _linkName = TextEditingController();
  final _linkUrl = TextEditingController();
  TaskType _type = TaskType.feature;

  /// Null until the admin picks one; the server then uses the default team lead.
  String? _personaId;
  ReviewMode _reviewMode = ReviewMode.manual;
  bool _startLater = false;
  DateTime? _startAt;
  _DuePreset _preset = _DuePreset.todayEvening;
  DateTime? _customDue;
  Map<String, String> _errors = {};
  String? _formError;
  bool _submitting = false;

  /// "Today 6 PM" is offered only while it is still at least 15 minutes away.
  bool get _todayEveningOpen {
    final n = _now.toLocal();
    return DateTime(n.year, n.month, n.day, 18).difference(n) >= Bounds.minTaskDuration;
  }

  @override
  void initState() {
    super.initState();
    if (!_todayEveningOpen) _preset = _DuePreset.tomorrowEvening;
    _title.addListener(() => setState(() => _errors = {..._errors}..remove('title')));
    _brief.addListener(() => setState(() => _errors = {..._errors}..remove('brief')));
  }

  @override
  void dispose() {
    _title.dispose();
    _brief.dispose();
    _linkName.dispose();
    _linkUrl.dispose();
    super.dispose();
  }

  DateTime get _now => ref.read(clockProvider)();

  DateTime? _dueFor(DateTime start) {
    final local = start.toLocal();
    DateTime at(DateTime d, int hour) => DateTime(d.year, d.month, d.day, hour);
    return switch (_preset) {
      _DuePreset.twoHours => start.add(const Duration(hours: 2)),
      _DuePreset.todayEvening => at(local, 18),
      _DuePreset.tomorrowEvening => at(local.add(const Duration(days: 1)), 18),
      _DuePreset.custom => _customDue,
    };
  }

  Future<DateTime?> _pickDateTime(DateTime initial) async {
    final now = _now;
    final date = await showDatePicker(
      context: context,
      initialDate: initial.isBefore(now) ? now : initial,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 70)),
    );
    if (date == null || !mounted) return null;
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(initial));
    if (time == null) return null;
    return DateTime(date.year, date.month, date.day, time.hour, time.minute);
  }

  Future<void> _submit() async {
    final now = _now;
    final start = _startLater ? _startAt : null;
    final due = _dueFor(start ?? now);
    final schedule = validateSchedule(now: now, scheduledFor: start, dueAt: due);
    final errors = <String, String>{
      'title': ?validateTitle(_title.text),
      'brief': ?validateBrief(_brief.text),
      'resources[0].url': ?validateLink(name: _linkName.text, url: _linkUrl.text).url,
      'resources[0].title': ?validateLink(name: _linkName.text, url: _linkUrl.text).name,
      if (_startLater && start == null) 'scheduled_for': 'Pick a start time.',
      'scheduled_for': ?schedule.scheduledFor,
      'due_at': ?schedule.dueAt,
    };
    setState(() {
      _errors = errors;
      _formError = null;
    });
    if (errors.isNotEmpty) return;

    setState(() => _submitting = true);
    try {
      final task = await ref.read(apiClientProvider).createTask(widget.student.enrollment.id, (
        type: _type,
        personaId: _personaId ?? _selectedPersona(ref.read(personasProvider).value ?? const []),
        reviewMode: _reviewMode,
        title: normalizeLine(_title.text),
        brief: _brief.text.trim(),
        scheduledFor: start,
        dueAt: due!,
        resources: [if (_linkUrl.text.trim().isNotEmpty) Resource(title: normalizeLine(_linkName.text), url: _linkUrl.text.trim())],
      ));
      if (!mounted) return;
      unawaited(HapticFeedback.mediumImpact());
      await _showSuccess(task);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        if (e.code == ErrorCode.validationFailed && e.fields.isNotEmpty) {
          _errors = e.fields;
        } else {
          _formError = messageFor(e);
        }
      });
    } on NetworkException catch (e) {
      if (mounted) setState(() => _formError = messageFor(e));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _showSuccess(Task task) async {
    final again = await showShadDialog<bool>(
      context: context,
      builder: (ctx) => ShadDialog(
        title: const Text('Task assigned'),
        description: Text(
          '${widget.student.user.firstName} sees “${task.title}” on their board, and ${_personaName(task.personaId)} announced it in chat. ${dueLabel(task.dueAt, _now)}.',
        ),
        actions: [
          ShadButton.outline(onPressed: () => Navigator.pop(ctx, false), child: const Text('Pick another student')),
          ShadButton(key: const Key('assign-another'), onPressed: () => Navigator.pop(ctx, true), child: const Text('Assign another')),
        ],
      ),
    );
    if (!mounted) return;
    if (again ?? false) {
      _title.clear();
      _brief.clear();
      _linkName.clear();
      _linkUrl.clear();
      setState(() => _errors = {});
    } else {
      Navigator.of(context).pop();
    }
  }

  /// The admin's pick, else the default team lead, else the first persona.
  String? _selectedPersona(List<Persona> all) =>
      _personaId ?? (all.any((p) => p.id == defaultPersonaId) ? defaultPersonaId : all.firstOrNull?.id);

  String _personaName(String id) => ref.read(personasProvider).value?.where((p) => p.id == id).firstOrNull?.name ?? 'the team lead';

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final s = widget.student;
    final personas = ref.watch(personasProvider);
    final now = _now;
    final due = _dueFor((_startLater ? _startAt : null) ?? now);
    return Scaffold(
      appBar: AppBar(title: const Text('Assign a task')),
      body: SafeArea(
        child: ListView(
          key: const Key('assign-form'),
          padding: const EdgeInsets.all(Space.lg),
          children: [
            ShadCard(
              padding: const EdgeInsets.all(Space.md),
              child: Row(
                children: [
                  ShadAvatar(s.user.avatarUrl ?? '', placeholder: Text(s.user.initials), size: const Size.square(40)),
                  const SizedBox(width: Space.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(s.user.name, style: t.textTheme.large.copyWith(fontSize: 16)),
                        Text(
                          'Day ${s.enrollment.dayNumber} of ${s.enrollment.program.days} · ${s.openTasks} open · ${s.inReview} in review',
                          style: t.textTheme.muted,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: Space.xl),
            if (_formError != null) ...[
              ErrorAlert(title: "Couldn't assign this task", message: _formError!),
              const SizedBox(height: Space.lg),
            ],
            AppField(
              label: 'Type',
              error: _errors['type'],
              child: Wrap(
                spacing: Space.sm,
                runSpacing: Space.sm,
                children: [
                  // Quizzes need an answer key editor; they're built on desktop.
                  for (final type in TaskType.values.where((t) => t != TaskType.quiz))
                    Semantics(
                      selected: type == _type,
                      child: (type == _type ? ShadButton.new : ShadButton.outline)(
                        size: ShadButtonSize.sm,
                        onPressed: () => setState(() => _type = type),
                        leading: Icon(taskTypeIcon(type), size: 14),
                        child: Text(type.label),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: Space.lg),
            AppField(
              label: 'Posted by',
              description: 'The student sees the task announced in this person’s chat.',
              error: _errors['persona_id'],
              child: switch (personas) {
                AsyncData(:final value) => Wrap(
                  spacing: Space.sm,
                  runSpacing: Space.sm,
                  children: [
                    for (final p in value)
                      Semantics(
                        selected: p.id == _selectedPersona(value),
                        child: ((p.id == _selectedPersona(value)) ? ShadButton.new : ShadButton.outline)(
                          key: Key('persona-${p.id}'),
                          size: ShadButtonSize.sm,
                          onPressed: () => setState(() {
                            _personaId = p.id;
                            _errors = {..._errors}..remove('persona_id');
                          }),
                          leading: PersonaAvatar(p, size: 18),
                          child: Text(p.name.split(' ').first),
                        ),
                      ),
                  ],
                ),
                AsyncError() => Text('Couldn’t load personas. The team lead will post it.', style: t.textTheme.muted),
                _ => const SizedBox(height: 32, child: LinearProgressIndicator(minHeight: 2)),
              },
            ),
            const SizedBox(height: Space.lg),
            AppField(
              label: 'Review',
              description: _reviewMode == ReviewMode.manual
                  ? 'The student submits it and you approve or request changes.'
                  : 'The student marks it done themselves. Good for reading and practice.',
              child: Wrap(
                spacing: Space.sm,
                children: [
                  for (final (m, label) in [(ReviewMode.manual, 'Admin reviews'), (ReviewMode.self, 'Student marks done')])
                    Semantics(
                      selected: _reviewMode == m,
                      child: (_reviewMode == m ? ShadButton.new : ShadButton.outline)(
                        key: Key('review-${m.wire}'),
                        size: ShadButtonSize.sm,
                        onPressed: () => setState(() => _reviewMode = m),
                        child: Text(label),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: Space.lg),
            AppField(
              label: 'Title',
              error: _errors['title'],
              trailingLabel: CharCounter(length: runeLength(normalizeLine(_title.text)), max: Bounds.titleMax),
              child: ShadInput(
                key: const Key('task-title'),
                controller: _title,
                placeholder: const Text('e.g. Add filtering to the task list'),
                textCapitalization: TextCapitalization.sentences,
                textInputAction: TextInputAction.next,
              ),
            ),
            const SizedBox(height: Space.lg),
            AppField(
              label: 'Brief',
              description: 'What done looks like, the branch name, and links to docs.',
              error: _errors['brief'],
              trailingLabel: _brief.text.length > Bounds.briefMax - 1000
                  ? CharCounter(length: runeLength(_brief.text.trim()), max: Bounds.briefMax)
                  : null,
              child: ShadTextarea(key: const Key('task-brief'), controller: _brief, placeholder: const Text('Optional'), minHeight: 100),
            ),
            const SizedBox(height: Space.lg),
            AppField(
              label: 'Link',
              description: 'Optional: docs or a starter repo. Quizzes and more links are on desktop.',
              error: _errors['resources[0].url'] ?? _errors['resources[0].title'],
              child: Column(
                children: [
                  ShadInput(
                    key: const Key('task-link-name'),
                    controller: _linkName,
                    placeholder: const Text('Name, e.g. MDN: Flexbox'),
                    textInputAction: TextInputAction.next,
                  ),
                  const SizedBox(height: Space.sm),
                  ShadInput(
                    key: const Key('task-link-url'),
                    controller: _linkUrl,
                    placeholder: const Text('https://'),
                    keyboardType: TextInputType.url,
                    autocorrect: false,
                  ),
                ],
              ),
            ),
            const SizedBox(height: Space.lg),
            AppField(
              label: 'Shows up',
              error: _errors['scheduled_for'],
              description: _startLater ? null : 'Right away, with an announcement in chat.',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: Space.sm,
                    children: [
                      (!_startLater ? ShadButton.new : ShadButton.outline)(
                        size: ShadButtonSize.sm,
                        onPressed: () => setState(() => _startLater = false),
                        child: const Text('Now'),
                      ),
                      (_startLater ? ShadButton.new : ShadButton.outline)(
                        size: ShadButtonSize.sm,
                        onPressed: () async {
                          final picked = await _pickDateTime(_startAt ?? now.add(const Duration(hours: 1)));
                          if (picked != null) {
                            setState(() {
                              _startLater = true;
                              _startAt = picked;
                              _errors = {..._errors}..remove('scheduled_for');
                            });
                          }
                        },
                        child: Text(_startLater && _startAt != null ? dateTimeLabel(_startAt!) : 'Later…'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: Space.lg),
            AppField(
              label: 'Due',
              error: _errors['due_at'],
              description: due == null ? null : dateTimeLabel(due),
              child: Wrap(
                spacing: Space.sm,
                runSpacing: Space.sm,
                children: [
                  for (final (p, label) in [
                    (_DuePreset.twoHours, 'In 2 hours'),
                    if (_todayEveningOpen) (_DuePreset.todayEvening, 'Today 6 PM'),
                    (_DuePreset.tomorrowEvening, 'Tomorrow 6 PM'),
                  ])
                    (_preset == p ? ShadButton.new : ShadButton.outline)(
                      size: ShadButtonSize.sm,
                      onPressed: () => setState(() {
                        _preset = p;
                        _errors = {..._errors}..remove('due_at');
                      }),
                      child: Text(label),
                    ),
                  (_preset == _DuePreset.custom ? ShadButton.new : ShadButton.outline)(
                    size: ShadButtonSize.sm,
                    leading: const Icon(LucideIcons.calendar, size: 14),
                    onPressed: () async {
                      final picked = await _pickDateTime(_customDue ?? now.add(const Duration(days: 1)));
                      if (picked != null) {
                        setState(() {
                          _preset = _DuePreset.custom;
                          _customDue = picked;
                          _errors = {..._errors}..remove('due_at');
                        });
                      }
                    },
                    child: const Text('Pick…'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: Space.xxl),
            ShadButton(
              key: const Key('assign-submit'),
              width: double.infinity,
              size: ShadButtonSize.lg,
              enabled: !_submitting,
              onPressed: _submit,
              leading: _submitting
                  ? SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2, color: t.colorScheme.primaryForeground))
                  : const Icon(LucideIcons.send, size: 16),
              child: Text(_submitting ? 'Assigning…' : 'Assign to ${s.user.firstName}'),
            ),
          ],
        ),
      ),
    );
  }
}
