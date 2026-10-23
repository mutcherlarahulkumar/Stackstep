"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { type Me } from "@/lib/api/schemas";
import { homeFor, useSession } from "@/lib/session";

import { BrandMark } from "./brand";
import { Quip } from "./loading";

export function FullPageLoader() {
  return (
    <div className="flex min-h-dvh flex-col" role="status" aria-label="Loading Stackstep">
      <div className="flex h-14 items-center gap-3 border-b px-6">
        <BrandMark />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="relative grid flex-1 gap-4 p-6 lg:grid-cols-[3fr_2fr]">
        <Skeleton className="h-full min-h-64" />
        <Skeleton className="hidden h-full lg:block" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6">
          <BrandMark className="size-10 animate-pulse" />
          <Quip />
        </div>
      </div>
    </div>
  );
}

/** Renders children only for the right audience; everyone else is sent where they belong. */
export function RequireSession({ audience, children }: { audience: "student" | "staff"; children: (me: Me) => ReactNode }) {
  const { state } = useSession();
  const router = useRouter();
  const target =
    state.status === "signed_out"
      ? "/login"
      : state.status === "signed_in" && (audience === "staff") !== (homeFor(state.me) === "/admin")
        ? homeFor(state.me)
        : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [router, target]);

  if (state.status !== "signed_in" || target) return <FullPageLoader />;
  return children(state.me);
}
