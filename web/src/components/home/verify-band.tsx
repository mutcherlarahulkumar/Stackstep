"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isCode, normalizeCode, verifyPath } from "@/lib/certificate";

/** Type a certificate code straight from the home page; no account needed. */
export function VerifyBand() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex w-full max-w-md flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!isCode(code)) {
          setError("Codes are 12 letters and digits, like ABCD-EFGH-JK23.");
          return;
        }
        setError(null);
        router.push(verifyPath(normalizeCode(code)));
      }}
    >
      <div className="flex gap-2">
        <label htmlFor="home-verify" className="sr-only">
          Certificate code
        </label>
        <Input
          id="home-verify"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ABCD-EFGH-JK23"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="bg-background h-11 font-mono uppercase"
          aria-invalid={!!error}
          aria-describedby={error ? "home-verify-error" : undefined}
          data-testid="home-verify-input"
        />
        <Button type="submit" className="h-11 px-4" data-testid="home-verify-submit">
          Verify <ArrowRight data-icon="inline-end" aria-hidden />
        </Button>
      </div>
      {error ? (
        <p id="home-verify-error" className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
