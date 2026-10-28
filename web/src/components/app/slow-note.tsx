"use client";

import { useSlow } from "@/lib/use-slow";

/** Shown under a button that has been working for a while. */
export function SlowNote({ busy }: { busy: boolean }) {
  const slow = useSlow(busy);
  if (!slow) return null;
  return (
    <p className="text-muted-foreground animate-enter text-xs" role="status" data-testid="slow-note">
      Still working. The first request after a quiet spell can take up to a minute. Please keep this page open.
    </p>
  );
}
