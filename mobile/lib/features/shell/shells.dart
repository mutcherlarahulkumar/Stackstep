import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/features/admin/assign_screen.dart';
import 'package:stackstep/features/chat/chat_screen.dart';
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

/// Student home: chat first, then the board.
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
                  Text(_tab == 0 ? 'Team lead' : 'Your board', style: t.textTheme.large),
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
          ChatScreen(
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
        destinations: const [
          NavigationDestination(icon: Icon(LucideIcons.messageCircle), label: 'Chat'),
          NavigationDestination(icon: Icon(LucideIcons.squareKanban), label: 'Tasks'),
        ],
      ),
    );
  }
}

/// Admins on mobile get task allocation only, plus a pointer to the desktop console.
class AdminShell extends StatelessWidget {
  const AdminShell({required this.me, super.key});
  final Me me;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        titleSpacing: Space.lg,
        title: const Row(
          children: [
            BrandMark(size: 30),
            SizedBox(width: Space.md),
            Text('Assign tasks'),
          ],
        ),
        actions: [_AccountMenu(user: me.user)],
      ),
      body: StudentPickerScreen(
        onPick: (s) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AssignTaskScreen(student: s))),
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
