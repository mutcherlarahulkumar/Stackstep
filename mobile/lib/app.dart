import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/features/login/login_screen.dart';
import 'package:stackstep/features/shell/shells.dart';

class StackstepApp extends ConsumerWidget {
  const StackstepApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ShadApp.custom(
      theme: shadTheme(Brightness.light),
      darkTheme: shadTheme(Brightness.dark),
      appBuilder: (context) => MaterialApp(
        title: 'Stackstep',
        debugShowCheckedModeBanner: false,
        theme: materialTheme(context),
        localizationsDelegates: const [
          GlobalShadLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
        ],
        builder: (context, child) => ShadAppBuilder(child: child),
        home: const _Root(),
      ),
    );
  }
}

/// Picks the surface from the session: one place decides who sees what.
class _Root extends ConsumerWidget {
  const _Root();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    final screen = switch (session) {
      SessionLoading() => const SplashScreen(),
      SignedOut(:final message) => LoginScreen(key: ValueKey('login-$message'), initialMessage: message),
      SignedIn(:final me) when me.user.role.isStaff => AdminShell(me: me),
      SignedIn(:final me) when me.enrollment == null => NoEnrollmentScreen(me: me),
      SignedIn(:final me) => StudentShell(me: me),
    };
    return AnimatedSwitcher(duration: const Duration(milliseconds: 220), child: screen);
  }
}
