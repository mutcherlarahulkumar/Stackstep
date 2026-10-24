import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/api_client.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/core/config.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/features/tasks/task_work.dart';
import 'package:stackstep/shared/brand_mark.dart';
import 'package:stackstep/shared/errors.dart';
import 'package:stackstep/shared/legal.dart';

const List<IconData> _icons = [LucideIcons.userRound, LucideIcons.eye, LucideIcons.users, LucideIcons.bot, LucideIcons.download];

/// First sign-in (and after the terms change): what we keep and who sees it, then accept.
class ConsentScreen extends ConsumerStatefulWidget {
  const ConsentScreen({required this.me, super.key});
  final Me me;

  @override
  ConsumerState<ConsentScreen> createState() => _ConsentScreenState();
}

class _ConsentScreenState extends ConsumerState<ConsentScreen> {
  var _agreed = false;
  var _busy = false;
  String? _error;
  var _stale = false;

  Future<void> _accept() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final a = await ref.read(apiClientProvider).acceptTerms(termsVersion);
      ref.read(sessionProvider.notifier).setAccount(a);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => e.code == ErrorCode.validationFailed ? _stale = true : _error = messageFor(e));
    } on Object catch (e) {
      if (mounted) setState(() => _error = messageFor(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final first = widget.me.user.name.trim().split(RegExp(r'\s+')).first;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: ListView(
              padding: const EdgeInsets.all(Space.xl),
              shrinkWrap: true,
              children: [
                const Align(alignment: Alignment.centerLeft, child: BrandMark()),
                const SizedBox(height: Space.lg),
                Semantics(header: true, child: Text('Hi $first, a quick check first', style: t.textTheme.h3)),
                const SizedBox(height: Space.xs),
                Text("Before you start, here's what Stackstep keeps and who can see it.", style: t.textTheme.muted),
                const SizedBox(height: Space.lg),
                for (final (i, line) in consentSummary.indexed)
                  Padding(
                    padding: const EdgeInsets.only(bottom: Space.md),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        CircleAvatar(
                          radius: 15,
                          backgroundColor: t.colorScheme.primary.withValues(alpha: 0.12),
                          child: Icon(_icons[i % _icons.length], size: 16, color: t.colorScheme.primary),
                        ),
                        const SizedBox(width: Space.md),
                        Expanded(
                          child: Text(line, style: t.textTheme.small.copyWith(height: 1.45, fontWeight: FontWeight.w400)),
                        ),
                      ],
                    ),
                  ),
                Wrap(
                  spacing: Space.sm,
                  children: [
                    ShadButton.link(
                      key: const Key('open-privacy'),
                      onPressed: () => openLink(context, AppConfig.webUrl('/privacy')),
                      child: const Text('Privacy notice'),
                    ),
                    ShadButton.link(onPressed: () => openLink(context, AppConfig.webUrl('/terms')), child: const Text('Terms of use')),
                  ],
                ),
                const SizedBox(height: Space.sm),
                ShadCard(
                  padding: const EdgeInsets.all(Space.md),
                  child: ShadCheckbox(
                    key: const Key('consent-check'),
                    value: _agreed,
                    onChanged: (v) => setState(() => _agreed = v),
                    label: const Text("I've read the privacy notice and accept the terms of use."),
                  ),
                ),
                if (_stale) ...[
                  const SizedBox(height: Space.md),
                  const ShadAlert.destructive(
                    title: Text('These terms have changed'),
                    description: Text('Update the app to read the latest version before accepting.'),
                  ),
                ] else if (_error != null) ...[
                  const SizedBox(height: Space.md),
                  Text(_error!, style: TextStyle(color: t.colorScheme.destructive)),
                ],
                const SizedBox(height: Space.lg),
                ShadButton(
                  key: const Key('consent-accept'),
                  width: double.infinity,
                  enabled: _agreed && !_busy && !_stale,
                  onPressed: _accept,
                  leading: _busy
                      ? const SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(LucideIcons.shieldCheck, size: 16),
                  child: const Text('Accept and continue'),
                ),
                const SizedBox(height: Space.sm),
                ShadButton.ghost(
                  width: double.infinity,
                  onPressed: () => ref.read(sessionProvider.notifier).signOut(),
                  child: const Text('Not now, sign out'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
