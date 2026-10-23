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
