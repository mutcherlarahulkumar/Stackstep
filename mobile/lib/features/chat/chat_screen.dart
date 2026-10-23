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
import 'package:stackstep/shared/errors.dart';
import 'package:stackstep/shared/format.dart';
import 'package:stackstep/shared/state_views.dart';
import 'package:stackstep/ui/ui.dart';

class ChatScreen extends ConsumerWidget {
  const ChatScreen({required this.onOpenTask, super.key});

  /// Opens the board on a task referenced by a lead message.
  final void Function(String taskId) onOpenTask;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chat = ref.watch(chatProvider);
    final rt = ref.watch(realtimeProvider);
    return Column(
      children: [
        ConnectionBanner(status: rt.status),
        Expanded(
          child: switch (chat) {
            AsyncData(:final value) => _Thread(state: value, onOpenTask: onOpenTask),
            AsyncError(:final error) => ErrorState(message: messageFor(error), onRetry: () => ref.invalidate(chatProvider)),
            _ => const SkeletonList(rows: 6, height: 56),
          },
        ),
        if (chat.hasValue) const _Composer(),
      ],
    );
  }
}

class _Thread extends ConsumerWidget {
  const _Thread({required this.state, required this.onOpenTask});

  final ChatState state;
  final void Function(String taskId) onOpenTask;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = state.items;
    final now = ref.watch(clockProvider)();
    if (items.isEmpty) {
      return const EmptyState(
        icon: LucideIcons.messagesSquare,
        title: 'Say hi to your team lead',
        body: 'Your lead posts standups and tickets here. Ask questions any time — replies take a minute, like on a real team.',
      );
    }
    return NotificationListener<ScrollNotification>(
      onNotification: (n) {
        if (n.metrics.extentAfter < 400) unawaited(ref.read(chatProvider.notifier).loadOlder());
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
          final groupedWithNewer =
              newer != null && _authorOf(newer) == author && newer.at.difference(item.at).inMinutes < 5;
          final groupedWithOlder =
              older != null && !showDay && _authorOf(older) == author && item.at.difference(older.at).inMinutes < 5;
          return Column(
            children: [
              if (showDay) _DaySeparator(label: dayLabel(item.at, now)),
              _Bubble(item: item, showTime: !groupedWithNewer, showAvatar: !groupedWithOlder, onOpenTask: onOpenTask),
              SizedBox(height: groupedWithNewer ? 3 : Space.md),
            ],
          );
        },
      ),
    );
  }

  static Author _authorOf(ChatItem i) => switch (i) {
    Delivered(:final message) => message.author,
    Outgoing() => Author.student,
  };
}

class _ThreadStart extends StatelessWidget {
  const _ThreadStart();

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: Space.xl),
    child: Text(
      'This is the start of your internship chat.',
      textAlign: TextAlign.center,
      style: ShadTheme.of(context).textTheme.muted,
    ),
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

class _LeadAvatar extends StatelessWidget {
  const _LeadAvatar();

  @override
  Widget build(BuildContext context) {
    final c = ShadTheme.of(context).colorScheme;
    return Container(
      width: 28,
      height: 28,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: c.primary, shape: BoxShape.circle),
      child: Icon(LucideIcons.bot, size: 16, color: c.primaryForeground),
    );
  }
}

class _Bubble extends ConsumerWidget {
  const _Bubble({required this.item, required this.showTime, required this.showAvatar, required this.onOpenTask});

  final ChatItem item;
  final bool showTime;
  final bool showAvatar;
  final void Function(String taskId) onOpenTask;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ShadTheme.of(context);
    final c = t.colorScheme;
    final (mine, body, taskId, outgoing) = switch (item) {
      Delivered(:final message) => (message.author == Author.student, message.body, message.taskId, null),
      final Outgoing o => (true, o.body, null, o),
    };
    final failed = outgoing?.error != null;
    final sending = outgoing != null && !failed;

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
          Text(body, style: t.textTheme.p.copyWith(color: mine ? c.primaryForeground : c.foreground, height: 1.45)),
          if (taskId != null) ...[
            const SizedBox(height: Space.sm),
            ShadButton.outline(
              size: ShadButtonSize.sm,
              backgroundColor: c.background,
              leading: const Icon(LucideIcons.squareKanban, size: 14),
              onPressed: () => onOpenTask(taskId),
              child: const Text('Open task'),
            ),
          ],
        ],
      ),
    );

    final meta = switch ((sending, failed)) {
      (true, _) => 'Sending…',
      (_, true) => '${outgoing!.error} Tap to retry.',
      _ => showTime ? timeLabel(item.at) : null,
    };

    final content = Column(
      crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        Semantics(
          label: '${mine ? 'You' : 'Team lead'}: $body',
          button: failed,
          child: GestureDetector(
            onTap: failed ? () => ref.read(chatProvider.notifier).retry(outgoing!) : null,
            onLongPress: failed ? () => _confirmDiscard(context, ref, outgoing!) : () => _copy(context, body),
            child: AnimatedOpacity(opacity: sending ? 0.65 : 1, duration: const Duration(milliseconds: 150), child: bubble),
          ),
        ),
        if (meta != null)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4, right: 4),
            child: Text(
              meta,
              style: t.textTheme.muted.copyWith(fontSize: 12, color: failed ? c.destructive : null),
            ),
          ),
      ],
    );

    if (mine) return Align(alignment: Alignment.centerRight, child: content);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (showAvatar) const _LeadAvatar() else const SizedBox(width: 28),
        const SizedBox(width: Space.sm),
        Flexible(child: content),
      ],
    );
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
        description: const Text("It wasn't delivered, so your lead never saw it."),
        actions: [
          ShadButton.outline(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep')),
          ShadButton.destructive(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok ?? false) ref.read(chatProvider.notifier).discard(o);
  }
}

class _Composer extends ConsumerStatefulWidget {
  const _Composer();

  @override
  ConsumerState<_Composer> createState() => _ComposerState();
}

class _ComposerState extends ConsumerState<_Composer> {
  final _text = TextEditingController();
  String? _error;

  static const _quick = ['PR ready for review', "I'm stuck on this", 'Good morning'];

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
    final err = ref.read(chatProvider.notifier).send(preset ?? _text.text);
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
              if (_text.text.isEmpty)
                SizedBox(
                  height: 40,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: _quick.length,
                    separatorBuilder: (_, _) => const SizedBox(width: Space.sm),
                    itemBuilder: (_, i) => ShadButton.outline(
                      size: ShadButtonSize.sm,
                      onPressed: () => _send(_quick[i]),
                      child: Text(_quick[i]),
                    ),
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
                      placeholder: const Text('Message your team lead'),
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
                        child: Text(
                          _error ?? '',
                          style: t.textTheme.small.copyWith(color: t.colorScheme.destructive),
                        ),
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
