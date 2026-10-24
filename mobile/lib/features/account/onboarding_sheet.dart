import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/shared/onboarding.dart';

/// Shows the four-step guide once; finishing or skipping is stored on the server.
Future<void> showOnboarding(BuildContext context, WidgetRef ref) async {
  await showModalBottomSheet<void>(context: context, isScrollControlled: true, showDragHandle: true, builder: (_) => const _Guide());
  try {
    final a = await ref.read(apiClientProvider).finishOnboarding();
    ref.read(sessionProvider.notifier).setAccount(a);
  } on Object {
    // Offline: the guide shows again next time, which is harmless.
  }
}

class _Guide extends StatefulWidget {
  const _Guide();

  @override
  State<_Guide> createState() => _GuideState();
}

class _GuideState extends State<_Guide> {
  var _step = 0;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final s = guide[_step];
    final last = _step == guide.length - 1;
    return SafeArea(
      child: Padding(
        key: const Key('onboarding'),
        padding: const EdgeInsets.fromLTRB(Space.xl, 0, Space.xl, Space.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 220),
              child: Column(
                key: ValueKey(_step),
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: t.colorScheme.primary.withValues(alpha: 0.12),
                      borderRadius: const BorderRadius.all(Radius.circular(14)),
                    ),
                    child: Icon(s.icon, color: t.colorScheme.primary),
                  ),
                  const SizedBox(height: Space.md),
                  Semantics(
                    liveRegion: true,
                    child: Text('Step ${_step + 1} of ${guide.length}', style: t.textTheme.muted.copyWith(fontSize: 12)),
                  ),
                  const SizedBox(height: Space.xs),
                  Semantics(header: true, child: Text(s.title, style: t.textTheme.large)),
                  const SizedBox(height: Space.sm),
                  Text(s.body, style: t.textTheme.muted.copyWith(height: 1.45)),
                ],
              ),
            ),
            const SizedBox(height: Space.lg),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < guide.length; i++)
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    width: i == _step ? 22 : 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: i == _step ? t.colorScheme.primary : t.colorScheme.mutedForeground.withValues(alpha: 0.3),
                      borderRadius: const BorderRadius.all(Radii.pill),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: Space.lg),
            Row(
              children: [
                ShadButton.ghost(key: const Key('onboarding-skip'), onPressed: () => Navigator.pop(context), child: const Text('Skip')),
                const Spacer(),
                if (_step > 0)
                  Semantics(
                    label: 'Previous step',
                    child: ShadIconButton.outline(
                      icon: const Icon(LucideIcons.arrowLeft, size: 16),
                      onPressed: () => setState(() => _step--),
                    ),
                  ),
                const SizedBox(width: Space.sm),
                ShadButton(
                  key: Key(last ? 'onboarding-done' : 'onboarding-next'),
                  onPressed: () => last ? Navigator.pop(context) : setState(() => _step++),
                  trailing: last ? null : const Icon(LucideIcons.arrowRight, size: 16),
                  child: Text(last ? "Let's go" : 'Next'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Opens the guide after the first frame when the student hasn't seen it.
void maybeShowOnboarding(BuildContext context, WidgetRef ref, {required bool onboarded}) {
  if (onboarded) return;
  WidgetsBinding.instance.addPostFrameCallback((_) {
    if (context.mounted) unawaited(showOnboarding(context, ref));
  });
}
