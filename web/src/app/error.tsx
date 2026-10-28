"use client";

import { CloudOff, House, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

import { ErrorDetails } from "@/components/app/error-details";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/report-error";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const offline = useSyncExternalStore(subscribeOnline, () => !navigator.onLine, () => false);
  // Keep the cause in the browser console (and in E2E logs) instead of swallowing it.
  useEffect(() => {
    console.error(error);
    reportError(error, "page", error.digest);
  }, [error]);
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full" aria-hidden>
        <CloudOff className="size-6" />
      </span>
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground max-w-sm text-pretty">
        {offline
          ? "You seem to be offline. Check your connection, then try again."
          : "This page hit a problem. Your work is saved. Try again, or go back to the start."}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset} data-testid="crash-retry">
          <RefreshCw data-icon="inline-start" aria-hidden /> Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">
            <House data-icon="inline-start" aria-hidden /> Go home
          </Link>
        </Button>
      </div>
      {offline ? null : <ErrorDetails error={error} digest={error.digest} />}
    </main>
  );
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}
