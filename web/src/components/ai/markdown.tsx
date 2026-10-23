"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * Renders the AI helper's Markdown. Raw HTML is never rendered (react-markdown escapes it),
 * images are dropped, unsafe link schemes are stripped by the default URL transform, and
 * links open in a new tab without leaking the page.
 */
const components: Components = {
  h1: ({ children }) => <p className="mt-3 mb-1 font-semibold first:mt-0">{children}</p>,
  h2: ({ children }) => <p className="mt-3 mb-1 font-semibold first:mt-0">{children}</p>,
  h3: ({ children }) => <p className="mt-3 mb-1 font-semibold first:mt-0">{children}</p>,
  h4: ({ children }) => <p className="mt-3 mb-0.5 font-semibold first:mt-0">{children}</p>,
  p: ({ children }) => <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-1 pl-5">{children}</ol>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline underline-offset-4">
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const block = /language-/.test(className ?? "") || String(children).includes("\n");
    return block ? (
      <code className={cn("block", className)}>{children}</code>
    ) : (
      <code className="bg-background/80 rounded px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
    );
  },
  pre: ({ children }) => <pre className="bg-background/80 my-2 overflow-x-auto rounded-md border p-3 font-mono text-[0.82rem] leading-relaxed">{children}</pre>,
  img: () => null,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border px-2 py-1 text-left font-medium">{children}</th>,
  td: ({ children }) => <td className="border px-2 py-1">{children}</td>,
};

/** A line that is only bold text ("**Hints**") is a section heading in the helper's answers. */
export function sectionHeadings(md: string): string {
  return md.replace(/^\*\*([^*\n]{1,60})\*\*\s*$/gm, "#### $1");
}

export function SafeMarkdown({ children }: { children: string }) {
  return (
    <div className="text-[0.94rem] break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {sectionHeadings(children)}
      </ReactMarkdown>
    </div>
  );
}
