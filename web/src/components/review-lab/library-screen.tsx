"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileDiff, GitPullRequest, SearchCheck, Trophy } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { messageFor } from "@/lib/api/errors";
import { type LabSummary, type Me } from "@/lib/api/schemas";
import { DIFFICULTY_LABEL, LAB } from "@/lib/review-lab";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { AppHeader } from "../app/app-header";
import { RequireSession } from "../app/guard";
import { InfoNote } from "../app/info-note";
import { stagger } from "../app/loading";
import { EmptyState, ErrorState, ListSkeleton } from "../app/state";
import { HelpWidget } from "../help/help-widget";

export const labKey = ["review-lab"] as const;

export function ReviewLabLibraryScreen() {
  return <RequireSession audience="student">{(me) => <Library me={me} />}</RequireSession>;
}

const DIFFICULTY_TONE: Record<LabSummary["difficulty"], string> = {
  easy: "border-emerald-600/40 text-emerald-700 dark:text-emerald-400",
  medium: "border-amber-600/40 text-amber-700 dark:text-amber-400",
  hard: "border-rose-600/40 text-rose-700 dark:text-rose-400",
};

function Library({ me }: { me: Me }) {
  const { api } = useSession();
  const q = useQuery({ queryKey: labKey, queryFn: () => api.reviewLab() });
  const items = q.data?.items ?? [];
  const passed = items.filter((i) => i.record.passed).length;
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
      <main id="main" className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-primary flex items-center gap-2 text-sm font-medium">
              <SearchCheck className="size-4" aria-hidden /> Review lab
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance">Practice code review on real-looking pull requests</h1>
            <p className="text-muted-foreground mt-2 text-pretty">
              Each pull request has a few problems planted in it. Read the diff, leave comments on the lines that are wrong, then finish
              your review. You see what you found and what you missed, with an explanation for each.
            </p>
          </div>
          {items.length > 0 ? (
            <div className="bg-card flex items-center gap-3 rounded-xl border px-4 py-3" data-testid="lab-progress">
              <Trophy className="size-5 text-amber-500" aria-hidden />
              <div className="text-sm">
                <p className="font-semibold tabular-nums">
                  {passed} of {items.length} passed
                </p>
                <p className="text-muted-foreground text-xs">Pass mark {LAB.defaultPass}%</p>
              </div>
            </div>
          ) : null}
        </div>
        <InfoNote id="review-lab" title="How grading works">
          A comment counts when it is on, or right next to, a line with a planted problem. Each problem is worth an equal share. Comments
          that point at nothing cost {LAB.noisePenalty} points each after the first {LAB.freeNoise}, and approving a pull request that has
          problems costs {LAB.approvePenalty}. Practice as often as you like. Your best score is kept.
        </InfoNote>
        {q.isPending ? (
          <ListSkeleton rows={4} className="h-28" />
        ) : q.isError ? (
          <ErrorState message={messageFor(q.error)} onRetry={() => void q.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon={GitPullRequest} title="No pull requests yet">
            New practice pull requests show up here.
          </EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2" aria-label="Practice pull requests">
            {items.map((ex, i) => (
              <li key={ex.key} className="animate-enter-stagger" style={stagger(i)}>
                <Link
                  href={`/review-lab/${encodeURIComponent(ex.key)}`}
                  className="bg-card hover:border-primary/50 focus-visible:ring-ring/60 group flex h-full flex-col gap-3 rounded-xl border p-4 outline-none transition-colors focus-visible:ring-2"
                  data-testid={`lab-${ex.key}`}
                >
                  <div className="flex items-center gap-2">
                    <GitPullRequest className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    <Badge variant="outline" className={cn("font-medium", DIFFICULTY_TONE[ex.difficulty])}>
                      {DIFFICULTY_LABEL[ex.difficulty]}
                    </Badge>
                    <Badge variant="secondary">{ex.language}</Badge>
                    <span className="ml-auto text-xs">
                      {ex.record.best_score === null ? (
                        <span className="text-muted-foreground">Not tried</span>
                      ) : (
                        <span className={cn("font-semibold tabular-nums", ex.record.passed ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")}>
                          Best {ex.record.best_score}%
                        </span>
                      )}
                    </span>
                  </div>
                  <div>
                    <h2 className="font-semibold leading-snug group-hover:underline">
                      {ex.title} <span className="text-muted-foreground font-normal">#{ex.number}</span>
                    </h2>
                    <p className="text-muted-foreground mt-1 text-sm">{ex.summary}</p>
                  </div>
                  <p className="text-muted-foreground mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="inline-flex items-center gap-1">
                      <FileDiff className="size-3.5" aria-hidden /> {ex.files} {ex.files === 1 ? "file" : "files"}
                    </span>
                    <span className="font-mono text-emerald-700 dark:text-emerald-400">+{ex.additions}</span>
                    <span className="font-mono text-rose-700 dark:text-rose-400">−{ex.deletions}</span>
                    <span>
                      {ex.issues} planted {ex.issues === 1 ? "problem" : "problems"}
                    </span>
                    <span>by @{ex.author}</span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <HelpWidget />
    </div>
  );
}
