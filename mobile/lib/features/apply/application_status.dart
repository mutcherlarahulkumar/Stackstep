import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/core/config.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/features/tasks/task_work.dart';
import 'package:stackstep/shared/errors.dart';
import 'package:stackstep/shared/state_views.dart';

/// Where the signed-in student's application stands. Re-read on pull and on "Check again".
final FutureProvider<ApplicationSummary> myApplicationProvider = FutureProvider.autoDispose<ApplicationSummary>(
  (ref) => ref.watch(apiClientProvider).myApplication(),
);

/// "₹4,999" / "₹1,50,000".
String inr(int n) {
  final d = n.abs().toString();
  if (d.length <= 3) return '${n < 0 ? '-' : ''}₹$d';
  var head = d.substring(0, d.length - 3);
  final parts = <String>[];
  while (head.length > 2) {
    parts.insert(0, head.substring(head.length - 2));
    head = head.substring(0, head.length - 2);
  }
  parts.insert(0, head);
  return '${n < 0 ? '-' : ''}₹${parts.join(',')},${d.substring(d.length - 3)}';
}

/// The student-facing headline for a flag, matching the web.
String flagHeadline(ApplicationSummary a) => switch (a.flag) {
  null => 'We need something from you',
  ApplicationFlag.partialPayment => 'We received ${inr(a.paidInr)} of ${inr(a.feeInr)}. Pay the remaining ${inr(a.dueInr)}.',
  ApplicationFlag.cohortMismatch => "Your payment doesn't match this cohort's fee",
  ApplicationFlag.cohortFull => 'This cohort filled up',
  ApplicationFlag.unclearProof => "We couldn't read your screenshot",
  ApplicationFlag.paymentNotFound => "We couldn't find this payment",
  ApplicationFlag.duplicateProof => 'That screenshot was already used',
  ApplicationFlag.detailsIncorrect => 'Some details need fixing',
  ApplicationFlag.other => "There's an issue with your application",
};

/// Students without an internship: the application's status, with applying and paying on the web.
class ApplicationStatusBody extends ConsumerWidget {
  const ApplicationStatusBody({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final app = ref.watch(myApplicationProvider);
    Future<void> refresh() async {
      ref.invalidate(myApplicationProvider);
      await ref.read(sessionProvider.notifier).refreshMe();
    }

    void openWeb() => openLink(context, AppConfig.webUrl('/workspace'));
    final web = ShadButton(
      key: const Key('apply-on-web'),
      leading: const Icon(LucideIcons.externalLink, size: 16),
      onPressed: openWeb,
      child: const Text('Continue on the web'),
    );
    final again = ShadButton.outline(
      key: const Key('apply-check-again'),
      leading: const Icon(LucideIcons.refreshCw, size: 16),
      onPressed: refresh,
      child: const Text('Check again'),
    );
    final actions = Wrap(spacing: Space.sm, runSpacing: Space.sm, alignment: WrapAlignment.center, children: [web, again]);

    return switch (app) {
      AsyncData(:final value) => RefreshIndicator(
        onRefresh: refresh,
        child: LayoutBuilder(
          builder: (context, c) => SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: c.maxHeight),
              child: _content(value, actions, again),
            ),
          ),
        ),
      ),
      AsyncError(:final error) => ErrorState(message: messageFor(error), onRetry: refresh),
      _ => const SkeletonList(rows: 2, height: 120),
    };
  }

  Widget _content(ApplicationSummary a, Widget actions, Widget again) => switch (a.status) {
    null when a.openCohorts == 0 => EmptyState(
      icon: LucideIcons.doorClosed,
      title: 'Admissions are closed right now',
      body: 'No cohort is taking applications at the moment. Check back soon. If your college enrolled you, ask your placement cell to check the email on your GitHub account.',
      action: again,
    ),
    null || ApplicationStatus.rejected => EmptyState(
      icon: LucideIcons.rocket,
      title: a.status == ApplicationStatus.rejected ? 'Your application was closed' : 'Join an internship cohort',
      body: a.status == ApplicationStatus.rejected
          ? '${a.flagNote.isEmpty ? 'The reason is in your application chat.' : a.flagNote}\n\nFees are non-refundable under any circumstances. You can start a new application on the web.'
          : 'Fill in your details, pay by UPI and upload the screenshot on the web. Your seat is confirmed within a day, and your internship then opens here.',
      action: actions,
    ),
    ApplicationStatus.draft => EmptyState(
      icon: LucideIcons.qrCode,
      title: 'Finish your payment',
      body:
          'Your details are saved for ${a.cohortName ?? 'your cohort'}. Pay ${inr(a.dueInr)} by UPI and upload the screenshot on the web.',
      action: actions,
    ),
    ApplicationStatus.submitted => EmptyState(
      icon: LucideIcons.hourglass,
      title: 'Payment received, awaiting confirmation',
      body:
          "We're matching your payment for ${a.cohortName ?? 'your cohort'}. This usually takes less than a day. Pull down to check again.",
      action: actions,
    ),
    ApplicationStatus.flagged => EmptyState(
      icon: LucideIcons.circleAlert,
      title: flagHeadline(a),
      body:
          '${a.flagNote.isEmpty ? '' : '${a.flagNote}\n\n'}Fix it on the web: you can pay, switch cohort or update your details there, and chat with the admissions team.',
      action: actions,
    ),
    ApplicationStatus.approved => EmptyState(
      icon: LucideIcons.partyPopper,
      title: 'Payment confirmed. Welcome aboard!',
      body: "You're enrolled in ${a.cohortName ?? 'your cohort'}. Tap Check again to open your internship.",
      action: again,
    ),
  };
}
