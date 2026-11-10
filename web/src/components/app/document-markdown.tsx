"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/** Local Markdown only: no raw HTML, embedded media or executable URL schemes. */
const components: Components = {
  h1: ({ children }) => <h2 className="mt-8 mb-3 text-2xl font-semibold tracking-tight first:mt-0">{children}</h2>,
  h2: ({ children }) => <h3 className="mt-7 mb-2 text-xl font-semibold tracking-tight first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-6 mb-2 text-lg font-semibold first:mt-0">{children}</h4>,
  h4: ({ children }) => <h5 className="mt-5 mb-2 font-semibold first:mt-0">{children}</h5>,
  h5: ({ children }) => <h6 className="mt-5 mb-2 font-semibold first:mt-0">{children}</h6>,
  h6: ({ children }) => <h6 className="mt-5 mb-2 font-semibold first:mt-0">{children}</h6>,
  p: ({ children }) => <p className="my-3 leading-7 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children, className }) => <ul className={`my-3 list-disc space-y-2 pl-6 [&.contains-task-list]:list-none [&.contains-task-list]:pl-1 ${className ?? ""}`}>{children}</ul>,
  ol: ({ children, start }) => <ol start={start} className="my-3 list-decimal space-y-2 pl-6">{children}</ol>,
  li: ({ children }) => <li className="pl-1 [&>input]:mr-2">{children}</li>,
  // Documents are self-contained lessons. References remain readable without navigating
  // away; authors can put optional external destinations in the task's separate Links.
  a: ({ children }) => <span>{children}</span>,
  pre: ({ children }) => <pre className="bg-muted my-4 max-w-full overflow-x-auto rounded-lg border p-4 font-mono text-[0.82rem] leading-relaxed" tabIndex={0}>{children}</pre>,
  code: ({ children, className }) => <code className={className ?? "bg-muted rounded px-1 py-0.5 font-mono text-[0.88em]"}>{children}</code>,
  blockquote: ({ children }) => <blockquote className="border-primary/40 text-muted-foreground my-4 border-l-3 pl-4">{children}</blockquote>,
  table: ({ children }) => <div className="my-4 max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable table"><table className="w-full border-collapse text-sm">{children}</table></div>,
  th: ({ children }) => <th className="bg-muted border px-3 py-2 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border px-3 py-2 align-top">{children}</td>,
  img: () => null,
  hr: () => <hr className="my-6" />,
};

export function DocumentMarkdown({ children }: { children: string }) {
  return <div className="min-w-0 text-sm break-words"><ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>{children}</ReactMarkdown></div>;
}
