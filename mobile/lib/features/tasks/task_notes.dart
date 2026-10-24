import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/api_client.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/core/config.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/features/ai/markdown_view.dart';
import 'package:stackstep/features/tasks/task_work.dart';
import 'package:stackstep/shared/errors.dart';
import 'package:stackstep/shared/format.dart';
import 'package:stackstep/ui/ui.dart';

/// The student's note on one task, loaded once per sheet.
final FutureProviderFamily<TaskNote, String> taskNoteProvider = FutureProvider.autoDispose.family<TaskNote, String>(
  (ref, taskId) => ref.read(apiClientProvider).myNote(taskId),
);

/// Private Markdown notes on a task, optionally shared with the reviewer. Same as the web app.
class TaskNotesSection extends ConsumerWidget {
  const TaskNotesSection({required this.taskId, super.key});
  final String taskId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ShadTheme.of(context);
    final note = ref.watch(taskNoteProvider(taskId));
    return Padding(
      padding: const EdgeInsets.only(top: Space.xl),
      child: Column(
        key: const Key('task-notes'),
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(LucideIcons.notebookPen, size: 16, color: t.colorScheme.mutedForeground),
              const SizedBox(width: Space.sm),
              Semantics(
                header: true,
                child: Text('Your notes', style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          const SizedBox(height: Space.sm),
          switch (note) {
            AsyncData(:final value) => _Editor(key: ValueKey(value.updatedAt), taskId: taskId, saved: value),
            AsyncError(:final error) => Text(messageFor(error), style: TextStyle(color: t.colorScheme.destructive)),
            _ => const SizedBox(height: 96, child: Center(child: CircularProgressIndicator(strokeWidth: 2))),
          },
        ],
      ),
    );
  }
}

class _Editor extends ConsumerStatefulWidget {
  const _Editor({required this.taskId, required this.saved, super.key});
  final String taskId;
  final TaskNote saved;

  @override
  ConsumerState<_Editor> createState() => _EditorState();
}

class _EditorState extends ConsumerState<_Editor> {
  late final TextEditingController _body = TextEditingController(text: widget.saved.body)..addListener(() => setState(() {}));
  late bool _shared = widget.saved.shared;
  var _preview = false;
  var _busy = false;
  String? _error;

  bool get _dirty => _body.text != widget.saved.body || _shared != widget.saved.shared;
  bool get _tooLong => _body.text.runes.length > TaskNote.maxLength;

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final n = await ref.read(apiClientProvider).saveNote(widget.taskId, body: _body.text, shared: _shared);
      if (!mounted) return;
      showToast(context, n.updatedAt == null ? 'Notes cleared' : (n.shared ? 'Notes saved and shared with your reviewer' : 'Notes saved'));
      ref.invalidate(taskNoteProvider(widget.taskId));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.fields['body'] ?? messageFor(e));
    } on Object catch (e) {
      if (mounted) setState(() => _error = messageFor(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final saved = widget.saved;
    final status = _tooLong
        ? '${_body.text.runes.length} / ${TaskNote.maxLength} characters — too long'
        : _dirty
        ? 'Unsaved changes'
        : saved.updatedAt == null
        ? 'Only you can see your notes unless you share them.'
        : 'Saved ${dateTimeLabel(saved.updatedAt!)}${saved.shared ? ' · shared' : ''}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, icon: Icon(LucideIcons.pencil, size: 16), label: Text('Write')),
            ButtonSegment(value: true, icon: Icon(LucideIcons.eye, size: 16), label: Text('Preview')),
          ],
          selected: {_preview},
          onSelectionChanged: (s) => setState(() => _preview = s.first && _body.text.trim().isNotEmpty),
          showSelectedIcon: false,
        ),
        const SizedBox(height: Space.sm),
        if (_preview)
          Container(
            key: const Key('note-preview'),
            padding: const EdgeInsets.all(Space.md),
            decoration: BoxDecoration(
              color: t.colorScheme.muted.withValues(alpha: 0.5),
              border: Border.all(color: t.colorScheme.border),
              borderRadius: const BorderRadius.all(Radii.md),
            ),
            child: MarkdownView(_body.text),
          )
        else
          Semantics(
            label: 'Your notes (Markdown)',
            child: ShadTextarea(
              key: const Key('note-body'),
              controller: _body,
              minHeight: 120,
              placeholder: const Text("What you tried, links you found, what you'd do next…"),
            ),
          ),
        const SizedBox(height: Space.sm),
        ShadCard(
          padding: const EdgeInsets.all(Space.md),
          child: ShadSwitch(
            key: const Key('note-share'),
            value: _shared,
            onChanged: (v) => setState(() => _shared = v),
            label: const Text('Share with your reviewer'),
            sublabel: const Text('They see these notes next to your hand-in. Off means only you can read them.'),
          ),
        ),
        if (_error != null) ...[const SizedBox(height: Space.sm), Text(_error!, style: TextStyle(color: t.colorScheme.destructive))],
        const SizedBox(height: Space.sm),
        Row(
          children: [
            Expanded(
              child: Semantics(liveRegion: true, child: Text(status, style: t.textTheme.muted.copyWith(fontSize: 12))),
            ),
            ShadButton(
              key: const Key('note-save'),
              size: ShadButtonSize.sm,
              enabled: _dirty && !_tooLong && !_busy,
              onPressed: _save,
              child: const Text('Save notes'),
            ),
          ],
        ),
      ],
    );
  }
}

/// DSA example tests. Code runs in the web app's practice pad, so the app links there.
class PracticeCard extends StatelessWidget {
  const PracticeCard({required this.practice, super.key});
  final Practice practice;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: Space.xl),
      child: ShadCard(
        key: const Key('practice-card'),
        padding: const EdgeInsets.all(Space.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(LucideIcons.code, size: 16, color: t.colorScheme.mutedForeground),
                const SizedBox(width: Space.sm),
                Semantics(
                  header: true,
                  child: Text('Practice pad', style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
                ),
              ],
            ),
            const SizedBox(height: Space.sm),
            Text('Examples your solution should pass:', style: t.textTheme.muted),
            const SizedBox(height: Space.xs),
            for (var i = 0; i < practice.tests.length; i++)
              Padding(
                padding: const EdgeInsets.only(top: Space.xs),
                child: SelectableText(practice.label(i), style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
              ),
            const SizedBox(height: Space.md),
            ShadButton.outline(
              onPressed: () => openLink(context, AppConfig.webUrl('/workspace')),
              leading: const Icon(LucideIcons.externalLink, size: 16),
              child: const Text('Run them on the web'),
            ),
          ],
        ),
      ),
    );
  }
}
