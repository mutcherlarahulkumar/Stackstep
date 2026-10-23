import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/features/ai/ai_screen.dart';
import 'package:stackstep/features/chat/chat_screen.dart';
import 'package:stackstep/features/chat/inbox_controller.dart';
import 'package:stackstep/shared/errors.dart';
import 'package:stackstep/shared/format.dart';
import 'package:stackstep/shared/motion.dart';
import 'package:stackstep/shared/state_views.dart';
import 'package:stackstep/ui/ui.dart';

/// A full-screen conversation with a header naming the other side.
class ChatPage extends StatelessWidget {
  const ChatPage({required this.target, required this.avatar, required this.title, required this.subtitle, super.key, this.onOpenTask});

  final ChatTarget target;
  final Widget avatar;
  final String title;
  final String subtitle;
  final void Function(String taskId)? onOpenTask;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          children: [
            SizedBox.square(dimension: 36, child: FittedBox(child: avatar)),
            const SizedBox(width: Space.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: t.textTheme.large, overflow: TextOverflow.ellipsis),
                  Text(subtitle, style: t.textTheme.muted.copyWith(fontSize: 12), overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
          ],
        ),
      ),
      body: ChatScreen(target: target, other: avatar, otherName: title, onOpenTask: onOpenTask),
    );
  }
}

/// Opens a student's conversation with a persona.
Future<void> openStudentThread(BuildContext context, Persona p, {void Function(String taskId)? onOpenTask}) => Navigator.of(context).push(
  MaterialPageRoute<void>(
    builder: (ctx) => ChatPage(
      target: (personaId: p.id, enrollmentId: null),
      avatar: PersonaAvatar(p),
      title: p.name,
      subtitle: p.title,
      onOpenTask: onOpenTask == null
          ? null
          : (id) {
              Navigator.of(ctx).pop();
              onOpenTask(id);
            },
    ),
  ),
);

/// Opens an admin's view of one student's conversation, written as the persona.
Future<void> openStaffThread(BuildContext context, Thread th) => Navigator.of(context).push(
  MaterialPageRoute<void>(
    builder: (_) => ChatPage(
      target: (personaId: th.persona.id, enrollmentId: th.enrollmentId),
      avatar: _StudentAvatar(name: th.studentName ?? 'Student'),
      title: th.studentName ?? 'Student',
      subtitle: 'You reply as ${th.persona.name} · ${th.persona.title}',
    ),
  ),
);

class _StudentAvatar extends StatelessWidget {
  const _StudentAvatar({required this.name});
  final String name;

  @override
  Widget build(BuildContext context) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    final initials = parts.isEmpty ? '?' : (parts.first[0] + (parts.length > 1 ? parts.last[0] : '')).toUpperCase();
    return ShadAvatar('', placeholder: Text(initials), size: const Size.square(40));
  }
}

class _UnreadBadge extends StatelessWidget {
  const _UnreadBadge(this.count);
  final int count;

  @override
  Widget build(BuildContext context) {
    final c = ShadTheme.of(context).colorScheme;
    return Container(
      constraints: const BoxConstraints(minWidth: 20),
      height: 20,
      padding: const EdgeInsets.symmetric(horizontal: 6),
      alignment: Alignment.center,
      decoration: BoxDecoration(color: c.primary, borderRadius: BorderRadius.circular(10)),
      child: Text(
        count > 99 ? '99+' : '$count',
        style: TextStyle(color: c.primaryForeground, fontSize: 11, fontWeight: FontWeight.w600),
      ),
    );
  }
}

/// One inbox row: avatar, name, a one-line preview, time and unread count.
class _ThreadTile extends ConsumerWidget {
  const _ThreadTile({
    required this.tileKey,
    required this.avatar,
    required this.title,
    required this.preview,
    required this.at,
    required this.unread,
    required this.onTap,
    this.tag,
  });

