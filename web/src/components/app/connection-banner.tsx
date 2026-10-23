"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

import { type SocketStatus } from "@/lib/api/realtime";

/** How long the live connection may be down before we mention it. Blips stay invisible. */
export const BANNER_GRACE_MS = 4000;

/** Tells people when live updates have been down for a while; quick reconnects never flash it. */
export function ConnectionBanner({ status }: { status: SocketStatus }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (status === "connecting") return; // keep whatever we show while a retry is in flight
    const t = window.setTimeout(() => setShow(status === "offline"), status === "offline" ? BANNER_GRACE_MS : 0);
    return () => window.clearTimeout(t);
  }, [status]);
  if (!show || status === "live") return null;
  return (
    <div role="status" aria-live="polite" className="animate-enter bg-warning/12 text-foreground flex items-center gap-2 px-4 py-2 text-sm">
      <WifiOff className="text-warning size-4" aria-hidden />
      Reconnecting… new messages appear as soon as you’re back online.
    </div>
  );
}
