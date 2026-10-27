import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/core/config.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/features/tasks/task_work.dart';
import 'package:stackstep/shared/errors.dart';
import 'package:stackstep/shared/format.dart';
import 'package:stackstep/shared/motion.dart';
import 'package:stackstep/shared/state_views.dart';
import 'package:stackstep/ui/ui.dart';

final FutureProvider<Progress> progressProvider = FutureProvider.autoDispose<Progress>((ref) => ref.read(apiClientProvider).progress());

/// The one progress control in the student's app bar: share of tasks done. Points, the
/// certificate bar and the certificate are one tap away.
class ProgressPill extends ConsumerWidget {
  const ProgressPill({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pct = ref.watch(progressProvider).value?.completionPercent;
    return Semantics(
      label: 'Your progress and certificate',
      button: true,
      excludeSemantics: true,
      child: ShadButton.outline(
        key: const Key('open-progress'),
        size: ShadButtonSize.sm,
        decoration: const ShadDecoration(border: ShadBorder(radius: BorderRadius.all(Radius.circular(999)))),
        leading: const Icon(LucideIcons.award, size: 16),
        onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const ProgressScreen())),
        child: Text(pct == null ? 'Progress' : '$pct% done'),
      ),
    );
  }
}

/// Tasks finished, the certificate bar and, once issued, the certificate link.
class ProgressScreen extends ConsumerWidget {
  const ProgressScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = ref.watch(progressProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Your progress')),
      body: FadeSwitch(
        child: switch (p) {
          AsyncData(:final value) => RefreshIndicator(
            onRefresh: () => ref.refresh(progressProvider.future),
            child: ProgressDetails(progress: value),
          ),
          AsyncError(:final error) => ErrorState(message: messageFor(error), onRetry: () => ref.invalidate(progressProvider)),
          _ => const SkeletonList(rows: 3, height: 90),
        },
      ),
    );
  }
}

class ProgressDetails extends StatelessWidget {
  const ProgressDetails({required this.progress, super.key});
  final Progress progress;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final p = progress;
    return ListView(
      padding: const EdgeInsets.all(Space.lg),
      children: [
        Row(
          children: [
            Expanded(
              child: Text('Tasks finished', style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
            ),
            Text('${p.completionPercent}%', key: const Key('completion'), style: t.textTheme.h3),
          ],
        ),
        const SizedBox(height: Space.sm),
        Semantics(
          label: '${p.completionPercent}% of released tasks finished',
          excludeSemantics: true,
          child: ShadProgress(value: (p.completionPercent / 100).clamp(0, 1).toDouble()),
        ),
        const SizedBox(height: Space.sm),
        Text(
          '${p.done} of ${p.released} released tasks done. The certificate bar is ${p.barPercent}%.',
          style: t.textTheme.muted.copyWith(fontSize: 12),
        ),
        const SizedBox(height: Space.lg),
        ShadCard(
          key: const Key('this-week'),
          padding: const EdgeInsets.all(Space.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(
                header: true,
                child: Text('This week', style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
              ),
              const SizedBox(height: Space.xs),
              Text(p.thisWeek.line, style: t.textTheme.p),
              const SizedBox(height: Space.xs),
              Text(
                '${p.thisWeek.done} finished · ${p.thisWeek.onTime} on time · ${p.thisWeek.points} points · ${p.thisWeek.handIns} hand-ins',
                style: t.textTheme.muted.copyWith(fontSize: 12),
              ),
            ],
          ),
        ),
        const SizedBox(height: Space.lg),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: Space.sm,
          crossAxisSpacing: Space.sm,
          childAspectRatio: 2.4,
          children: [
            _Stat(label: 'In review', value: p.inReview),
            _Stat(label: 'Overdue', value: p.overdue, warn: p.overdue > 0),
            _Stat(label: 'Done on time', value: p.onTime),
            _Stat(label: 'Points', value: p.points),
          ],
        ),
        const SizedBox(height: Space.lg),
        _CertificateCard(progress: p),
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value, this.warn = false});
  final String label;
  final int value;
  final bool warn;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Space.md, vertical: Space.sm),
      decoration: BoxDecoration(color: t.colorScheme.muted, borderRadius: const BorderRadius.all(Radii.md)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(label, style: t.textTheme.muted.copyWith(fontSize: 12)),
          Text(
            '$value',
            style: t.textTheme.large.copyWith(
              color: warn ? t.colorScheme.destructive : null,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}

class _CertificateCard extends StatelessWidget {
  const _CertificateCard({required this.progress});
  final Progress progress;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final c = progress.certificate;
    return ShadCard(
      title: Row(
        children: [
          const Icon(LucideIcons.fileBadge, size: 18),
          const SizedBox(width: Space.sm),
          Text('Certificate', style: t.textTheme.large),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.only(top: Space.sm),
        child: c == null
            ? Text(
                progress.meetsBar
                    ? "You're past the bar. Keep going — your team lead reviews your work and issues the certificate."
                    : 'Finish at least ${progress.barPercent}% of your tasks. Your team lead reviews your work and issues the certificate by hand.',
                key: const Key('no-certificate'),
                style: t.textTheme.muted,
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(LucideIcons.badgeCheck, size: 16, color: Brand.success),
                      const SizedBox(width: Space.xs),
                      Expanded(child: Text('Issued ${dateTimeLabel(c.issuedAt)}', style: t.textTheme.small)),
                    ],
                  ),
                  const SizedBox(height: Space.xs),
                  SelectableText(
                    c.displayCode,
                    key: const Key('certificate-code'),
                    style: t.textTheme.large.copyWith(fontFamily: 'monospace'),
                  ),
                  const SizedBox(height: Space.xs),
                  Text(
                    'Share the verification link on your CV or LinkedIn. Anyone can check it without signing in.',
                    style: t.textTheme.muted.copyWith(fontSize: 12),
                  ),
                  const SizedBox(height: Space.md),
                  Wrap(
                    spacing: Space.sm,
                    runSpacing: Space.sm,
                    children: [
                      ShadButton(
                        key: const Key('open-certificate'),
                        leading: const Icon(LucideIcons.externalLink, size: 16),
                        onPressed: () => openLink(context, AppConfig.verifyUrl(c.code)),
                        child: const Text('Open verification page'),
                      ),
                      ShadButton.outline(
                        leading: const Icon(LucideIcons.copy, size: 16),
                        onPressed: () async {
                          await Clipboard.setData(ClipboardData(text: AppConfig.verifyUrl(c.code)));
                          if (context.mounted) showToast(context, 'Link copied');
                        },
                        child: const Text('Copy link'),
                      ),
                    ],
                  ),
                ],
              ),
      ),
    );
  }
}
