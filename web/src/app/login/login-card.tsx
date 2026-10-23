"use client";

import { CircleAlert, FlaskConical } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandMark, GitHubMark } from "@/components/app/brand";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, messageFor, toErrorCode } from "@/lib/api/errors";
import { homeFor, useSession } from "@/lib/session";

const DEV_USERS = [
  { login: "asha-dev", label: "Student" },
  { login: "ravi-dev", label: "Student 2" },
  { login: "meera-dev", label: "On a flow" },
  { login: "nora-dev", label: "No internship" },
  { login: "anits-tpo", label: "College admin" },
  { login: "admin-demo", label: "Admin" },
] as const;

function callbackError(raw: string | null): string | null {
  if (!raw) return null;
  const code = toErrorCode(raw);
  if (code === "unauthenticated") return null; // cancelled on GitHub
  if (code === "not_configured") return "GitHub sign-in isn't set up on this server yet.";
  return messageFor(new ApiError(400, code, ""));
}

export function LoginCard() {
  const { state, api, config, devLogin } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => callbackError(params.get("error")));

  useEffect(() => {
    if (state.status === "signed_in") router.replace(homeFor(state.me));
  }, [state, router]);

  const sessionMessage = state.status === "signed_out" ? state.message : null;
  const shown = error ?? sessionMessage;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="gap-3">
        <BrandMark className="size-10" />
        <CardTitle className="text-2xl font-semibold tracking-tight">Welcome to Stackstep</CardTitle>
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
          disabled={busy !== null || state.status === "loading"}
          onClick={() => {
            setBusy("github");
            window.location.assign(api.githubStartUrl());
          }}
        >
          {busy === "github" ? <Spinner data-icon="inline-start" /> : <GitHubMark />}
          {busy === "github" ? "Opening GitHub…" : "Continue with GitHub"}
        </Button>
        <p className="text-muted-foreground text-center text-xs">We read your GitHub profile and email only. Stackstep never pushes code to your repos.</p>
      </CardContent>
      {config?.devLogin ? (
        <CardFooter className="flex-col items-stretch gap-3">
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <FlaskConical className="size-3.5" aria-hidden /> Developer sign-in
          </p>
          <div className="flex flex-wrap gap-2">
            {DEV_USERS.map((u) => (
              <Button
                key={u.login}
                size="sm"
                variant="outline"
                disabled={busy !== null}
                data-testid={`dev-${u.login}`}
                onClick={async () => {
                  setBusy(u.login);
                  setError(null);
                  setError(await devLogin(u.login));
                  setBusy(null);
                }}
              >
                {busy === u.login ? <Spinner data-icon="inline-start" /> : null}
                {u.label}
              </Button>
            ))}
          </div>
        </CardFooter>
      ) : null}
    </Card>
  );
}
