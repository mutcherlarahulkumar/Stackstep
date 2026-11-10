import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/core/config.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/features/ai/markdown_view.dart';
import 'package:stackstep/features/tasks/task_work.dart';
import 'package:stackstep/shared/errors.dart';
import 'package:stackstep/shared/format.dart';
import 'package:stackstep/shared/motion.dart';
import 'package:stackstep/shared/state_views.dart';

/// The mailbox: refreshed when a letter arrives over the socket, and after reconnecting.
class MailController extends AsyncNotifier<MailPage> {
  @override
  Future<MailPage> build() async {
    final sub = ref.watch(realtimeProvider).frames.listen((f) {
      if (f is MailFrame || f is ReadyFrame) unawaited(refresh());
    });
    ref.onDispose(sub.cancel);
    return await ref.read(apiClientProvider).myMail();
  }

  Future<void> refresh() async {
    final next = await AsyncValue.guard(() => ref.read(apiClientProvider).myMail());
    if (next.hasValue || !state.hasValue) state = next;
  }

  /// Appends the next page, if any.
  Future<void> more() async {
    final cur = state.value;
    if (cur?.nextCursor == null) return;
    final page = await ref.read(apiClientProvider).myMail(cursor: cur!.nextCursor);
    state = AsyncData(MailPage(items: [...cur.items, ...page.items], nextCursor: page.nextCursor, unread: page.unread));
  }

  /// Marks a letter read locally once it has been opened.
  void markRead(String id) {
    final cur = state.value;
    if (cur == null) return;
    final was = cur.items.where((m) => m.id == id && !m.read).length;
    state = AsyncData(
      MailPage(
        items: [
          for (final m in cur.items)
            if (m.id == id) m.asRead() else m,
        ],
        nextCursor: cur.nextCursor,
        unread: (cur.unread - was).clamp(0, cur.unread),
      ),
    );
  }
}

final AsyncNotifierProvider<MailController, MailPage> mailProvider = AsyncNotifierProvider.autoDispose<MailController, MailPage>(
  MailController.new,
);

final FutureProviderFamily<Mail, String> letterProvider = FutureProvider.autoDispose.family<Mail, String>(
  (ref, id) => ref.watch(apiClientProvider).openMail(id),
);

IconData mailIcon(MailKind k) => switch (k) {
  MailKind.announcement => LucideIcons.megaphone,
  MailKind.welcome => LucideIcons.partyPopper,
  MailKind.review => LucideIcons.clipboardCheck,
  MailKind.certificate => LucideIcons.award,
  MailKind.classInvite => LucideIcons.video,
};

class MailScreen extends ConsumerWidget {
  const MailScreen({required this.onOpenTask, super.key});
  final void Function(String taskId) onOpenTask;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mail = ref.watch(mailProvider);
    return FadeSwitch(
      child: switch (mail) {
        AsyncData(:final value) when value.items.isEmpty => const EmptyState(
          icon: LucideIcons.mail,
          title: 'No mail yet',
          body: 'Announcements from your mentors, review results and your welcome letter land here.',
        ),
        AsyncData(:final value) => _MailList(page: value, onOpenTask: onOpenTask),
        AsyncError(:final error) => ErrorState(message: messageFor(error), onRetry: () => ref.invalidate(mailProvider)),
        _ => const SkeletonList(height: 72),
      },
    );
  }
}

