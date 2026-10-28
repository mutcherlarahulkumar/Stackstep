"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { errorSummary } from "@/lib/report-error";

/** The technical cause, folded away, so it can be copied into a message to the team. */
export function ErrorDetails({ error, digest }: { error: unknown; digest?: string }) {
  const text = [errorSummary(error), digest ? `ref ${digest}` : "", typeof location === "undefined" ? "" : location.pathname].filter(Boolean).join(" · ");
  return (
    <details className="text-muted-foreground w-full max-w-md text-left text-xs" data-testid="error-details">
      <summary className="cursor-pointer text-center">Error details</summary>
      <div className="bg-muted mt-2 flex items-start gap-2 rounded-lg p-3">
        <code className="min-w-0 flex-1 break-words whitespace-pre-wrap">{text}</code>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Copy error details"
          onClick={() =>
            void navigator.clipboard
              .writeText(text)
              .then(() => toast.success("Copied. Send it to the Stackstep team."))
              .catch(() => toast.error("Couldn't copy. Select the text instead."))
          }
        >
          <Copy aria-hidden />
        </Button>
      </div>
    </details>
  );
}
