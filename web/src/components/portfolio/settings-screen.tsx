"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, ExternalLink, Eye, EyeOff, Globe } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { messageFor } from "@/lib/api/errors";
import { type Me, type PortfolioSettings } from "@/lib/api/schemas";
import { cleanHeadline, HEADLINE_MAX, portfolioPath } from "@/lib/portfolio";
import { useSession } from "@/lib/session";

import { AppHeader } from "../app/app-header";
import { RequireSession } from "../app/guard";
import { ErrorState, ListSkeleton } from "../app/state";

export function PortfolioSettingsScreen() {
  return <RequireSession audience="student">{(me) => <Settings me={me} />}</RequireSession>;
}

function Settings({ me }: { me: Me }) {
  const { api } = useSession();
  const q = useQuery({ queryKey: ["my-portfolio"], queryFn: () => api.myPortfolio() });
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader user={me.user}>
        <span className="bg-border hidden h-5 w-px sm:block" aria-hidden />
        <Button asChild variant="ghost" size="sm">
          <Link href={me.enrollment ? "/workspace" : "/"}>
            <ArrowLeft data-icon="inline-start" aria-hidden /> {me.enrollment ? "Workspace" : "Home"}
          </Link>
        </Button>
      </AppHeader>
      <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your portfolio</h1>
          <p className="text-muted-foreground mt-1 text-pretty">
            A public page recruiters can open without signing in. It is built from your finished work, so it stays up to date by itself.
          </p>
        </div>
        {q.isPending ? (
          <ListSkeleton rows={2} className="h-24" />
        ) : q.isError ? (
          <ErrorState message={messageFor(q.error)} onRetry={() => void q.refetch()} />
        ) : (
          <Form key={`${q.data.public}-${q.data.headline}`} initial={q.data} />
        )}
      </main>
    </div>
  );
}

function Form({ initial }: { initial: PortfolioSettings }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const [on, setOn] = useState(initial.public);
  const [headline, setHeadline] = useState(initial.headline);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const length = [...cleanHeadline(headline)].length;
  const url = typeof window === "undefined" ? portfolioPath(initial.login) : `${window.location.origin}${portfolioPath(initial.login)}`;
  const dirty = on !== initial.public || cleanHeadline(headline) !== initial.headline;

  const save = async () => {
    if (length > HEADLINE_MAX) return setError(`The headline can be at most ${HEADLINE_MAX} characters.`);
    setBusy(true);
    setError(null);
    try {
      const next = await api.saveMyPortfolio(on, cleanHeadline(headline));
      qc.setQueryData(["my-portfolio"], next);
      toast.success(next.public ? "Your portfolio is public." : "Your portfolio is private.");
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };
  const copy = () => {
    void navigator.clipboard
      .writeText(url)
      .then(() => toast.success("Link copied"))
      .catch(() => toast.error("Couldn't copy. Select the link and copy it instead."));
  };

  return (
    <>
      <section className="bg-card flex flex-col gap-5 rounded-2xl border p-5">
        <div className="flex items-start gap-3">
          {on ? <Eye className="text-primary mt-0.5 size-5" aria-hidden /> : <EyeOff className="text-muted-foreground mt-0.5 size-5" aria-hidden />}
          <div className="min-w-0 flex-1">
            <label htmlFor="portfolio-public" className="font-medium">
              Public portfolio
            </label>
            <p className="text-muted-foreground text-sm">{on ? "Anyone with the link can see it." : "Only you know it exists. The link shows nothing."}</p>
          </div>
          <Switch id="portfolio-public" checked={on} onCheckedChange={setOn} data-testid="portfolio-public" />
        </div>
        <Field data-invalid={!!error || length > HEADLINE_MAX}>
          <FieldLabel htmlFor="portfolio-headline">Headline</FieldLabel>
          <Input
            id="portfolio-headline"
            value={headline}
            onChange={(e) => {
              setHeadline(e.target.value);
              setError(null);
            }}
            placeholder="Frontend intern building accessible React apps"
            aria-invalid={!!error || length > HEADLINE_MAX}
            data-testid="portfolio-headline"
          />
          <FieldDescription className="flex justify-between">
            <span>One line under your name.</span>
            <span className="tabular-nums">
              {length}/{HEADLINE_MAX}
            </span>
          </FieldDescription>
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>
        <div className="flex justify-end">
          <Button onClick={() => void save()} disabled={busy || !dirty} data-testid="portfolio-save">
            {busy ? <Spinner data-icon="inline-start" /> : null} Save
          </Button>
        </div>
      </section>

      {initial.public ? (
        <section className="bg-card flex flex-col gap-3 rounded-2xl border p-5" aria-label="Share">
          <p className="flex items-center gap-2 font-medium">
            <Globe className="size-4 text-emerald-600" aria-hidden /> Your public link
          </p>
          <code className="bg-muted rounded-lg px-3 py-2 font-mono text-sm break-all" data-testid="portfolio-url">
            {url}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={copy}>
              <Copy data-icon="inline-start" aria-hidden /> Copy link
            </Button>
            <Button asChild variant="outline">
              <Link href={portfolioPath(initial.login)} target="_blank">
                <ExternalLink data-icon="inline-start" aria-hidden /> Open it
              </Link>
            </Button>
          </div>
        </section>
      ) : null}

      <section className="text-muted-foreground text-sm" aria-label="What it shows">
        <p className="text-foreground mb-1 font-medium">What it shows</p>
        <p>
          Your name, GitHub username, headline, internship, finished tasks with their hand-in links, badges, certificates and the review lab
          pull requests you passed. Never your chats, notes, reviews, scores or email.
        </p>
      </section>
    </>
  );
}
