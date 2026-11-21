import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/core/config.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/features/account/onboarding_sheet.dart';
import 'package:stackstep/features/admin/assign_screen.dart';
import 'package:stackstep/features/admin/broadcast_screen.dart';
import 'package:stackstep/features/apply/application_status.dart';
import 'package:stackstep/features/calendar/calendar_screen.dart';
import 'package:stackstep/features/chat/inbox_controller.dart';
import 'package:stackstep/features/chat/inbox_screen.dart';
import 'package:stackstep/features/growth/achievements.dart';
import 'package:stackstep/features/growth/portfolio_screen.dart';
import 'package:stackstep/features/growth/review_lab_screen.dart';
import 'package:stackstep/features/help/help_screen.dart';
import 'package:stackstep/features/home/today_screen.dart';
import 'package:stackstep/features/mail/mail_screen.dart';
import 'package:stackstep/features/progress/progress_screen.dart';
import 'package:stackstep/features/tasks/board_screen.dart';
import 'package:stackstep/features/tasks/task_work.dart';
import 'package:stackstep/shared/brand_mark.dart';
import 'package:stackstep/shared/format.dart';
import 'package:stackstep/shared/motion.dart';

class _AccountMenu extends ConsumerWidget {
  const _AccountMenu({required this.user});
  final User user;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return PopupMenuButton<String>(
      tooltip: 'Account',
      offset: const Offset(0, 48),
      onSelected: (v) async {
        switch (v) {
          case 'help':
            Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const HelpScreen()));
            return;
          case 'portfolio':
            Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const PortfolioScreen()));
            return;
          case 'lab':
            Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const ReviewLabScreen()));
            return;
          case 'badges':
            Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const BadgesScreen()));
            return;
          case 'privacy':
            return await openLink(context, AppConfig.webUrl('/privacy'));
          case 'terms':
            return await openLink(context, AppConfig.webUrl('/terms'));
          case 'out':
            break;
          default:
            return;
        }
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
        if (user.role == Role.student) ...const [
          PopupMenuItem(value: 'badges', child: Text('Your badges')),
          PopupMenuItem(value: 'portfolio', child: Text('Your portfolio')),
          PopupMenuItem(value: 'lab', child: Text('Review lab')),
          PopupMenuDivider(),
        ],
        const PopupMenuItem(value: 'help', child: Text('Help')),
        const PopupMenuItem(value: 'privacy', child: Text('Privacy')),
        const PopupMenuItem(value: 'terms', child: Text('Terms')),
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
  void initState() {
    super.initState();
    maybeShowOnboarding(context, ref, onboarded: widget.me.account.onboarded);
  }

  /// Opens a task on the board, from any tab.
  void _openTask(String id) => setState(() {
    _focusTask = id;
    _tab = 2;
  });

  @override
  Widget build(BuildContext context) {
    final e = widget.me.enrollment!;
    final t = ShadTheme.of(context);
    final unread = totalUnread(ref.watch(studentInboxProvider).value ?? const []);
    final mailUnread = ref.watch(mailProvider).value?.unread ?? 0;
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
                  Text(switch (_tab) {
                    0 => 'Today',
                    1 => 'Chats',
                    2 => 'Your board',
                    3 => 'Calendar',
                    _ => 'Mail',
                  }, style: t.textTheme.large),
                  Text(
                    e.status == EnrollmentStatus.paused
                        ? 'Internship paused'
                        : e.dayNumber == 0
                        ? startsCaption(e.startDate, DateTime.now())
                        : 'Day ${e.dayNumber} of ${e.program.days}',
                    style: t.textTheme.muted.copyWith(fontSize: 12),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          // Today already shows progress up top.
          if (_tab != 0) const ProgressPill(),
          _AccountMenu(user: widget.me.user),
        ],
      ),
      body: IndexedStack(
        index: _tab,
        children: [
          TodayScreen(me: widget.me, onOpenTask: _openTask, onOpenTab: (i) => setState(() => _tab = i)),
          StudentInboxScreen(onOpenTask: _openTask),
          BoardScreen(focusTaskId: _focusTask, onFocusHandled: () => _focusTask = null),
          CalendarScreen(onOpenTask: _openTask),
          MailScreen(onOpenTask: _openTask),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          const NavigationDestination(key: Key('nav-today'), icon: Icon(LucideIcons.house), label: 'Today'),
          NavigationDestination(
            icon: _Badged(count: unread, child: const Icon(LucideIcons.messageCircle)),
            label: 'Chats',
          ),
          const NavigationDestination(icon: Icon(LucideIcons.squareKanban), label: 'Tasks'),
          const NavigationDestination(key: Key('nav-calendar'), icon: Icon(LucideIcons.calendarDays), label: 'Calendar'),
          NavigationDestination(
            key: const Key('nav-mail'),
            icon: _Badged(count: mailUnread, child: const Icon(LucideIcons.mail)),
            label: 'Mail',
          ),
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

class NoEnrollmentScreen extends StatelessWidget {
  const NoEnrollmentScreen({required this.me, super.key});
  final Me me;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(actions: [_AccountMenu(user: me.user)]),
    body: const ApplicationStatusBody(),
  );
}

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: Semantics(
        label: 'Loading Stackstep',
        // The mark eases in from the launch screen's size, so the hand-over feels seamless.
        child: TweenAnimationBuilder<double>(
          tween: Tween(begin: 0.85, end: 1),
          duration: Motion.of(context, const Duration(milliseconds: 600)),
          curve: Curves.easeOutBack,
          builder: (_, v, child) => Transform.scale(scale: v, child: child),
          child: const BrandMark(size: 72),
        ),
      ),
    ),
  );
}
