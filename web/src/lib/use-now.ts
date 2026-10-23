"use client";

import { useEffect, useState } from "react";

/** The current time, refreshed every `ms` while `active` (for countdowns). */
export function useNow(active: boolean, ms = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return now;
}
