"use client";

import { useEffect } from "react";

import { reportError } from "@/lib/report-error";

/** Errors outside rendering (click handlers, timers, promises) go to the API log too. */
export function CrashReporter() {
  useEffect(() => {
    const ours = (file: string | undefined) => !file || file.startsWith(location.origin);
    const onError = (e: ErrorEvent) => {
      if (!ours(e.filename) || /ResizeObserver loop/.test(e.message)) return; // extensions, benign browser noise
      reportError(e.error ?? new Error(e.message), "unhandled");
    };
    const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason, "unhandled promise");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
