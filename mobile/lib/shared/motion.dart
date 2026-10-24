import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

/// Light software-industry lines shown while something loads (same list as the web app).
const quips = <String>[
  'Compiling your coffee…',
  'Rubber-ducking the server…',
  "git pull --rebase on today's tickets…",
  'Asking the team lead for an ETA…',
  'Warming up the CI runners…',
  'Resolving merge conflicts in the space-time continuum…',
  'Writing tests first. Promise.',
  'Turning it off and on again…',
  'It works on my machine. Checking yours…',
  'Reticulating flexbox splines…',
  'Naming things (the hard part)…',
  'Clearing the cache. And the other cache.',
  'Bumping the version to 0.0.1-beta-final-final…',
  "Reading the docs so you don't have to…",
  'Shipping small, shipping often…',
  'Code review in progress: looks good to me…',
  'Spinning up a fresh branch…',
  'Linting the vibes…',
  'Off-by-one? Counting again…',
  'Waiting for npm install to finish…',
  'Pairing with the database…',
  'Squashing bugs, one console.log at a time…',
  'Deploying to production on a Friday? Never.',
  'Grepping for the meaning of life…',
  'Converting caffeine into commits…',
  'Opening a pull request for your day…',
  'Async/awaiting greatness…',
  'Refactoring the loading screen…',
];

String quipAt(int i) => quips[((i % quips.length) + quips.length) % quips.length];

/// A rotating industry one-liner. Decorative: screen readers hear the surrounding "Loading".
class Quip extends StatefulWidget {
  const Quip({super.key, this.seed = 0});
  final int seed;

  @override
  State<Quip> createState() => _QuipState();
}

class _QuipState extends State<Quip> {
  late int _i = widget.seed;
  Timer? _timer;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _timer?.cancel();
    if (!MediaQuery.disableAnimationsOf(context)) {
      _timer = Timer.periodic(const Duration(milliseconds: 3200), (_) => setState(() => _i++));
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    return ExcludeSemantics(
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 300),
        transitionBuilder: (child, a) => FadeTransition(
          opacity: a,
          child: SlideTransition(
            position: Tween(begin: const Offset(0, 0.3), end: Offset.zero).animate(a),
            child: child,
          ),
        ),
        child: Text(quipAt(_i), key: ValueKey(_i), textAlign: TextAlign.center, style: t.textTheme.muted),
      ),
    );
  }
}

/// Eases between loading, empty, error and loaded states instead of popping.
class FadeSwitch extends StatelessWidget {
  const FadeSwitch({required this.child, super.key});
  final Widget child;

  @override
  Widget build(BuildContext context) => AnimatedSwitcher(
    duration: MediaQuery.disableAnimationsOf(context) ? Duration.zero : const Duration(milliseconds: 260),
    switchInCurve: Curves.easeOutCubic,
    transitionBuilder: (child, a) => FadeTransition(
      opacity: a,
      child: SlideTransition(
        position: Tween(begin: const Offset(0, 0.015), end: Offset.zero).animate(a),
        child: child,
      ),
    ),
    child: child,
  );
}
