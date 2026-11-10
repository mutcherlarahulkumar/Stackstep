import 'package:flutter/material.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/features/ai/markdown_view.dart';

/// Opens stored reading in the app, preserving the task underneath it.
Future<void> openTaskDocument(BuildContext context, TaskDocument document) =>
    Navigator.of(context).push<void>(MaterialPageRoute<void>(builder: (_) => TaskDocumentScreen(document: document)));

class TaskDocuments extends StatelessWidget {
  const TaskDocuments({required this.documents, super.key});
  final List<TaskDocument> documents;

  @override
  Widget build(BuildContext context) {
    if (documents.isEmpty) return const SizedBox.shrink();
    final t = ShadTheme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: Space.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Reading', style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: Space.sm),
          for (final (index, document) in documents.indexed)
            Padding(
              padding: const EdgeInsets.only(bottom: Space.sm),
              child: ShadCard(
                padding: EdgeInsets.zero,
                // ListTile paints its ink on the nearest Material; the card's own background would hide it.
                child: Material(
                  type: MaterialType.transparency,
                  child: ListTile(
                    key: Key('task-document-$index'),
                    leading: Icon(LucideIcons.bookOpen, color: t.colorScheme.primary),
                    title: Text(document.title, style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
                    subtitle: Text('Read guide', style: t.textTheme.muted),
                    trailing: const Icon(LucideIcons.chevronRight, size: 18),
                    contentPadding: const EdgeInsets.symmetric(horizontal: Space.md, vertical: Space.xs),
                    onTap: () => openTaskDocument(context, document),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// A native, selectable reader. It does not fetch URLs or launch a browser.
class TaskDocumentScreen extends StatelessWidget {
  const TaskDocumentScreen({required this.document, super.key});
  final TaskDocument document;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    return Scaffold(
      key: const Key('task-document-reader'),
      appBar: AppBar(title: Text(document.title, maxLines: 1, overflow: TextOverflow.ellipsis)),
      body: SafeArea(
        child: SelectionArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(Space.xl),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 760),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(document.title, style: t.textTheme.h2),
                    const SizedBox(height: Space.md),
                    MarkdownView(document.body, allowLinks: false),
                    const SizedBox(height: Space.xl),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