class _MailList extends ConsumerWidget {
  const _MailList({required this.page, required this.onOpenTask});
  final MailPage page;
  final void Function(String taskId) onOpenTask;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ShadTheme.of(context);
    final now = ref.watch(clockProvider)();
    return RefreshIndicator(
      onRefresh: () => ref.read(mailProvider.notifier).refresh(),
      child: ListView.separated(
        key: const Key('mail-list'),
        padding: const EdgeInsets.symmetric(vertical: Space.sm),
        itemCount: page.items.length + (page.nextCursor != null ? 1 : 0),
        separatorBuilder: (_, _) => const Divider(height: 1),
        itemBuilder: (context, i) {
          if (i == page.items.length) {
            return Padding(
              padding: const EdgeInsets.all(Space.lg),
              child: ShadButton.outline(onPressed: () => ref.read(mailProvider.notifier).more(), child: const Text('Load older mail')),
            );
          }
          final m = page.items[i];
          return Semantics(
            label: m.read ? null : 'Unread',
            child: ListTile(
              key: Key('mail-${m.subject}'),
              leading: CircleAvatar(
                backgroundColor: t.colorScheme.primary.withValues(alpha: m.read ? 0.08 : 0.16),
                child: Icon(mailIcon(m.kind), size: 18, color: t.colorScheme.primary),
              ),
              title: Text(
                m.subject,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: t.textTheme.small.copyWith(fontWeight: m.read ? FontWeight.w500 : FontWeight.w700),
              ),
              subtitle: Text(
                '${m.fromName} · ${m.preview}',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: t.textTheme.muted.copyWith(fontSize: 12),
              ),
              trailing: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(inboxTimeLabel(m.createdAt, now), style: t.textTheme.muted.copyWith(fontSize: 11)),
                  if (!m.read) ...[
                    const SizedBox(height: 6),
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(color: t.colorScheme.primary, shape: BoxShape.circle),
                    ),
                  ],
                ],
              ),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => LetterScreen(id: m.id, onOpenTask: onOpenTask),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// One letter, rendered as Markdown. Opening it marks it read.
class LetterScreen extends ConsumerWidget {
  const LetterScreen({required this.id, required this.onOpenTask, super.key});
  final String id;
  final void Function(String taskId) onOpenTask;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ShadTheme.of(context);
    ref.listen(letterProvider(id), (_, next) {
      if (next.hasValue) ref.read(mailProvider.notifier).markRead(id);
    });
    final letter = ref.watch(letterProvider(id));
    return Scaffold(
      key: const Key('mail-reader'),
      appBar: AppBar(title: const Text('Mail')),
      body: SafeArea(
        child: switch (letter) {
          AsyncData(:final value) => ListView(
            padding: const EdgeInsets.all(Space.lg),
            children: [
              Row(
                children: [
                  Icon(mailIcon(value.kind), size: 16, color: t.colorScheme.primary),
                  const SizedBox(width: Space.xs),
                  Text(
                    value.kind.label,
                    style: t.textTheme.small.copyWith(color: t.colorScheme.primary, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
              const SizedBox(height: Space.sm),
              Semantics(header: true, child: Text(value.subject, style: t.textTheme.h3)),
              const SizedBox(height: Space.xs),
              Text('From ${value.fromName} · ${dateTimeLabel(value.createdAt)}', style: t.textTheme.muted),
              const Divider(height: Space.xl * 2),
              MarkdownView(value.body ?? ''),
              if (value.classId != null) ...[
                const SizedBox(height: Space.xl),
                ShadButton(
                  key: const Key('mail-join-class'),
                  leading: const Icon(LucideIcons.video, size: 16),
                  onPressed: () => openLink(context, AppConfig.classUrl(value.classId!)),
                  child: const Text('Join the class'),
                ),
                const SizedBox(height: Space.xs),
                Text(
                  'Opens in your browser, where screen sharing and the microphone work.',
                  style: t.textTheme.muted.copyWith(fontSize: 12),
                ),
              ],
              if (value.taskId != null) ...[
                const SizedBox(height: Space.xl),
                ShadButton(
                  key: const Key('mail-open-task'),
                  leading: const Icon(LucideIcons.squareKanban, size: 16),
                  onPressed: () {
                    Navigator.of(context).pop();
                    onOpenTask(value.taskId!);
                  },
                  child: const Text('Open the task'),
                ),
              ],
            ],
          ),
          AsyncError(:final error) => ErrorState(message: messageFor(error), onRetry: () => ref.invalidate(letterProvider(id))),
          _ => const SkeletonList(rows: 3, height: 60),
        },
      ),
    );
  }
}
