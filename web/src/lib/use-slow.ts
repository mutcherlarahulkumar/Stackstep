"use client";

import { useEffect, useState } from "react";

/** True once `busy` has lasted longer than `afterMs`, so a long wait can explain itself. */
export function useSlow(busy: boolean, afterMs = 6000): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => setSlow(true), afterMs);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [busy, afterMs]);
  return busy && slow;
}
