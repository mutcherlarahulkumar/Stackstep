"use client";

import { useMutation } from "@tanstack/react-query";
import { Bot, Download, Eye, ShieldCheck, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, messageFor } from "@/lib/api/errors";
import { type Me } from "@/lib/api/schemas";
import { firstName } from "@/lib/format";
import { CONSENT_SUMMARY, TERMS_VERSION } from "@/lib/legal";
import { useSession } from "@/lib/session";

import { Wordmark } from "./brand";
import { stagger } from "./loading";

const ICONS = [UserRound, Eye, Users, Bot, Download] as const;

/** First sign-in (and after the terms change): what we keep and who sees it, then accept. */
export function ConsentScreen({ me }: { me: Me }) {
  const { api, setAccount, signOut } = useSession();
  const [agreed, setAgreed] = useState(false);
  const [stale, setStale] = useState(false);
  const accept = useMutation({
    mutationFn: () => api.acceptTerms(TERMS_VERSION),
    onSuccess: setAccount,
    onError: (e) => {
      if (e instanceof ApiError && e.code === "validation_failed") setStale(true);
    },
  });

  return (
    <div className="bg-muted/40 flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <Wordmark />
      <main id="main" className="w-full max-w-lg">
        <Card className="animate-enter">
          <CardHeader>
            <CardTitle>
              <h1 className="text-xl">Hi {firstName(me.user.name)}, a quick check first</h1>
            </CardTitle>
            <CardDescription>Before you start, here&apos;s what Stackstep keeps and who can see it.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-col gap-3" aria-label="Summary">
              {CONSENT_SUMMARY.map((line, i) => {
                const Icon = ICONS[i] ?? ShieldCheck;
                return (
                  <li key={line} className="animate-enter-stagger flex gap-3 text-sm leading-relaxed" style={stagger(i)}>
                    <span className="bg-primary/10 text-primary mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="text-pretty">{line}</span>
                  </li>
                );
              })}
            </ul>
            <p className="text-muted-foreground text-sm">
              Read the full{" "}
              <Link href="/privacy" target="_blank" className="text-foreground underline underline-offset-4">
                privacy notice
              </Link>{" "}
              and{" "}
              <Link href="/terms" target="_blank" className="text-foreground underline underline-offset-4">
                terms of use
              </Link>{" "}
              (open in a new tab).
            </p>
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox id="consent" className="mt-0.5" checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} data-testid="consent-check" />
              <label htmlFor="consent" className="text-sm leading-snug">
                I&apos;ve read the privacy notice and accept the terms of use.
              </label>
            </div>
            {stale ? (
              <Alert variant="destructive" role="alert">
                <AlertTitle>These terms have changed</AlertTitle>
                <AlertDescription>Reload the page to read the latest version before accepting.</AlertDescription>
              </Alert>
            ) : accept.isError ? (
              <p role="alert" className="text-destructive text-sm">
                {messageFor(accept.error)}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="ghost" onClick={() => void signOut()}>
              Not now, sign out
            </Button>
            {stale ? (
              <Button onClick={() => window.location.reload()}>Reload</Button>
            ) : (
              <Button onClick={() => accept.mutate()} disabled={!agreed || accept.isPending} data-testid="consent-accept">
                {accept.isPending ? <Spinner data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" aria-hidden />}
                Accept and continue
              </Button>
            )}
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}
