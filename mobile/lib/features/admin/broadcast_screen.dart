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
import 'package:stackstep/features/admin/students_controller.dart';
import 'package:stackstep/features/chat/inbox_controller.dart';
import 'package:stackstep/shared/errors.dart';
import 'package:stackstep/shared/state_views.dart';
import 'package:stackstep/ui/ui.dart';
import 'package:uuid/uuid.dart';

/// Server cap on recipients per broadcast (domain.MaxBroadcastUsers).
const maxBroadcastRecipients = 500;

/// Sends one message, as a persona, to many students. Each student gets it in their own
/// chat with that persona, so replies stay one-to-one.
class BroadcastScreen extends ConsumerStatefulWidget {
  const BroadcastScreen({super.key});

  @override
  ConsumerState<BroadcastScreen> createState() => _BroadcastScreenState();
}

class _BroadcastScreenState extends ConsumerState<BroadcastScreen> {
  final _body = TextEditingController();
  final _selected = <String, StudentRow>{};
  String? _personaId;

  /// Kept across retries of the same message so a resend never duplicates it.
  String _clientId = const Uuid().v4();
  Map<String, String> _errors = {};
  String? _formError;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _body.addListener(() => setState(() => _errors = {..._errors}..remove('body')));
  }

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  String? _persona(List<Persona> all) => _personaId ?? (all.any((p) => p.id == defaultPersonaId) ? defaultPersonaId : all.firstOrNull?.id);

  void _toggle(StudentRow s) => setState(() {
    final id = s.enrollment.id;
    if (_selected.containsKey(id)) {
      _selected.remove(id);
    } else if (_selected.length < maxBroadcastRecipients) {
      _selected[id] = s;
    } else {
      showToast(context, 'You can message up to $maxBroadcastRecipients students at once.', error: true);
    }
    _errors = {..._errors}..remove('enrollment_ids');
  });

  Future<void> _send() async {
    final personaId = _persona(ref.read(personasProvider).value ?? const []);
    final errors = <String, String>{
      'body': ?validateMessage(_body.text),
      if (_selected.isEmpty) 'enrollment_ids': 'Pick at least one student.',
      if (personaId == null) 'persona_id': 'Pick who the message is from.',
    };
    setState(() {
      _errors = errors;
      _formError = null;
    });
    if (errors.isNotEmpty || personaId == null) return;
    setState(() => _sending = true);
    try {
      final out = await ref
          .read(apiClientProvider)
          .broadcast(personaId: personaId, clientId: _clientId, enrollmentIds: _selected.keys.toList(), body: _body.text.trim());
      if (!mounted) return;
      unawaited(HapticFeedback.mediumImpact());
      await showShadDialog<void>(
        context: context,
        builder: (ctx) => ShadDialog(
          title: Text(out.failed == 0 ? 'Message sent' : 'Sent to ${out.sent} of ${out.sent + out.failed}'),
          description: Text(
            out.failed == 0
                ? 'Delivered to ${out.sent} ${out.sent == 1 ? 'student' : 'students'}. Replies land in your inbox.'
                : "${out.failed} couldn't receive it, usually because their internship is paused or ended.",
          ),
          actions: [ShadButton(onPressed: () => Navigator.pop(ctx), child: const Text('Done'))],
        ),
      );
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        if (e.code == ErrorCode.validationFailed && e.fields.isNotEmpty) {
          _errors = e.fields;
        } else {
          _formError = messageFor(e);
        }
        // A rejected request stored nothing, so the next try is a new message.
        _clientId = const Uuid().v4();
      });
    } on NetworkException catch (e) {
      // Keep the client id: the server may have stored it before the connection dropped.
      if (mounted) setState(() => _formError = messageFor(e));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final personas = ref.watch(personasProvider);
    final students = ref.watch(studentsProvider);
    final length = runeLength(_body.text.trim());
    return Scaffold(
      appBar: AppBar(title: const Text('Message students')),
      body: CustomScrollView(
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.all(Space.lg),
            sliver: SliverList.list(
              children: [
                if (_formError != null) ...[ErrorAlert(title: "Couldn't send", message: _formError!), const SizedBox(height: Space.lg)],
                AppField(
                  label: 'From',
                  error: _errors['persona_id'],
                  child: switch (personas) {
                    AsyncData(:final value) => Wrap(
                      spacing: Space.sm,
                      runSpacing: Space.sm,
                      children: [
                        for (final p in value)
                          Semantics(
                            selected: p.id == _persona(value),
                            child: (p.id == _persona(value) ? ShadButton.new : ShadButton.outline)(
                              key: Key('broadcast-persona-${p.id}'),
                              size: ShadButtonSize.sm,
                              leading: PersonaAvatar(p, size: 18),
                              onPressed: () => setState(() => _personaId = p.id),
                              child: Text(p.name.split(' ').first),
                            ),
                          ),
                      ],
                    ),
                    AsyncError(:final error) => Text(messageFor(error), style: t.textTheme.muted),
                    _ => const LinearProgressIndicator(minHeight: 2),
                  },
                ),
                const SizedBox(height: Space.lg),
                AppField(
                  label: 'Message',
                  error: _errors['body'],
                  trailingLabel: length > Bounds.messageMax - 500 ? CharCounter(length: length, max: Bounds.messageMax) : null,
                  child: ShadTextarea(
                    key: const Key('broadcast-body'),
                    controller: _body,
                    minHeight: 110,
                    placeholder: const Text('e.g. Demo day moved to Friday 4 PM. Push your branches by Thursday.'),
                  ),
                ),
                const SizedBox(height: Space.lg),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        _selected.isEmpty ? 'Recipients' : '${_selected.length} selected',
                        style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600),
                      ),
                    ),
                    if (_selected.isNotEmpty)
                      ShadButton.link(size: ShadButtonSize.sm, onPressed: () => setState(_selected.clear), child: const Text('Clear')),
                  ],
                ),
                if (_errors['enrollment_ids'] case final err?)
                  Text(err, style: t.textTheme.small.copyWith(color: t.colorScheme.destructive)),
                const SizedBox(height: Space.sm),
                ShadInput(
                  placeholder: const Text('Search students'),
                  leading: const Icon(LucideIcons.search, size: 16),
                  maxLength: 100,
                  onChanged: ref.read(studentsProvider.notifier).search,
                ),
              ],
            ),
          ),
          switch (students) {
            AsyncData(:final value) when value.items.isEmpty => const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.all(Space.xl),
                child: Center(child: Text('No students match.')),
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
                final active = s.enrollment.status == EnrollmentStatus.active;
                return CheckboxListTile(
                  key: Key('broadcast-student-${s.user.githubLogin}'),
                  value: _selected.containsKey(s.enrollment.id),
                  enabled: active,
                  onChanged: active ? (_) => _toggle(s) : null,
                  controlAffinity: ListTileControlAffinity.leading,
                  title: Text(s.user.name),
                  subtitle: Text(active ? '@${s.user.githubLogin}' : '@${s.user.githubLogin} · ${s.enrollment.status.label}'),
                );
              },
            ),
            AsyncError(:final error) => SliverToBoxAdapter(
              child: ErrorState(message: messageFor(error), onRetry: () => ref.invalidate(studentsProvider)),
            ),
            _ => const SliverToBoxAdapter(child: SizedBox(height: 240, child: SkeletonList(rows: 4, height: 48))),
          },
          const SliverToBoxAdapter(child: SizedBox(height: 96)),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Space.lg, Space.sm, Space.lg, Space.md),
          child: ShadButton(
            key: const Key('broadcast-send'),
            size: ShadButtonSize.lg,
            enabled: !_sending,
            onPressed: _send,
            leading: _sending
                ? SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2, color: t.colorScheme.primaryForeground))
                : const Icon(LucideIcons.send, size: 16),
            child: Text(
              _sending
                  ? 'Sending…'
                  : _selected.isEmpty
                  ? 'Send'
                  : 'Send to ${_selected.length} ${_selected.length == 1 ? 'student' : 'students'}',
            ),
          ),
        ),
      ),
    );
  }
}
