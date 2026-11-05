"use client";

import { Check, Copy, ExternalLink, Info, Lightbulb, OctagonAlert, TriangleAlert } from "lucide-react";
import { Children, isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * The reading experience for long Markdown: mail, task readings and lessons. Raw HTML is
 * skipped and images are never loaded. Links open in a new tab, and only http(s) links are
 * live. GitHub-style callouts (`> [!TIP]`, `[!NOTE]`, `[!IMPORTANT]`, `[!WARNING]`,
 * `[!CAUTION]`) become coloured boxes.
 */

type Node = { type: string; value?: string; children?: Node[]; data?: { hProperties?: Record<string, string> } };

export const CALLOUTS = {
  note: { label: "Note", icon: Info, tone: "border-sky-500/40 bg-sky-500/8 [&_[data-callout-title]]:text-sky-700 dark:[&_[data-callout-title]]:text-sky-300" },
  tip: { label: "Tip", icon: Lightbulb, tone: "border-emerald-500/40 bg-emerald-500/8 [&_[data-callout-title]]:text-emerald-700 dark:[&_[data-callout-title]]:text-emerald-300" },
  important: { label: "Important", icon: Info, tone: "border-violet-500/40 bg-violet-500/8 [&_[data-callout-title]]:text-violet-700 dark:[&_[data-callout-title]]:text-violet-300" },
  warning: { label: "Watch out", icon: TriangleAlert, tone: "border-amber-500/50 bg-amber-500/10 [&_[data-callout-title]]:text-amber-800 dark:[&_[data-callout-title]]:text-amber-300" },
  caution: { label: "Careful", icon: OctagonAlert, tone: "border-rose-500/40 bg-rose-500/8 [&_[data-callout-title]]:text-rose-700 dark:[&_[data-callout-title]]:text-rose-300" },
} as const;
type CalloutKind = keyof typeof CALLOUTS;
const isCallout = (k: string): k is CalloutKind => k in CALLOUTS;

/** Marks `> [!TIP]` blockquotes (remark plugin) and strips the marker. */
export function remarkCallouts() {
  const walk = (n: Node) => {
    if (n.type === "blockquote") {
      const p = n.children?.[0];
      const t = p?.type === "paragraph" ? p.children?.[0] : undefined;
      const m = t?.type === "text" && t.value ? /^\[!(\w+)\][ \t]*\n?/.exec(t.value) : null;
      const kind = m?.[1]?.toLowerCase();
      if (m && t && kind && isCallout(kind)) {
        t.value = (t.value ?? "").slice(m[0].length);
        n.data = { ...n.data, hProperties: { ...n.data?.hProperties, "data-callout": kind } };
      }
    }
    n.children?.forEach(walk);
  };
  return (tree: Node) => walk(tree);
}

const safeHref = (href?: string) => (href && /^https?:\/\//i.test(href) ? href : undefined);

/** Turns heading text into an id, for the outline. */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const child = Children.toArray(children)[0];
  const className = isValidElement<{ className?: string }>(child) ? (child.props.className ?? "") : "";
  const lang = /language-(\w+)/.exec(className)?.[1];
  const code = textOf(children).replace(/\n$/, "");
  return (
    <div className="group/code bg-muted/60 relative my-5 overflow-hidden rounded-xl border">
      <div className="text-muted-foreground flex h-9 items-center justify-between border-b px-3 text-xs">
        <span className="font-mono">{lang ?? "code"}</span>
        <button
          type="button"
          className="hover:text-foreground focus-visible:ring-ring/60 inline-flex items-center gap-1 rounded px-1.5 py-0.5 outline-none focus-visible:ring-2"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-w-full overflow-x-auto p-4 font-mono text-[0.84rem] leading-relaxed" tabIndex={0}>
        {children}
      </pre>
    </div>
  );
}

function heading(level: 2 | 3 | 4) {
  const Tag = `h${level}` as const;
  const style = {
    2: "mt-10 mb-4 scroll-mt-20 text-2xl font-semibold tracking-tight first:mt-0 [&>span]:bg-gradient-to-r [&>span]:from-primary [&>span]:to-fuchsia-500 [&>span]:bg-clip-text [&>span]:text-transparent",
    3: "mt-8 mb-3 scroll-mt-20 text-xl font-semibold tracking-tight first:mt-0",
    4: "mt-6 mb-2 scroll-mt-20 text-lg font-semibold first:mt-0",
  }[level];
  const H = ({ children }: { children?: ReactNode }) => (
    <Tag id={slug(textOf(children))} className={style}>
      {level === 2 ? <span>{children}</span> : children}
    </Tag>
  );
  H.displayName = `ProseH${level}`;
  return H;
}

const components: Components = {
  h1: heading(2),
  h2: heading(2),
  h3: heading(3),
  h4: heading(4),
  h5: heading(4),
  h6: heading(4),
  p: ({ children }) => <p className="my-4 leading-[1.8] first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children, className }) => (
    <ul className={cn("marker:text-primary my-4 list-disc space-y-2 pl-6 [&.contains-task-list]:list-none [&.contains-task-list]:pl-1", className)}>{children}</ul>
  ),
  ol: ({ children, start }) => (
    <ol start={start} className="marker:text-primary my-4 list-decimal space-y-2 pl-6 marker:font-semibold">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1 leading-[1.75] [&>input]:accent-primary [&>input]:mr-2 [&>input]:translate-y-px">{children}</li>,
  a: ({ children, href }) => {
    const to = safeHref(href);
    if (!to) return <span className="underline decoration-dotted underline-offset-4">{children}</span>;
    return (
      <a href={to} target="_blank" rel="noopener noreferrer" className="text-primary decoration-primary/40 hover:decoration-primary inline-flex items-baseline gap-0.5 font-medium underline underline-offset-4">
        {children}
        <ExternalLink className="size-3 translate-y-px" aria-hidden />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  },
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  code: ({ children, className }) => (
    <code className={className ?? "bg-primary/8 text-primary rounded-md px-1.5 py-0.5 font-mono text-[0.86em] dark:text-violet-300"}>{children}</code>
  ),
  blockquote: (props) => {
    const kind = (props as { "data-callout"?: string })["data-callout"];
    if (kind && isCallout(kind)) {
      const c = CALLOUTS[kind];
      const Icon = c.icon;
      return (
        <aside className={cn("my-5 rounded-xl border-l-4 px-4 py-3 [&>p]:my-1.5", c.tone)} role="note" aria-label={c.label} data-callout={kind}>
          <p data-callout-title className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="size-4" aria-hidden /> {c.label}
          </p>
          {props.children}
        </aside>
      );
    }
    return <blockquote className="border-primary/50 bg-primary/4 text-foreground/80 my-5 rounded-r-lg border-l-4 py-1 pr-3 pl-4 italic">{props.children}</blockquote>;
  },
  table: ({ children }) => (
    <div className="my-5 max-w-full overflow-x-auto rounded-xl border" tabIndex={0} role="region" aria-label="Scrollable table">
      <table className="w-full border-collapse text-sm [&_tbody_tr:nth-child(even)]:bg-muted/40">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="bg-muted border-b px-3 py-2 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b px-3 py-2 align-top">{children}</td>,
  img: () => null,
  hr: () => <hr className="via-border my-8 h-px border-0 bg-gradient-to-r from-transparent to-transparent" />,
  strong: ({ children }) => <strong className="text-foreground font-semibold">{children}</strong>,
};

export function Prose({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("text-foreground/90 min-w-0 text-[0.98rem] break-words", className)} data-testid="prose">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkCallouts]} components={components} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** Headings (## and ###) for an outline beside long text. */
export function outline(markdown: string): { id: string; text: string; depth: 2 | 3 }[] {
  const out: { id: string; text: string; depth: 2 | 3 }[] = [];
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const m = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m?.[1] || !m[2]) continue;
    const text = m[2].replace(/[*_`[\]]/g, "");
    out.push({ id: slug(text), text, depth: m[1].length <= 2 ? 2 : 3 });
  }
  return out;
}

/** About 220 words a minute, at least one. */
export function readingMinutes(markdown: string): number {
  return Math.max(1, Math.round(markdown.split(/\s+/).filter(Boolean).length / 220));
}
