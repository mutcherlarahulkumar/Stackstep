import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:markdown/markdown.dart' as md;
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/validation.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/features/tasks/task_work.dart';

/// A line that is only bold text ("**Hints**") is a section heading in the helper's answers.
String sectionHeadings(String source) =>
    source.replaceAllMapped(RegExp(r'^\*\*([^*\n]{1,60})\*\*\s*$', multiLine: true), (m) => '#### ${m[1]}');

/// Native Markdown shared by answers, task briefs, notes and authored readings.
/// Raw HTML and images are never rendered. Readings can disable outgoing links.
class MarkdownView extends StatefulWidget {
  const MarkdownView(this.source, {this.allowLinks = true, super.key});
  final String source;
  final bool allowLinks;

  @override
  State<MarkdownView> createState() => _MarkdownViewState();
}

class _MarkdownViewState extends State<MarkdownView> {
  final _recognizers = <TapGestureRecognizer>[];

  void _disposeLinks() {
    for (final recognizer in _recognizers) {
      recognizer.dispose();
    }
    _recognizers.clear();
  }

  @override
  void dispose() {
    _disposeLinks();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    _disposeLinks();
    final doc = md.Document(extensionSet: md.ExtensionSet.gitHubFlavored, encodeHtml: false);
    final nodes = doc.parseLines(sectionHeadings(widget.source).split('\n'));
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [for (final n in nodes) ..._block(context, n, 0)]);
  }

  List<Widget> _block(BuildContext context, md.Node node, int depth) {
    final t = ShadTheme.of(context);
    final base = t.textTheme.p.copyWith(height: 1.5);
    if (node is md.Text) return [Text(node.text, style: base)];
    if (node is! md.Element) return const [];
    switch (node.tag) {
      case 'h1' || 'h2' || 'h3' || 'h4' || 'h5' || 'h6':
        final headingStyle = switch (node.tag) {
          'h1' => t.textTheme.h3,
          'h2' => t.textTheme.h4,
          _ => base.copyWith(fontWeight: FontWeight.w700),
        };
        return [
          Padding(
            padding: const EdgeInsets.only(top: Space.md, bottom: Space.xs),
            child: Semantics(header: true, child: Text.rich(_inline(context, node.children ?? const [], headingStyle))),
          ),
        ];
      case 'p':
        return [
          Padding(padding: const EdgeInsets.symmetric(vertical: 3), child: Text.rich(_inline(context, node.children ?? const [], base))),
        ];
      case 'ul' || 'ol':
        final ordered = node.tag == 'ol';
        final start = int.tryParse(node.attributes['start'] ?? '') ?? 1;
        final items = (node.children ?? const []).whereType<md.Element>().toList();
        return [
          for (final (i, li) in items.indexed)
            Padding(
              padding: EdgeInsets.only(left: Space.sm + depth * Space.lg, top: 2, bottom: 2),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(width: 26, child: _listMarker(li, ordered ? '${i + start}.' : '•', base)),
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
      case 'table':
        return [_table(context, node, base)];
      case 'script' || 'style' || 'iframe' || 'img':
        return const [];
      default:
        return [Text.rich(_inline(context, node.children ?? const [], base))];
    }
  }

  Widget _listMarker(md.Element li, String marker, TextStyle base) {
    final children = li.children ?? const <md.Node>[];
    final inputs = <md.Element>[
      for (final child in children.whereType<md.Element>())
        if (child.tag == 'input') child
        else if (child.tag == 'p')
          ...?(child.children?.whereType<md.Element>().where((element) => element.tag == 'input')),
    ];
    if (inputs.isEmpty) return Text(marker, style: base);
    final checked = inputs.first.attributes.containsKey('checked');
    return Semantics(
      checked: checked,
      child: Icon(checked ? Icons.check_box_outlined : Icons.check_box_outline_blank, size: 18),
    );
  }

  Widget _table(BuildContext context, md.Element table, TextStyle base) {
    final color = ShadTheme.of(context).colorScheme;
    final rows = <md.Element>[
      for (final section in (table.children ?? const <md.Node>[]).whereType<md.Element>())
        if (section.tag == 'tr') section
        else ...?(section.children?.whereType<md.Element>().where((row) => row.tag == 'tr')),
    ];
    if (rows.isEmpty) return const SizedBox.shrink();
    final cells = [for (final row in rows) (row.children ?? const <md.Node>[]).whereType<md.Element>().toList()];
    final columnCount = cells.fold<int>(0, (count, row) => row.length > count ? row.length : count);
    if (columnCount == 0) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Space.sm),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Table(
          defaultColumnWidth: const IntrinsicColumnWidth(),
          defaultVerticalAlignment: TableCellVerticalAlignment.top,
          border: TableBorder.all(color: color.border),
          children: [
            for (final row in cells)
              TableRow(
                decoration: row.any((cell) => cell.tag == 'th') ? BoxDecoration(color: color.muted) : null,
                children: [
                  for (var i = 0; i < columnCount; i++)
                    ConstrainedBox(
                      constraints: const BoxConstraints(minWidth: 100, maxWidth: 240),
                      child: Padding(
                        padding: const EdgeInsets.all(Space.sm),
                        child: i >= row.length
                            ? const SizedBox.shrink()
                            : Semantics(
                                header: row[i].tag == 'th',
                                child: Text.rich(
                                  _inline(
                                    context,
                                    row[i].children ?? const [],
                                    row[i].tag == 'th' ? base.copyWith(fontWeight: FontWeight.w600) : base,
                                  ),
                                  textAlign: switch (row[i].attributes['align']) {
                                    'center' => TextAlign.center,
                                    'right' => TextAlign.right,
                                    _ => TextAlign.left,
                                  },
                                ),
                              ),
                      ),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
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
              'a' => _link(context, n, style),
              'br' => const TextSpan(text: '\n'),
              'img' || 'input' || 'script' || 'style' || 'iframe' => const TextSpan(),
              _ => _inline(context, n.children ?? const [], style),
            },
      ],
    );
  }

  TextSpan _link(BuildContext context, md.Element element, TextStyle style) {
    final url = element.attributes['href'] ?? '';
    if (!widget.allowLinks || !validUrl(url)) return TextSpan(text: element.textContent, style: style);
    final recognizer = TapGestureRecognizer()..onTap = () => openLink(context, url);
    _recognizers.add(recognizer);
    return TextSpan(
      text: element.textContent,
      style: style.copyWith(color: ShadTheme.of(context).colorScheme.primary, decoration: TextDecoration.underline),
      recognizer: recognizer,
    );
  }
}
