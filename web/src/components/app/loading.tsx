"use client";

import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { quipAt } from "@/lib/quips";
import { cn } from "@/lib/utils";

const ROTATE_MS = 3200;

/** A rotating industry one-liner. Decorative: screen readers hear the surrounding "Loading". */
export function Quip({ className, seed = 0 }: { className?: string; seed?: number }) {
  const [i, setI] = useState(seed);
  useEffect(() => {
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const t = window.setInterval(() => setI((n) => n + 1), ROTATE_MS);
    return () => window.clearInterval(t);
  }, []);
  return (
    <p className={cn("text-muted-foreground h-5 text-center text-sm", className)} aria-hidden data-testid="quip">
      <span key={i} className="animate-quip inline-block">
        {quipAt(i)}
      </span>
    </p>
  );
}

/** Skeleton rows plus a quip: the default "something is coming" for panels and lists. */
export function LoadingPanel({ rows = 4, className = "h-20", quip = true, seed }: { rows?: number; className?: string; quip?: boolean; seed?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn(className, "animate-enter-stagger")} style={{ ["--i" as string]: i }} />
      ))}
      {quip ? <Quip className="mt-1" seed={seed ?? rows} /> : null}
    </div>
  );
}

/** Wraps freshly loaded content so it eases in instead of popping. */
export function FadeIn({ className, children, as: Tag = "div" }: { className?: string; children: React.ReactNode; as?: "div" | "section" }) {
  return <Tag className={cn("animate-enter", className)}>{children}</Tag>;
}

/** Index for staggered list items: style={stagger(i)} with className="animate-enter-stagger". */
export const stagger = (i: number): React.CSSProperties => ({ ["--i" as string]: i });

function Status({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-label={label} className={cn("flex flex-col gap-3", className)}>
      {children}
    </div>
  );
}

/** Chat bubbles, alternating sides, the way a conversation loads. */
export function ChatSkeleton() {
  const rows: { mine: boolean; w: string; h: string }[] = [
    { mine: false, w: "w-3/5", h: "h-14" },
    { mine: true, w: "w-2/5", h: "h-9" },
    { mine: false, w: "w-1/2", h: "h-20" },
    { mine: true, w: "w-1/3", h: "h-9" },
    { mine: false, w: "w-2/5", h: "h-12" },
  ];
  return (
    <Status label="Loading messages" className="gap-4 p-4">
      {rows.map((r, i) => (
        <div key={i} className={cn("animate-enter-stagger flex items-end gap-2", r.mine && "flex-row-reverse")} style={stagger(i)}>
          {r.mine ? null : <Skeleton className="size-7 shrink-0 rounded-full" />}
          <Skeleton className={cn("rounded-2xl", r.w, r.h)} />
        </div>
      ))}
      <Quip className="mt-2" seed={2} />
    </Status>
  );
}

/** Task cards: badges, a title and a due line. */
export function BoardSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <Status label="Loading tasks">
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="animate-enter-stagger flex flex-col gap-2.5 rounded-xl border p-3" style={stagger(i)}>
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-4/5" />
          <div className="flex items-center gap-2">
            <Skeleton className="size-5 rounded-full" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
      <Quip className="mt-1" seed={cards} />
    </Status>
  );
}

/** Avatar rows with two text lines (chats, students). */
export function RowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Status label="Loading" className="gap-1">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="animate-enter-stagger flex items-center gap-3 rounded-lg px-3 py-2.5" style={stagger(i)}>
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </Status>
  );
}

/** A table header and rows with a few cells each. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <Status label="Loading table" className="gap-0 overflow-hidden rounded-lg border">
      <div className="bg-muted/40 flex gap-4 border-b px-4 py-3">
        {Array.from({ length: cols }, (_, c) => (
          <Skeleton key={c} className={cn("h-3", c === 0 ? "w-40" : "w-16")} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="animate-enter-stagger flex items-center gap-4 border-b px-4 py-3 last:border-b-0" style={stagger(r)}>
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={cn(c === 0 ? "h-4 w-40" : "h-3.5 w-16")} />
          ))}
        </div>
      ))}
    </Status>
  );
}
