"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 1024px)";

/** True on screens ≥ 1024 px. Null during server render / before hydration. */
export function useIsDesktop(): boolean | null {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(QUERY).matches,
    () => null,
  );
}
