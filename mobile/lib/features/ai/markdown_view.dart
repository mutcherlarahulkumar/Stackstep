import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:markdown/markdown.dart' as md;
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/features/tasks/task_work.dart';

/// A line that is only bold text ("**Hints**") is a section heading in the helper's answers.
String sectionHeadings(String source) =>
    source.replaceAllMapped(RegExp(r'^\*\*([^*\n]{1,60})\*\*\s*$', multiLine: true), (m) => '#### ${m[1]}');

/// Renders the AI helper's Markdown with native widgets: headings, paragraphs, lists, code,
/// bold, italics and links. Raw HTML and images are never rendered.
class MarkdownView extends StatelessWidget {
  const MarkdownView(this.source, {super.key});
  final String source;

  @override
  Widget build(BuildContext context) {
    final doc = md.Document(extensionSet: md.ExtensionSet.gitHubFlavored, encodeHtml: false);
    final nodes = doc.parseLines(sectionHeadings(source).split('\n'));
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [for (final n in nodes) ..._block(context, n, 0)]);
  }

  List<Widget> _block(BuildContext context, md.Node node, int depth) {
    final t = ShadTheme.of(context);
    final base = t.textTheme.p.copyWith(height: 1.5);
    if (node is md.Text) return [Text(node.text, style: base)];
    if (node is! md.Element) return const [];
    switch (node.tag) {
      case 'h1' || 'h2' || 'h3' || 'h4' || 'h5' || 'h6':
        return [
          Padding(
            padding: const EdgeInsets.only(top: Space.sm, bottom: 2),
            child: Text.rich(_inline(context, node.children ?? const [], base.copyWith(fontWeight: FontWeight.w700))),
          ),
        ];
      case 'p':
        return [
          Padding(padding: const EdgeInsets.symmetric(vertical: 3), child: Text.rich(_inline(context, node.children ?? const [], base))),
        ];
      case 'ul' || 'ol':
        final ordered = node.tag == 'ol';
        final items = (node.children ?? const []).whereType<md.Element>().toList();
        return [
          for (final (i, li) in items.indexed)
            Padding(
              padding: EdgeInsets.only(left: Space.sm + depth * Space.lg, top: 2, bottom: 2),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(width: 22, child: Text(ordered ? '${i + 1}.' : '•', style: base)),
                  Expanded(child: _listItem(context, li, depth, base)),
                ],
              ),
            ),
        ];
      case 'pre':
        final code = node.textContent.trimRight();
        return [
          Container(
            margin: const EdgeInsets.symmetric(vertical: Space.xs),
            padding: const EdgeInsets.all(Space.md),
            decoration: BoxDecoration(
              color: t.colorScheme.background,
              border: Border.all(color: t.colorScheme.border),
              borderRadius: const BorderRadius.all(Radii.md),
            ),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Text(code, style: const TextStyle(fontFamily: 'monospace', fontSize: 13, height: 1.45)),
            ),
          ),
        ];
      case 'blockquote':
        return [
          Container(
            padding: const EdgeInsets.only(left: Space.md),
            decoration: BoxDecoration(
              border: Border(left: BorderSide(color: t.colorScheme.border, width: 3)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [for (final c in node.children ?? const <md.Node>[]) ..._block(context, c, depth)],
            ),
          ),
        ];
      case 'hr':
        return const [Divider()];
      default:
        return [Text.rich(_inline(context, node.children ?? const [], base))];
    }
  }

  Widget _listItem(BuildContext context, md.Element li, int depth, TextStyle base) {
    final children = li.children ?? const <md.Node>[];
    final inline = children.where((c) => c is md.Text || c is md.Element && !const {'ul', 'ol', 'p', 'pre'}.contains(c.tag)).toList();
    final blocks = children.where((c) => c is md.Element && const {'ul', 'ol', 'p', 'pre'}.contains(c.tag)).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (inline.isNotEmpty) Text.rich(_inline(context, inline, base)),
        for (final b in blocks) ..._block(context, b, depth + 1),
      ],
    );
  }

  TextSpan _inline(BuildContext context, List<md.Node> nodes, TextStyle style) {
    final t = ShadTheme.of(context);
    return TextSpan(
      style: style,
      children: [
        for (final n in nodes)
          if (n is md.Text)
            TextSpan(text: n.text)
          else if (n is md.Element)
            switch (n.tag) {
              'strong' => _inline(context, n.children ?? const [], style.copyWith(fontWeight: FontWeight.w700)),
              'em' => _inline(context, n.children ?? const [], style.copyWith(fontStyle: FontStyle.italic)),
              'del' => _inline(context, n.children ?? const [], style.copyWith(decoration: TextDecoration.lineThrough)),
              'code' => TextSpan(
                text: n.textContent,
                style: style.copyWith(
                  fontFamily: 'monospace',
                  fontSize: (style.fontSize ?? 14) * 0.9,
                  backgroundColor: t.colorScheme.background,
                ),
              ),
              'a' => TextSpan(
                text: n.textContent,
                style: style.copyWith(color: t.colorScheme.primary, decoration: TextDecoration.underline),
                recognizer: TapGestureRecognizer()..onTap = () => openLink(context, n.attributes['href'] ?? ''),
              ),
              'br' => const TextSpan(text: '\n'),
              'img' => const TextSpan(),
              _ => _inline(context, n.children ?? const [], style),
            },
      ],
    );
  }
}