  final Key tileKey;
  final Widget avatar;
  final String title;
  final String preview;
  final DateTime? at;
  final int unread;
  final VoidCallback onTap;
  final Widget? tag;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ShadTheme.of(context);
    final now = ref.watch(clockProvider)();
    final bold = unread > 0;
    return Semantics(
      button: true,
      label: '$title. ${unread > 0 ? '$unread unread. ' : ''}$preview',
      excludeSemantics: true,
      child: InkWell(
        key: tileKey,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.md),
          child: Row(
            children: [
              SizedBox.square(dimension: 46, child: FittedBox(child: avatar)),
              const SizedBox(width: Space.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: t.textTheme.large.copyWith(fontSize: 16, fontWeight: bold ? FontWeight.w700 : FontWeight.w600),
                          ),
                        ),
                        if (at != null)
                          Text(
                            inboxTimeLabel(at!, now),
                            style: t.textTheme.muted.copyWith(fontSize: 12, color: bold ? t.colorScheme.primary : null),
                          ),
                      ],
                    ),
                    if (tag != null) ...[const SizedBox(height: 2), tag!],
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            preview,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: t.textTheme.muted.copyWith(color: bold ? t.colorScheme.foreground : null),
                          ),
                        ),
                        if (unread > 0) ...[const SizedBox(width: Space.sm), _UnreadBadge(unread)],
                      ],
                    ),
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

String _preview(Message? m, {required bool staff}) {
  if (m == null) return 'No messages yet';
  final mine = staff ? m.author == Author.persona : m.author == Author.student;
  return '${mine ? 'You: ' : ''}${previewLine(m.body)}';
}

/// The pinned AI helper row at the top of the student's chats.
class _AIRow extends StatelessWidget {
  const _AIRow();

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    return Semantics(
      button: true,
      label: 'AI helper. Stuck after trying? Ask for a hint.',
      excludeSemantics: true,
      child: InkWell(
        key: const Key('thread-ai'),
        onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AIHelperScreen())),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.md),
          child: Row(
            children: [
              const AIAvatar(size: 46),
              const SizedBox(width: Space.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('AI helper', style: t.textTheme.large.copyWith(fontSize: 16)),
                    Text('Stuck after trying? Ask for a hint', style: t.textTheme.muted),
                  ],
                ),
              ),
              const Icon(LucideIcons.chevronRight, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}

/// The student's chats: the AI helper, then one conversation per persona.
class StudentInboxScreen extends ConsumerWidget {
  const StudentInboxScreen({super.key, this.onOpenTask});

  final void Function(String taskId)? onOpenTask;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inbox = ref.watch(studentInboxProvider);
    final rt = ref.watch(realtimeProvider);
    return Column(
      children: [
        ConnectionBanner(status: rt.status),
        Expanded(
          child: FadeSwitch(
            child: switch (inbox) {
              AsyncData(:final value) when value.isEmpty => RefreshIndicator(
                onRefresh: () => ref.read(studentInboxProvider.notifier).refresh(),
                child: ListView(
                  children: const [
                    _AIRow(),
                    Divider(height: 1),
                    SizedBox(
                      height: 420,
                      child: EmptyState(
                        icon: LucideIcons.messagesSquare,
                        title: 'No chats yet',
                        body: 'Your team posts tickets and updates here once your internship starts. Each person gets their own chat.',
                      ),
                    ),
                  ],
                ),
              ),
              AsyncData(:final value) => RefreshIndicator(
                onRefresh: () => ref.read(studentInboxProvider.notifier).refresh(),
                child: ListView.separated(
                  key: const Key('student-inbox'),
                  itemCount: value.length + 1,
                  separatorBuilder: (_, _) => const Divider(height: 1, indent: 76),
                  itemBuilder: (context, index) {
                    if (index == 0) return const _AIRow();
                    final th = value[index - 1];
                    return _ThreadTile(
                      tileKey: Key('thread-${th.persona.id}'),
                      avatar: PersonaAvatar(th.persona),
                      title: th.persona.name,
                      tag: Text(th.persona.title, style: ShadTheme.of(context).textTheme.muted.copyWith(fontSize: 12)),
                      preview: _preview(th.lastMessage, staff: false),
                      at: th.lastMessage?.sentAt,
                      unread: th.unread,
                      onTap: () => openStudentThread(context, th.persona, onOpenTask: onOpenTask),
                    );
                  },
                ),
              ),
              AsyncError(:final error) => ErrorState(message: messageFor(error), onRetry: () => ref.invalidate(studentInboxProvider)),
              _ => const SkeletonList(rows: 4, height: 64),
            },
          ),
        ),
      ],
    );
  }
}

