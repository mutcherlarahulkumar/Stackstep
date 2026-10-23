import { WifiOff } from "lucide-react";

import { type SocketStatus } from "@/lib/api/realtime";

export function ConnectionBanner({ status }: { status: SocketStatus }) {
  if (status !== "offline") return null;
  return (
    <div role="status" aria-live="polite" className="bg-warning/12 text-foreground flex items-center gap-2 px-4 py-2 text-sm">
      <WifiOff className="text-warning size-4" aria-hidden />
      Reconnecting… new messages appear as soon as you’re back online.
    </div>
  );
}
