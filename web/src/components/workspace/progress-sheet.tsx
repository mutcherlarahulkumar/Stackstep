"use client";

import { Award, BadgeCheck, ExternalLink, FileBadge } from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { messageFor } from "@/lib/api/errors";
import { type Enrollment, type Progress as ProgressData } from "@/lib/api/schemas";
import { certificatePath, formatCode, verifyPath } from "@/lib/certificate";
import { dateTimeLabel } from "@/lib/format";
import { useProgress } from "@/lib/wallet-queries";

import { ErrorState, ListSkeleton } from "../app/state";

/** Header button: the internship day bar on wide screens, an award icon on phones. */
export function ProgressButton({ enrollment }: { enrollment: Enrollment }) {
  const days = Math.round((enrollment.day_number / enrollment.program.days) * 100);
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 px-2" data-testid="open-progress" aria-label="Your progress and certificate">
          <Award className="text-muted-foreground" aria-hidden />
          <Progress value={days} className="hidden w-24 sm:block" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Your progress</SheetTitle>
          <SheetDescription>
            Day {enrollment.day_number} of {enrollment.program.days}. Your team lead issues your certificate when you&apos;re done.
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          <ProgressBody />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ProgressBody() {
  const q = useProgress();
  if (q.isPending) return <ListSkeleton rows={3} className="h-16" />;
  if (q.isError) return <ErrorState message={messageFor(q.error)} onRetry={() => void q.refetch()} />;
  return <ProgressDetails p={q.data} />;
}

export function ProgressDetails({ p }: { p: ProgressData }) {
  return (
    <div className="flex flex-col gap-5" data-testid="progress-details">
      <section aria-labelledby="completion" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h3 id="completion" className="text-sm font-medium">
            Tasks finished
          </h3>
          <span className="text-2xl font-semibold tabular-nums">{p.completion_percent}%</span>
        </div>
        <div className="relative">
          <Progress value={p.completion_percent} aria-label={`${p.completion_percent}% of released tasks finished`} />
          <span className="bg-foreground/60 absolute -top-1 h-4 w-0.5 rounded" style={{ left: `${p.bar_percent}%` }} aria-hidden />
        </div>
        <p className="text-muted-foreground text-xs">
          {p.done} of {p.released} released tasks done. The certificate bar is {p.bar_percent}%.
        </p>
      </section>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <Stat label="In review">{p.in_review}</Stat>
        <Stat label="Overdue" warn={p.overdue > 0}>
          {p.overdue}
        </Stat>
        <Stat label="Done on time">{p.on_time}</Stat>
        <Stat label="Points">{p.points}</Stat>
      </dl>
      <section aria-labelledby="certificate" className="flex flex-col gap-2 rounded-lg border p-4">
        <h3 id="certificate" className="flex items-center gap-2 text-sm font-medium">
          <FileBadge className="size-4" aria-hidden /> Certificate
        </h3>
        {p.certificate ? (
          <>
            <p className="text-sm">
              <BadgeCheck className="text-success mr-1 inline size-4 align-text-bottom" aria-hidden />
              Issued {dateTimeLabel(p.certificate.issued_at)}. Code <span className="font-mono">{formatCode(p.certificate.code)}</span>
            </p>
            <p className="text-muted-foreground text-xs">Share the verification link on your CV or LinkedIn. Anyone can check it without signing in.</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href={certificatePath(p.certificate.code)} target="_blank">
                  View certificate
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={verifyPath(p.certificate.code)} target="_blank">
                  Verification page <ExternalLink data-icon="inline-end" aria-hidden />
                </Link>
              </Button>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground text-sm" data-testid="no-certificate">
            {p.meets_bar
              ? "You're past the bar. Keep going — your team lead reviews your work and issues the certificate."
              : `Finish at least ${p.bar_percent}% of your tasks. Your team lead reviews your work and issues the certificate by hand.`}
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, warn = false, children }: { label: string; warn?: boolean; children: ReactNode }) {
  return (
    <div className="bg-muted/60 rounded-lg px-3 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={warn ? "text-destructive text-lg font-semibold tabular-nums" : "text-lg font-semibold tabular-nums"}>{children}</dd>
    </div>
  );
}
