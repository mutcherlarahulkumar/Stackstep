import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/core/config.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/shared/brand_mark.dart';
import 'package:stackstep/ui/github_mark.dart';
import 'package:stackstep/ui/ui.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.initialMessage});

  final String? initialMessage;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  late String? _error = widget.initialMessage;
  bool _busy = false;

  Future<void> _run(Future<String?> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final err = await action();
    if (mounted) {
      setState(() {
        _busy = false;
        _error = err;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final session = ref.read(sessionProvider.notifier);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: Space.xl, vertical: Space.xxl),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Align(alignment: Alignment.centerLeft, child: BrandMark(size: 52)),
                  const SizedBox(height: Space.xl),
                  Text('Your internship,\nstep by step.', style: t.textTheme.h1.copyWith(height: 1.1)),
                  const SizedBox(height: Space.md),
                  Text(
                    'Daily tickets from your team lead, real pull requests on your own GitHub, and a certificate anyone can verify.',
                    style: t.textTheme.lead,
                  ),
                  const SizedBox(height: Space.xxl),
                  if (_error != null) ...[ErrorAlert(title: "Couldn't sign you in", message: _error!), const SizedBox(height: Space.lg)],
                  ShadButton(
                    key: const Key('github-sign-in'),
                    size: ShadButtonSize.lg,
                    height: 52,
                    enabled: !_busy,
                    onPressed: () => _run(session.signInWithGitHub),
                    leading: _busy
                        ? SizedBox.square(
                            dimension: 16,
                            child: CircularProgressIndicator(strokeWidth: 2, color: t.colorScheme.primaryForeground),
                          )
                        : GitHubMark(color: t.colorScheme.primaryForeground),
                    child: Text(_busy ? 'Signing in…' : 'Continue with GitHub'),
                  ),
                  const SizedBox(height: Space.md),
                  Text(
                    'We read your GitHub profile and email only. Stackstep never pushes code to your repos.',
                    style: t.textTheme.muted,
                    textAlign: TextAlign.center,
                  ),
                  if (AppConfig.devLoginEnabled) ...[
                    const SizedBox(height: Space.xxl),
                    const ShadSeparator.horizontal(),
                    const SizedBox(height: Space.lg),
                    _DevLogin(busy: _busy, onPick: (login) => _run(() => session.devLogin(login))),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Debug-only quick sign-in as seeded users (backend/internal/seed).
class _DevLogin extends StatelessWidget {
  const _DevLogin({required this.busy, required this.onPick});

  final bool busy;
  final void Function(String login) onPick;

  static const _users = [
    ('asha-dev', 'Student'),
    ('ravi-dev', 'Student 2'),
    ('nora-dev', 'No internship'),
    ('anits-tpo', 'College admin'),
    ('admin-demo', 'Admin'),
  ];

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(LucideIcons.flaskConical, size: 14, color: t.colorScheme.mutedForeground),
            const SizedBox(width: Space.xs),
            Text('Developer sign-in', style: t.textTheme.muted),
          ],
        ),
        const SizedBox(height: Space.sm),
        Wrap(
          spacing: Space.sm,
          runSpacing: Space.sm,
          children: [
            for (final (login, label) in _users)
              ShadButton.outline(
                key: Key('dev-$login'),
                size: ShadButtonSize.sm,
                enabled: !busy,
                onPressed: () => onPick(login),
                child: Text(label),
              ),
          ],
        ),
      ],
    );
  }
}
