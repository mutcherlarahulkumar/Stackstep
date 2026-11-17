import 'dart:async';

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
import 'package:stackstep/shared/state_views.dart';
import 'package:stackstep/ui/ui.dart';

/// A student's public portfolio settings (feature 28). The page itself lives on the web.
final FutureProvider<PortfolioSettings> portfolioProvider = FutureProvider.autoDispose<PortfolioSettings>(
  (ref) => ref.read(apiClientProvider).portfolio(),
);

const headlineMax = 120;

String portfolioUrl(String login) => AppConfig.webUrl('/p/${Uri.encodeComponent(login)}');

class PortfolioScreen extends ConsumerWidget {
  const PortfolioScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final q = ref.watch(portfolioProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Your portfolio')),
      body: switch (q) {
        AsyncData(:final value) => _Form(key: ValueKey('${value.public}-${value.headline}'), initial: value),
        AsyncError(:final error) => ErrorState(message: messageFor(error), onRetry: () => ref.invalidate(portfolioProvider)),
        _ => const SkeletonList(rows: 2, height: 90),
      },
    );
  }
}

class _Form extends ConsumerStatefulWidget {
  const _Form({required this.initial, super.key});
  final PortfolioSettings initial;

  @override
  ConsumerState<_Form> createState() => _FormState();
}

class _FormState extends ConsumerState<_Form> {
  late bool _public = widget.initial.public;
  late final _headline = TextEditingController(text: widget.initial.headline);
  String? _error;
  var _busy = false;

  @override
  void dispose() {
    _headline.dispose();
    super.dispose();
  }

  String get _clean => _headline.text.trim().replaceAll(RegExp(r'\s+'), ' ');

  Future<void> _save() async {
    if (_clean.runes.length > headlineMax) {
      setState(() => _error = 'The headline can be at most $headlineMax characters.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final next = await ref.read(apiClientProvider).savePortfolio(public: _public, headline: _clean);
      if (!mounted) return;
      showToast(context, next.public ? 'Your portfolio is public.' : 'Your portfolio is private.');
      ref.invalidate(portfolioProvider);
    } on Exception catch (e) {
      if (mounted) setState(() => _error = messageFor(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    final url = portfolioUrl(widget.initial.login);
    return ListView(
      padding: const EdgeInsets.all(Space.lg),
      children: [
        Text(
          'A public page recruiters can open without signing in. It is built from your finished work, so it stays up to date by itself.',
          style: t.textTheme.muted,
        ),
        const SizedBox(height: Space.lg),
        ShadCard(
          padding: const EdgeInsets.all(Space.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ShadSwitch(
                key: const Key('portfolio-public'),
                value: _public,
                onChanged: (v) => setState(() => _public = v),
                label: const Text('Public portfolio'),
                sublabel: Text(_public ? 'Anyone with the link can see it.' : 'Only you know it exists.'),
              ),
              const SizedBox(height: Space.lg),
              Text('Headline', style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
              const SizedBox(height: Space.xs),
              ShadInput(
                key: const Key('portfolio-headline'),
                controller: _headline,
                placeholder: const Text('Frontend intern building accessible React apps'),
                onChanged: (_) => setState(() => _error = null),
              ),
              const SizedBox(height: Space.xs),
              Text(
                _error ?? 'One line under your name · ${_clean.runes.length}/$headlineMax',
                style: _error == null
                    ? t.textTheme.muted.copyWith(fontSize: 12)
                    : t.textTheme.small.copyWith(color: t.colorScheme.destructive),
              ),
              const SizedBox(height: Space.md),
              ShadButton(key: const Key('portfolio-save'), enabled: !_busy, onPressed: _save, child: const Text('Save')),
            ],
          ),
        ),
        if (widget.initial.public) ...[
          const SizedBox(height: Space.lg),
          ShadCard(
            padding: const EdgeInsets.all(Space.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Your public link', style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: Space.xs),
                SelectableText(
                  url,
                  key: const Key('portfolio-url'),
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 13),
                ),
                const SizedBox(height: Space.md),
                Row(
                  children: [
                    Expanded(
                      child: ShadButton.outline(
                        leading: const Icon(LucideIcons.copy, size: 16),
                        onPressed: () {
                          unawaited(Clipboard.setData(ClipboardData(text: url)));
                          showToast(context, 'Link copied');
                        },
                        child: const Text('Copy link'),
                      ),
                    ),
                    const SizedBox(width: Space.sm),
                    Expanded(
                      child: ShadButton.outline(
                        leading: const Icon(LucideIcons.externalLink, size: 16),
                        onPressed: () => openLink(context, url),
                        child: const Text('Open it'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: Space.lg),
        Text('What it shows', style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: Space.xs),
        Text(
          'Your name, GitHub username, headline, internship, finished tasks with their hand-in links, badges, certificates and the review lab pull requests you passed. Never your chats, notes, reviews, scores or email.',
          style: t.textTheme.muted,
        ),
      ],
    );
  }
}
