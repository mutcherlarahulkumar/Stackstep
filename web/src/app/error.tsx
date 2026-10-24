"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Keep the cause in the browser console (and in E2E logs) instead of swallowing it.
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground max-w-sm">We hit an unexpected error. Try again, and if it keeps happening, reload the page.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
