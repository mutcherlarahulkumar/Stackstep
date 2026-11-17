import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/api/validation.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/features/chat/chat_controller.dart';
import 'package:stackstep/features/chat/inbox_controller.dart' show personasProvider, teamProvider;
import 'package:stackstep/shared/errors.dart';
import 'package:stackstep/shared/format.dart';
import 'package:stackstep/shared/motion.dart';
import 'package:stackstep/shared/state_views.dart';
import 'package:stackstep/shared/team.dart';
import 'package:stackstep/ui/ui.dart';

/// One conversation. Students see a persona; admins (target.isStaff) see a student and write as the persona.
class ChatScreen extends ConsumerWidget {
  const ChatScreen({required this.target, required this.other, required this.otherName, this.onOpenTask, this.teamRoom = false, super.key});

  final ChatTarget target;

  /// The team room: every persona and Stackbot speak here, so each message names its speaker.
  final bool teamRoom;

  /// Avatar of the other side of the conversation.
  final Widget other;
  final String otherName;

  /// Opens the board on a task referenced by a message (students only).
  final void Function(String taskId)? onOpenTask;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chat = ref.watch(chatProvider(target));
    final rt = ref.watch(realtimeProvider);
    final team = !teamRoom
        ? null
        : target.isStaff
        ? switch (ref.watch(personasProvider).value) {
            final ps? => Team(members: ps, botName: 'Stackbot', botTitle: 'AI teammate'),
            null => null,
          }
        : ref.watch(teamProvider).value;
    return Column(
      children: [
        ConnectionBanner(status: rt.status),
        Expanded(
          child: FadeSwitch(
            child: switch (chat) {
              AsyncData(:final value) => _Thread(
                state: value,
                target: target,
                other: other,
                otherName: otherName,
                onOpenTask: onOpenTask,
                teamRoom: teamRoom,
                team: team,
              ),
              AsyncError(:final error) => ErrorState(message: messageFor(error), onRetry: () => ref.invalidate(chatProvider(target))),
              _ => const SkeletonList(rows: 6, height: 56),
            },
          ),
        ),
        if (chat.hasValue) _Composer(target: target, otherName: otherName, teamRoom: teamRoom, team: team),
      ],
    );
  }
}

class _Thread extends ConsumerWidget {
  const _Thread({
    required this.state,
    required this.target,
    required this.other,
    required this.otherName,
    required this.onOpenTask,
    required this.teamRoom,
    required this.team,
  });

  final bool teamRoom;
  final Team? team;
  final ChatState state;
  final ChatTarget target;
  final Widget other;
  final String otherName;
  final void Function(String taskId)? onOpenTask;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = state.items;
    final now = ref.watch(clockProvider)();
    if (items.isEmpty) {
      return EmptyState(
        icon: LucideIcons.messagesSquare,
        title: target.isStaff ? 'No messages yet' : 'Say hi to $otherName',
        body: target.isStaff
            ? 'Write as the persona. The student sees it in their chat right away.'
            : 'Tickets and updates from $otherName land here. Ask questions any time.',
      );
    }
    return NotificationListener<ScrollNotification>(
      onNotification: (n) {
        if (n.metrics.extentAfter < 400) unawaited(ref.read(chatProvider(target).notifier).loadOlder());
        return false;
      },
      child: ListView.builder(
        key: const Key('chat-thread'),
        reverse: true,
        padding: const EdgeInsets.fromLTRB(Space.md, Space.md, Space.md, Space.sm),
        itemCount: items.length + 1,
        itemBuilder: (context, i) {
          if (i == items.length) {
            return state.nextCursor == null
                ? const _ThreadStart()
                : const Padding(
                    padding: EdgeInsets.all(Space.lg),
                    child: Center(child: SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))),
                  );
          }
          final item = items[i];
          final older = i + 1 < items.length ? items[i + 1] : null;
          final newer = i > 0 ? items[i - 1] : null;
          final showDay = older == null || dayLabel(older.at, now) != dayLabel(item.at, now);
          final author = _authorOf(item);
          final groupedWithNewer = newer != null && _authorOf(newer) == author && newer.at.difference(item.at).inMinutes < 5;
          final groupedWithOlder = older != null && !showDay && _authorOf(older) == author && item.at.difference(older.at).inMinutes < 5;
          return Column(
            children: [
              if (showDay) _DaySeparator(label: dayLabel(item.at, now)),
              _Bubble(
                item: item,
                target: target,
                other: other,
                otherName: otherName,
                showTime: !groupedWithNewer,
                showAvatar: !groupedWithOlder,
                onOpenTask: onOpenTask,
                teamRoom: teamRoom,
                team: team,
              ),
              SizedBox(height: groupedWithNewer ? 3 : Space.md),
            ],
          );
        },
      ),
    );
  }

  /// Groups consecutive bubbles by side, and in the team room by speaker too.
  String _authorOf(ChatItem i) => switch (i) {
    Delivered(:final message) when teamRoom && message.author == Author.persona => 'p:${message.speakerId ?? 'bot'}',
    Delivered(:final message) => target.isMine(message) ? 'mine' : 'other',
    Outgoing() => 'mine',
  };
}

