import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/realtime.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/shared/motion.dart';

/// Pulsing placeholder rows shown while a list loads.
class SkeletonList extends StatefulWidget {
  const SkeletonList({super.key, this.rows = 5, this.height = 76});

  final int rows;
  final double height;

  @override
  State<SkeletonList> createState() => _SkeletonListState();
}

class _SkeletonListState extends State<SkeletonList> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = ShadTheme.of(context).colorScheme.muted;
    return Semantics(
      label: 'Loading',
      child: FadeTransition(
        opacity: Tween<double>(begin: 0.45, end: 1).animate(_c),
        child: ListView.separated(
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.all(Space.lg),
          itemCount: widget.rows + (widget.rows >= 3 ? 1 : 0),
          separatorBuilder: (_, _) => const SizedBox(height: Space.md),
          itemBuilder: (_, i) => i == widget.rows
              ? Quip(seed: widget.rows)
              : Container(
                  height: widget.height,
                  decoration: BoxDecoration(color: color, borderRadius: const BorderRadius.all(Radii.md)),
                ),
        ),
      ),
    );
  }
}

/// Explains why a screen is empty and offers the next step.
class EmptyState extends StatelessWidget {
  const EmptyState({required this.icon, required this.title, required this.body, super.key, this.action});

  final IconData icon;
  final String title;
  final String body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(Space.xxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: Color.alphaBlend(t.colorScheme.primary.withValues(alpha: 0.12), t.colorScheme.background),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 28, color: t.colorScheme.primary),
            ),
            const SizedBox(height: Space.lg),
            Text(title, style: t.textTheme.h4, textAlign: TextAlign.center),
            const SizedBox(height: Space.sm),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 320),
              child: Text(body, style: t.textTheme.muted, textAlign: TextAlign.center),
            ),
            if (action != null) ...[const SizedBox(height: Space.xl), action!],
          ],
        ),
      ),
    );
  }
}

class ErrorState extends StatelessWidget {
  const ErrorState({required this.message, required this.onRetry, super.key});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => EmptyState(
    icon: LucideIcons.cloudOff,
    title: "Couldn't load this",
    body: message,
    action: ShadButton(onPressed: onRetry, leading: const Icon(LucideIcons.refreshCw, size: 16), child: const Text('Try again')),
  );
}

/// How long the live connection may be down before we mention it. Blips stay invisible.
const bannerGrace = Duration(seconds: 4);

/// A slim banner once the live connection has been down for [bannerGrace]. Hidden when live.
class ConnectionBanner extends StatefulWidget {
  const ConnectionBanner({required this.status, super.key});

  final Stream<SocketStatus> status;

  @override
  State<ConnectionBanner> createState() => _ConnectionBannerState();
}

class _ConnectionBannerState extends State<ConnectionBanner> {
  StreamSubscription<SocketStatus>? _sub;
  Timer? _timer;
  var _show = false;

  @override
  void initState() {
    super.initState();
    _listen();
  }

  @override
  void didUpdateWidget(ConnectionBanner old) {
    super.didUpdateWidget(old);
    if (old.status != widget.status) _listen();
  }

  void _listen() {
    unawaited(_sub?.cancel());
    _sub = widget.status.listen((s) {
      switch (s) {
        case SocketStatus.live:
          _timer?.cancel();
          if (_show) setState(() => _show = false);
        case SocketStatus.offline:
          _timer ??= Timer(bannerGrace, () {
            _timer = null;
            if (mounted) setState(() => _show = true);
          });
        case SocketStatus.connecting:
          break; // keep whatever we show while a retry is in flight
      }
    });
  }

  @override
  void dispose() {
    unawaited(_sub?.cancel());
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final show = _show;
    final t = ShadTheme.of(context);
    return AnimatedSize(
      duration: const Duration(milliseconds: 200),
      child: show
          ? Semantics(
              liveRegion: true,
              child: Container(
                width: double.infinity,
                color: Color.alphaBlend(Brand.warning.withValues(alpha: 0.14), t.colorScheme.background),
                padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.sm),
                child: Row(
                  children: [
                    const Icon(LucideIcons.wifiOff, size: 16, color: Brand.warning),
                    const SizedBox(width: Space.sm),
                    Expanded(
                      child: Text(
                        'Reconnecting… new messages appear when you’re back online.',
                        style: t.textTheme.small.copyWith(color: t.colorScheme.foreground, fontWeight: FontWeight.w500),
                      ),
                    ),
                  ],
                ),
              ),
            )
          : const SizedBox(width: double.infinity),
    );
  }
}
