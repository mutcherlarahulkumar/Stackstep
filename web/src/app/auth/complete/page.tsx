"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { FullPageLoader } from "@/components/app/guard";
import { homeFor, useSession } from "@/lib/session";

/** GitHub sends the browser here with a fresh refresh cookie; the session provider picks it up. */
export default function AuthComplete() {
  const { state } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (state.status === "signed_in") router.replace(homeFor(state.me));
    if (state.status === "signed_out") router.replace("/login?error=invalid_state");
  }, [state, router]);
  return <FullPageLoader />;
}