class _ThreadStart extends StatelessWidget {
  const _ThreadStart();

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: Space.xl),
    child: Text('This is the start of the conversation.', textAlign: TextAlign.center, style: ShadTheme.of(context).textTheme.muted),
  );
}

class _DaySeparator extends StatelessWidget {
  const _DaySeparator({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: Space.md),
    child: Center(child: ShadBadge.secondary(child: Text(label))),
  );
}

class _Bubble extends ConsumerWidget {
  const _Bubble({
    required this.item,
    required this.target,
    required this.other,
    required this.otherName,
    required this.showTime,
    required this.showAvatar,
    required this.onOpenTask,
    required this.teamRoom,
    required this.team,
  });

  final bool teamRoom;
  final Team? team;
  final ChatItem item;
  final ChatTarget target;
  final Widget other;
  final String otherName;
  final bool showTime;
  final bool showAvatar;
  final void Function(String taskId)? onOpenTask;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ShadTheme.of(context);
    final c = t.colorScheme;
    final (mine, body, taskId, outgoing, automated) = switch (item) {
      Delivered(:final message) => (target.isMine(message), message.body, message.taskId, null, message.automated),
      final Outgoing o => (true, o.body, null, o, false),
    };
    final failed = outgoing?.error != null;
    final sending = outgoing != null && !failed;
    // In the team room, persona messages name their speaker.
    final speaker = switch (item) {
      Delivered(:final message) when teamRoom && message.author == Author.persona => speakerOf(message, team),
      _ => null,
    };

