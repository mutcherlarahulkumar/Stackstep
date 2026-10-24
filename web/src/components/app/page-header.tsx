import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Standard page width and padding for admin pages. */
export const PAGE = "mx-auto flex w-full max-w-6xl flex-col p-4 sm:p-6";

/** Title, one-line description and page actions; wraps under the title on narrow screens. */
export function PageHeader({ title, description, children, className }: { title: string; description: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-3", className)}>
      <div className="min-w-0 max-w-2xl">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-0.5 text-sm text-pretty">{description}</p>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}
