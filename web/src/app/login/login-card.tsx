"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandMark, GitHubMark } from "@/components/app/brand";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, messageFor, toErrorCode } from "@/lib/api/errors";
import { homeFor, useSession } from "@/lib/session";

function callbackError(raw: string | null): string | null {
  if (!raw) return null;
  const code = toErrorCode(raw);
  if (code === "unauthenticated") return null; // cancelled on GitHub
  if (code === "not_configured") return "GitHub sign-in isn't set up on this server yet.";
  return messageFor(new ApiError(400, code, ""));
}

export function LoginCard() {
  const { state, api } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error] = useState<string | null>(() => callbackError(params.get("error")));

  useEffect(() => {
    if (state.status === "signed_in") router.replace(homeFor(state.me));
  }, [state, router]);

  const sessionMessage = state.status === "signed_out" ? state.message : null;
  const shown = error ?? sessionMessage;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="gap-3">
        <BrandMark className="size-10" />
        <CardTitle className="text-2xl font-semibold tracking-tight">
          <h1>Welcome to Stackstep</h1>
        </CardTitle>
        <CardDescription>Sign in with the GitHub account you&apos;ll use for your internship.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {shown ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden />
            <AlertTitle>Couldn&apos;t sign you in</AlertTitle>
            <AlertDescription>{shown}</AlertDescription>
          </Alert>
        ) : null}
        <Button
          size="lg"
          className="h-11"
          disabled={busy || state.status === "loading"}
          onClick={() => {
            setBusy(true);
            window.location.assign(api.githubStartUrl());
          }}
        >
          {busy ? <Spinner data-icon="inline-start" /> : <GitHubMark />}
          {busy ? "Opening GitHub…" : "Continue with GitHub"}
        </Button>
        <p className="text-muted-foreground text-center text-xs">
          We read your GitHub profile and email only. Stackstep never pushes code to your repos. See our{" "}
          <Link href="/privacy" className="text-foreground underline underline-offset-4">
            privacy notice
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="text-foreground underline underline-offset-4">
            terms
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}