    final bubble = Container(
      constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.76),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: mine ? c.primary : c.muted,
        border: failed ? Border.all(color: c.destructive, width: 1.5) : null,
        borderRadius: BorderRadius.only(
          topLeft: Radii.lg,
          topRight: Radii.lg,
          bottomLeft: mine ? Radii.lg : const Radius.circular(6),
          bottomRight: mine ? const Radius.circular(6) : Radii.lg,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text.rich(
            _withMentions(body, highlight: teamRoom),
            style: t.textTheme.p.copyWith(color: mine ? c.primaryForeground : c.foreground, height: 1.45),
          ),
          if (taskId != null && onOpenTask != null) ...[
            const SizedBox(height: Space.sm),
            ShadButton.outline(
              size: ShadButtonSize.sm,
              backgroundColor: c.background,
              leading: const Icon(LucideIcons.squareKanban, size: 14),
              onPressed: () => onOpenTask?.call(taskId),
              child: const Text('Open task'),
            ),
          ],
        ],
      ),
    );

    // Honest personas: every reply no mentor wrote says so.
    final meta = switch ((sending, failed)) {
      (true, _) => 'Sending…',
      (_, true) => '${outgoing!.error} Tap to retry.',
      _ when automated => '${timeLabel(item.at)} · Automatic reply',
      _ => showTime ? timeLabel(item.at) : null,
    };

    final content = Column(
      crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        if (speaker != null && showAvatar)
          Padding(
            padding: const EdgeInsets.only(bottom: 4, left: 4, right: 4),
            child: Text.rich(
              key: const Key('team-speaker-name'),
              TextSpan(
                children: [
                  TextSpan(
                    text: speaker.name,
                    style: TextStyle(fontWeight: FontWeight.w600, color: c.foreground),
                  ),
                  if (speaker.title.isNotEmpty) TextSpan(text: ' · ${speaker.title}'),
                ],
              ),
              style: t.textTheme.muted.copyWith(fontSize: 12),
            ),
          ),
        Semantics(
          label: '${mine ? 'You' : speaker?.name ?? otherName}${automated ? ' (automatic reply)' : ''}: $body',
          button: failed,
          child: GestureDetector(
            onTap: failed ? () => ref.read(chatProvider(target).notifier).retry(outgoing!) : null,
            onLongPress: switch (item) {
              _ when failed => () => _confirmDiscard(context, ref, outgoing!),
              Delivered(:final message) => () => _reactSheet(context, ref, message),
              _ => () => _copy(context, body),
            },
            child: AnimatedOpacity(opacity: sending ? 0.65 : 1, duration: const Duration(milliseconds: 150), child: bubble),
          ),
        ),
        if (item case Delivered(:final message) when message.reactions.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: _ReactionChips(message: message, target: target),
          ),
        if (meta != null)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4, right: 4),
            child: Text(meta, style: t.textTheme.muted.copyWith(fontSize: 12, color: failed ? c.destructive : null)),
          ),
      ],
    );

    if (mine) return Align(alignment: Alignment.centerRight, child: content);
    final avatar = switch (speaker) {
      null => other,
      (persona: final p?, name: _, title: _) => PersonaAvatar(p),
      _ => const BotAvatar(),
    };
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (showAvatar) SizedBox.square(dimension: 28, child: FittedBox(child: avatar)) else const SizedBox(width: 28),
        const SizedBox(width: Space.sm),
        Flexible(child: content),
      ],
    );
  }

  /// Long press on a delivered message: react, or copy it.
  Future<void> _reactSheet(BuildContext context, WidgetRef ref, Message m) async {
    final controller = ref.read(chatProvider(target).notifier);
    final picked = await showModalBottomSheet<Object>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Space.lg, 0, Space.lg, Space.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                key: const Key('reaction-bar'),
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  for (final e in ReactionEmoji.values)
                    Semantics(
                      button: true,
                      selected: controller.reacted(m, e),
                      label: 'React ${e.wire.replaceAll('_', ' ')}',
                      child: InkResponse(
                        key: Key('react-${e.wire}'),
                        radius: 28,
                        onTap: () => Navigator.pop(ctx, e),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 150),
                          padding: const EdgeInsets.all(Space.sm),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: controller.reacted(m, e) ? ShadTheme.of(ctx).colorScheme.primary.withValues(alpha: 0.15) : null,
                          ),
                          child: Text(e.glyph, style: const TextStyle(fontSize: 28)),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: Space.md),
              ShadButton.outline(
                leading: const Icon(LucideIcons.copy, size: 16),
                onPressed: () => Navigator.pop(ctx, 'copy'),
                child: const Text('Copy text'),
              ),
            ],
          ),
        ),
      ),
    );
    if (!context.mounted) return;
    switch (picked) {
      case final ReactionEmoji e:
        final err = await controller.toggleReaction(m, e);
        if (err != null && context.mounted) showToast(context, err);
      case 'copy':
        _copy(context, m.body);
    }
  }

  void _copy(BuildContext context, String body) {
    unawaited(Clipboard.setData(ClipboardData(text: body)));
    showToast(context, 'Message copied');
  }

  Future<void> _confirmDiscard(BuildContext context, WidgetRef ref, Outgoing o) async {
    final ok = await showShadDialog<bool>(
      context: context,
      builder: (ctx) => ShadDialog.alert(
        title: const Text('Delete unsent message?'),
        description: const Text("It wasn't delivered, so nobody saw it."),
        actions: [
          ShadButton.outline(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep')),
          ShadButton.destructive(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok ?? false) ref.read(chatProvider(target).notifier).discard(o);
  }
}

class _Composer extends ConsumerStatefulWidget {
  const _Composer({required this.target, required this.otherName, required this.teamRoom, required this.team});

  final ChatTarget target;
  final String otherName;
  final bool teamRoom;
  final Team? team;

  @override
  ConsumerState<_Composer> createState() => _ComposerState();
}

class _ComposerState extends ConsumerState<_Composer> {
  final _text = TextEditingController();
  String? _error;

  /// Who staff speak as in the team room (the first persona until they pick).
  String? _speaker;

  List<String> get _quick => widget.target.isStaff
      ? const ['Looks good, thanks!', 'Can you share the PR link?', "Let's sync tomorrow"]
      : widget.teamRoom
      ? const ['Good morning, team', "I'm stuck on this", 'PR ready for review']
      : const ['PR ready for review', "I'm stuck on this", 'Good morning'];

  String? get _speakerId => _speaker ?? widget.team?.members.firstOrNull?.id;

  @override
  void initState() {
    super.initState();
    _text.addListener(() => setState(() => _error = null));
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  void _send([String? preset]) {
    final staffTeam = widget.teamRoom && widget.target.isStaff;
    if (staffTeam && _speakerId == null) {
      setState(() => _error = 'Pick who you speak as.');
      return;
    }
    final err = ref.read(chatProvider(widget.target).notifier).send(preset ?? _text.text, speakerId: staffTeam ? _speakerId : null);
    if (err != null) {
      setState(() => _error = err);
      return;
    }
    if (preset == null) _text.clear();
    unawaited(HapticFeedback.lightImpact());
  }

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final length = runeLength(_text.text.trim());
    final canSend = _text.text.trim().isNotEmpty && length <= Bounds.messageMax;
    final members = widget.team?.members ?? const <Persona>[];
    final query = widget.teamRoom && !widget.target.isStaff ? mentionQuery(_text.text) : null;
    final suggestions = query == null ? const <Persona>[] : mentionMatches(query, members).take(6).toList();
    return DecoratedBox(
      decoration: BoxDecoration(
        color: t.colorScheme.background,
        border: Border(top: BorderSide(color: t.colorScheme.border)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Space.md, Space.sm, Space.md, Space.sm),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (widget.teamRoom && widget.target.isStaff && members.isNotEmpty) ...[
                Row(
                  children: [
                    Text('Speak as', style: t.textTheme.muted.copyWith(fontSize: 12)),
                    const SizedBox(width: Space.sm),
                    Expanded(
                      child: ShadSelect<String>(
                        key: const Key('team-speaker'),
                        initialValue: _speakerId,
                        onChanged: (v) => setState(() => _speaker = v),
                        options: [for (final p in members) ShadOption(value: p.id, child: Text('${p.name} · ${p.title}'))],
                        selectedOptionBuilder: (_, v) {
                          final p = members.where((m) => m.id == v).firstOrNull;
                          return Text(p == null ? 'Pick a persona' : '${p.name} · ${p.title}', overflow: TextOverflow.ellipsis);
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: Space.sm),
              ],
              if (suggestions.isNotEmpty) ...[
                SizedBox(
                  height: 40,
                  child: ListView.separated(
                    key: const Key('mention-suggestions'),
                    scrollDirection: Axis.horizontal,
                    itemCount: suggestions.length,
                    separatorBuilder: (_, _) => const SizedBox(width: Space.sm),
                    itemBuilder: (_, i) {
                      final p = suggestions[i];
                      return ShadButton.secondary(
                        size: ShadButtonSize.sm,
                        leading: PersonaAvatar(p, size: 20),
                        onPressed: () {
                          final next = insertMention(_text.text, p);
                          _text.value = TextEditingValue(
                            text: next,
                            selection: TextSelection.collapsed(offset: next.length),
                          );
                        },
                        child: Text(p.name.split(' ').first),
                      );
                    },
                  ),
                ),
                const SizedBox(height: Space.sm),
              ],
              if (_text.text.isEmpty)
                SizedBox(
                  height: 40,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: _quick.length,
                    separatorBuilder: (_, _) => const SizedBox(width: Space.sm),
                    itemBuilder: (_, i) =>
                        ShadButton.outline(size: ShadButtonSize.sm, onPressed: () => _send(_quick[i]), child: Text(_quick[i])),
                  ),
                ),
              if (_text.text.isEmpty) const SizedBox(height: Space.sm),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: ShadInput(
                      key: const Key('chat-input'),
                      controller: _text,
                      minLines: 1,
                      maxLines: 5,
                      keyboardType: TextInputType.multiline,
                      textCapitalization: TextCapitalization.sentences,
                      placeholder: Text(widget.teamRoom ? 'Message your team. Type @ to ask someone' : 'Message ${widget.otherName}'),
                    ),
                  ),
                  const SizedBox(width: Space.sm),
                  ShadIconButton(
                    key: const Key('chat-send'),
                    width: 44,
                    height: 44,
                    enabled: canSend,
                    onPressed: _send,
                    icon: const Icon(LucideIcons.arrowUp, size: 20),
                  ),
                ],
              ),
              if (_error != null || length > Bounds.messageMax - 500)
                Padding(
                  padding: const EdgeInsets.only(top: 6, left: 4),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(_error ?? '', style: t.textTheme.small.copyWith(color: t.colorScheme.destructive)),
                      ),
                      if (length > Bounds.messageMax - 500) CharCounter(length: length, max: Bounds.messageMax),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The emoji left on a message, each once per side; ours are highlighted and tap to undo.
class _ReactionChips extends ConsumerWidget {
  const _ReactionChips({required this.message, required this.target});
  final Message message;
  final ChatTarget target;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ShadTheme.of(context);
    final controller = ref.read(chatProvider(target).notifier);
    final counts = <ReactionEmoji, int>{};
    for (final r in message.reactions) {
      counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
    }
    return Wrap(
      spacing: 4,
      runSpacing: 4,
      children: [
        for (final MapEntry(key: e, value: n) in counts.entries)
          Semantics(
            button: true,
            label: '${e.wire.replaceAll('_', ' ')} $n',
            child: InkWell(
              key: Key('chip-${e.wire}'),
              borderRadius: BorderRadius.circular(12),
              onTap: () async {
                final err = await controller.toggleReaction(message, e);
                if (err != null && context.mounted) showToast(context, err);
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: controller.reacted(message, e) ? t.colorScheme.primary.withValues(alpha: 0.14) : t.colorScheme.muted,
                  border: Border.all(color: controller.reacted(message, e) ? t.colorScheme.primary : t.colorScheme.border),
                ),
                child: Text(n > 1 ? '${e.glyph} $n' : e.glyph, style: const TextStyle(fontSize: 13)),
              ),
            ),
          ),
      ],
    );
  }
}

/// Bold @mentions in team room messages.
TextSpan _withMentions(String body, {required bool highlight}) {
  if (!highlight) return TextSpan(text: body);
  final spans = <TextSpan>[];
  var last = 0;
  for (final m in RegExp(r'(^|[^\p{L}\p{N}@])(@[\p{L}\p{N}]+)', unicode: true).allMatches(body)) {
    final start = m.start + (m.group(1)?.length ?? 0);
    if (start > last) spans.add(TextSpan(text: body.substring(last, start)));
    spans.add(
      TextSpan(
        text: m.group(2),
        style: const TextStyle(fontWeight: FontWeight.w700),
      ),
    );
    last = m.end;
  }
  if (last < body.length) spans.add(TextSpan(text: body.substring(last)));
  return TextSpan(children: spans);
}