/// The admin inbox on phones: reply to any student as the persona they wrote to.
class StaffInboxScreen extends ConsumerWidget {
  const StaffInboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inbox = ref.watch(staffInboxProvider);
    final unreadOnly = inbox.value?.unreadOnly ?? false;
    final t = ShadTheme.of(context);
    return Column(
      children: [
        ConnectionBanner(status: ref.watch(realtimeProvider).status),
        Padding(
          padding: const EdgeInsets.fromLTRB(Space.lg, Space.sm, Space.lg, Space.sm),
          child: Row(
            children: [
              for (final (v, label) in [(false, 'All'), (true, 'Unread')]) ...[
                Semantics(
                  selected: unreadOnly == v,
                  child: (unreadOnly == v ? ShadButton.new : ShadButton.outline)(
                    key: Key('inbox-filter-${v ? 'unread' : 'all'}'),
                    size: ShadButtonSize.sm,
                    onPressed: () => ref.read(staffInboxProvider.notifier).setUnreadOnly(unreadOnly: v),
                    child: Text(label),
                  ),
                ),
                const SizedBox(width: Space.sm),
              ],
            ],
          ),
        ),
        Expanded(
          child: FadeSwitch(
            child: switch (inbox) {
              AsyncData(:final value) when value.items.isEmpty => EmptyState(
                icon: LucideIcons.inbox,
                title: value.unreadOnly ? 'All caught up' : 'No conversations yet',
                body: value.unreadOnly
                    ? 'Nothing waiting on a reply. New student messages show up here live.'
                    : 'Conversations start when a persona posts a task or a student writes in.',
              ),
              AsyncData(:final value) => RefreshIndicator(
                onRefresh: () => ref.read(staffInboxProvider.notifier).refresh(),
                child: ListView.separated(
                  key: const Key('staff-inbox'),
                  itemCount: value.items.length + (value.nextCursor != null ? 1 : 0),
                  separatorBuilder: (_, _) => const Divider(height: 1, indent: 76),
                  itemBuilder: (context, i) {
                    if (i == value.items.length) {
                      unawaited(ref.read(staffInboxProvider.notifier).loadMore());
                      return const Padding(
                        padding: EdgeInsets.all(Space.lg),
                        child: Center(child: SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))),
                      );
                    }
                    final th = value.items[i];
                    return _ThreadTile(
                      tileKey: Key('staff-thread-${th.key}'),
                      avatar: _StudentAvatar(name: th.studentName ?? 'Student'),
                      title: th.studentName ?? 'Student',
                      tag: Row(
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(color: personaColor(th.persona.color), shape: BoxShape.circle),
                          ),
                          const SizedBox(width: 6),
                          Flexible(
                            child: Text(
                              'with ${th.persona.name}${th.studentLogin == null ? '' : ' · @${th.studentLogin}'}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: t.textTheme.muted.copyWith(fontSize: 12),
                            ),
                          ),
                        ],
                      ),
                      preview: _preview(th.lastMessage, staff: true),
                      at: th.lastMessage?.sentAt,
                      unread: th.unread,
                      onTap: () => openStaffThread(context, th),
                    );
                  },
                ),
              ),
              AsyncError(:final error) => ErrorState(message: messageFor(error), onRetry: () => ref.invalidate(staffInboxProvider)),
              _ => const SkeletonList(rows: 6, height: 64),
            },
          ),
        ),
      ],
    );
  }
}
