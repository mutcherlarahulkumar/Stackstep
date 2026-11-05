import 'package:flutter/material.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/core/theme.dart';

/// Shown in place of a part of the screen that failed to build. The rest of the app keeps
/// working; going back and opening the screen again usually fixes it.
class CrashView extends StatelessWidget {
  const CrashView({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = ShadTheme.maybeOf(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Space.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(LucideIcons.cloudOff, size: 28),
            const SizedBox(height: Space.sm),
            Text(
              'This part didn’t load. Go back and open it again.',
              textAlign: TextAlign.center,
              style: theme?.textTheme.muted ?? const TextStyle(fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }
}
