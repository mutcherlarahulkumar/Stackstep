"use client";

import { useEffect } from "react";

import { reportError } from "@/lib/report-error";

/** Last resort when the root layout itself fails: plain HTML, no app styles or providers. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    reportError(error, "root", error.digest);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0, padding: 24, textAlign: "center" }}>
        <main>
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>Stackstep hit a problem</h1>
          <p style={{ color: "#666", maxWidth: 360 }}>Your work is saved. Try again, or reload the page.</p>
          <button type="button" onClick={reset} style={{ marginTop: 12, padding: "10px 16px", borderRadius: 8, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}>
            Try again
          </button>
          <p style={{ color: "#888", fontSize: 12, marginTop: 16, maxWidth: 360, wordBreak: "break-word" }}>
            {error.name}: {error.message}
            {error.digest ? ` · ref ${error.digest}` : ""}
          </p>
        </main>
      </body>
    </html>
  );
}
