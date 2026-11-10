"use client";

import { useQuery } from "@tanstack/react-query";
import { Radio } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";

/** A strip under the header while one of your classes is live or about to start. */
export function LiveClassBanner() {
  const { api } = useSession();
  const q = useQuery({ queryKey: ["my-classes"], queryFn: () => api.myClasses(), refetchInterval: 60_000 });
  // The time of the last fetch (every minute) keeps render pure.
  const now = q.dataUpdatedAt;
  const c = (q.data ?? []).find((x) => x.status === "live" || (x.status === "scheduled" && x.starts_at.getTime() - now < 10 * 60_000 && x.ends_at.getTime() > now));
  if (!c) return null;
  return (
    <div className="flex items-center gap-3 border-b bg-gradient-to-r from-rose-600 to-fuchsia-600 px-4 py-2 text-white" role="status" data-testid="live-class-banner">
      <span className="relative flex size-2.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/80" />
        <span className="relative inline-flex size-2.5 rounded-full bg-white" />
      </span>
      <p className="min-w-0 flex-1 truncate text-sm">
        <span className="font-semibold">{c.status === "live" ? "Live now" : "Starting soon"}</span> · {c.title} with {c.host_name}
      </p>
      <Button asChild size="sm" variant="secondary" className="bg-white text-rose-700 hover:bg-white/90">
        <Link href={`/classes/${c.id}`}>
          <Radio data-icon="inline-start" aria-hidden /> Join
        </Link>
      </Button>
    </div>
  );
}
