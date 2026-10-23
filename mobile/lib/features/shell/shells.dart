import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/features/admin/assign_screen.dart';
import 'package:stackstep/features/admin/broadcast_screen.dart';
import 'package:stackstep/features/chat/inbox_controller.dart';
import 'package:stackstep/features/chat/inbox_screen.dart';
import 'package:stackstep/features/tasks/board_screen.dart';
import 'package:stackstep/shared/brand_mark.dart';
import 'package:stackstep/shared/state_views.dart';

class _AccountMenu extends ConsumerWidget {
  const _AccountMenu({required this.user});
  final User user;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return PopupMenuButton<String>(
      tooltip: 'Account',
      offset: const Offset(0, 48),
      onSelected: (v) async {
        if (v != 'out') return;
        final ok = await showShadDialog<bool>(
          context: context,
          builder: (ctx) => ShadDialog.alert(
            title: const Text('Sign out?'),
            description: const Text('Unsent messages on this device will be lost.'),
            actions: [
              ShadButton.outline(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
              ShadButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Sign out')),
            ],
          ),
        );
        if (ok ?? false) await ref.read(sessionProvider.notifier).signOut();
      },
      itemBuilder: (_) => [
        PopupMenuItem(enabled: false, child: Text('${user.name}\n@${user.githubLogin}')),
        const PopupMenuDivider(),
        const PopupMenuItem(value: 'out', child: Text('Sign out')),
      ],
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Space.md),
        child: ShadAvatar(user.avatarUrl ?? '', placeholder: Text(user.initials), size: const Size.square(34)),
      ),
    );
  }
}

/// Student home: chats (one per persona) first, then the board.
class StudentShell extends ConsumerStatefulWidget {
  const StudentShell({required this.me, super.key});
  final Me me;

  @override
  ConsumerState<StudentShell> createState() => _StudentShellState();
}

class _StudentShellState extends ConsumerState<StudentShell> {
  var _tab = 0;
  String? _focusTask;

  @override
  Widget build(BuildContext context) {
    final e = widget.me.enrollment!;
    final t = ShadTheme.of(context);
    final unread = totalUnread(ref.watch(studentInboxProvider).value ?? const []);
    return Scaffold(
      appBar: AppBar(
        titleSpacing: Space.lg,
        title: Row(
          children: [
            const BrandMark(size: 30),
            const SizedBox(width: Space.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_tab == 0 ? 'Chats' : 'Your board', style: t.textTheme.large),
                  Text(
                    e.status == EnrollmentStatus.paused
                        ? 'Internship paused'
                        : e.dayNumber == 0
                        ? 'Starts ${e.startDate}'
                        : 'Day ${e.dayNumber} of ${e.program.days}',
                    style: t.textTheme.muted.copyWith(fontSize: 12),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [_AccountMenu(user: widget.me.user)],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(3),
          child: ShadProgress(value: e.program.days == 0 ? 0 : (e.dayNumber / e.program.days).clamp(0, 1).toDouble(), minHeight: 3),
        ),
      ),
      body: IndexedStack(
        index: _tab,
        children: [
          StudentInboxScreen(
            onOpenTask: (id) => setState(() {
              _focusTask = id;
              _tab = 1;
            }),
          ),
          BoardScreen(focusTaskId: _focusTask, onFocusHandled: () => _focusTask = null),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          NavigationDestination(
            icon: _Badged(count: unread, child: const Icon(LucideIcons.messageCircle)),
            label: 'Chats',
          ),
          const NavigationDestination(icon: Icon(LucideIcons.squareKanban), label: 'Tasks'),
        ],
      ),
    );
  }
}

/// Small count bubble on a nav icon.
class _Badged extends StatelessWidget {
  const _Badged({required this.count, required this.child});
  final int count;
  final Widget child;

  @override
  Widget build(BuildContext context) => Badge(isLabelVisible: count > 0, label: Text(count > 99 ? '99+' : '$count'), child: child);
}

/// Admins on mobile: assign tasks and answer students as a persona. Flows, the task
/// library and reviews live on the desktop console.
class AdminShell extends ConsumerStatefulWidget {
  const AdminShell({required this.me, super.key});
  final Me me;

  @override
  ConsumerState<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends ConsumerState<AdminShell> {
  var _tab = 0;

  @override
  Widget build(BuildContext context) {
    final unread = totalUnread(ref.watch(staffInboxProvider).value?.items ?? const []);
    return Scaffold(
      appBar: AppBar(
        titleSpacing: Space.lg,
        title: Row(
          children: [
            const BrandMark(size: 30),
            const SizedBox(width: Space.md),
            Text(_tab == 0 ? 'Assign tasks' : 'Inbox'),
          ],
        ),
        actions: [_AccountMenu(user: widget.me.user)],
      ),
      body: IndexedStack(
        index: _tab,
        children: [
          StudentPickerScreen(
            onPick: (s) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AssignTaskScreen(student: s))),
          ),
          const StaffInboxScreen(),
        ],
      ),
      floatingActionButton: _tab == 1
          ? FloatingActionButton.extended(
              key: const Key('broadcast-open'),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const BroadcastScreen())),
              icon: const Icon(LucideIcons.megaphone),
              label: const Text('Message students'),
            )
          : null,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          const NavigationDestination(icon: Icon(LucideIcons.clipboardPlus), label: 'Assign'),
          NavigationDestination(
            icon: _Badged(count: unread, child: const Icon(LucideIcons.inbox)),
            label: 'Inbox',
          ),
        ],
      ),
    );
  }
}

class NoEnrollmentScreen extends ConsumerWidget {
  const NoEnrollmentScreen({required this.me, super.key});
  final Me me;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(actions: [_AccountMenu(user: me.user)]),
      body: EmptyState(
        icon: LucideIcons.calendarX2,
        title: 'No active internship',
        body:
            "You're signed in as @${me.user.githubLogin}, but you aren't enrolled in a program right now. If your college enrolled you, ask your placement cell to check the email on your GitHub account.",
        action: ShadButton.outline(
          leading: const Icon(LucideIcons.refreshCw, size: 16),
          onPressed: () => ref.read(sessionProvider.notifier).refreshMe(),
          child: const Text('Check again'),
        ),
      ),
    );
  }
}

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: Semantics(label: 'Loading Stackstep', child: const BrandMark(size: 64)),
    ),
  );
}
