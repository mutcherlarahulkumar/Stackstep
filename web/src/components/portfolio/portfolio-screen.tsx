"use client";

import { useQuery } from "@tanstack/react-query";
import { Award, CalendarDays, ExternalLink, Flame, GitMerge, ListChecks, SearchCheck, SearchX, Sparkles } from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, messageFor } from "@/lib/api/errors";
import { type Portfolio } from "@/lib/api/schemas";
import { TYPE_LABEL } from "@/lib/board";
import { dateOnlyLabel, formatCode, verifyPath } from "@/lib/certificate";
import { dateLabel, initials } from "@/lib/format";
import { linkLabel, programName, statusLine } from "@/lib/portfolio";
import { useSession } from "@/lib/session";

import { EarnedBadges } from "../achievements/badges";
import { Wordmark } from "../app/brand";
import { EmptyState, ErrorState } from "../app/state";
import { TYPE_ICON } from "../app/task-badges";
import { ThemeToggle } from "../app/theme-toggle";

const isNotFound = (e: unknown) => e instanceof ApiError && e.code === "not_found";

/** /p/{login}: a student's public portfolio, readable signed out. */
export function PortfolioScreen({ login }: { login: string }) {
  const { api } = useSession();
  const q = useQuery({
    queryKey: ["portfolio", login],
    queryFn: () => api.portfolio(login),
    retry: (n, e) => !isNotFound(e) && n < 2,
    staleTime: 60_000,
  });
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center gap-3 border-b px-4 sm:px-6">
        <Link href="/" className="rounded-md" aria-label="Stackstep home">
          <Wordmark />
        </Link>
        <span className="text-muted-foreground hidden text-sm sm:inline">Intern portfolio</span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        {q.isPending ? (
          <div className="flex flex-col gap-4" role="status" aria-label="Loading portfolio">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        ) : q.isError ? (
          isNotFound(q.error) ? (
            <EmptyState icon={SearchX} title="No public portfolio here">
              This intern hasn&apos;t made their portfolio public, or the link is mistyped.
            </EmptyState>
          ) : (
            <ErrorState message={messageFor(q.error)} onRetry={() => void q.refetch()} />
          )
        ) : (
          <PortfolioView p={q.data} />
        )}
      </main>
      <footer className="text-muted-foreground border-t px-4 py-6 text-center text-xs sm:px-6">
        Every task here was assigned, handed in and reviewed on{" "}
        <Link href="/" className="text-foreground underline-offset-4 hover:underline">
          Stackstep
        </Link>
        , a virtual software engineering internship.
      </footer>
    </div>
  );
}

function PortfolioView({ p }: { p: Portfolio }) {
  return (
    <>
      <section className="flex flex-col items-start gap-5 sm:flex-row sm:items-center" aria-labelledby="who">
        <Avatar className="size-24 ring-4 ring-violet-500/20">
          {p.avatar_url ? <AvatarImage src={p.avatar_url} alt="" /> : null}
          <AvatarFallback className="text-2xl">{initials(p.name, p.login)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 id="who" className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {p.name}
          </h1>
          {p.headline ? <p className="mt-1 text-lg text-pretty">{p.headline}</p> : null}
          <p className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span>{programName(p)}</span>
            {p.flow_name ? <span>· {p.flow_name}</span> : null}
            <Badge variant="secondary">{statusLine(p)}</Badge>
            <a
              href={`https://github.com/${encodeURIComponent(p.login)}`}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline"
            >
              @{p.login} on GitHub <ExternalLink className="size-3" aria-hidden />
            </a>
          </p>
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={ListChecks} label="Tasks finished" value={p.tasks_done} />
        <Stat icon={GitMerge} label="Pull requests approved" value={p.prs_merged} />
        <Stat icon={Sparkles} label="Points" value={p.points} />
        <Stat icon={Flame} label="Longest streak" value={`${p.streak.longest} ${p.streak.longest === 1 ? "day" : "days"}`} />
      </dl>

      <Section title="Badges" icon={Award}>
        <EarnedBadges badges={p.badges} empty="No badges yet. They are earned by shipping work on time." />
      </Section>

      {p.certificates.length > 0 ? (
        <Section title="Certificates" icon={Award}>
          <ul className="flex flex-col gap-2">
            {p.certificates.map((c) => (
              <li key={c.code} className="bg-card flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm">
                <span className="font-medium">Issued {dateLabel(c.issued_at)}</span>
                <span className="text-muted-foreground font-mono text-xs">{formatCode(c.code)}</span>
                <Button asChild size="sm" variant="outline" className="ml-auto">
                  <Link href={verifyPath(c.code)}>Verify</Link>
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Shipped work" icon={CalendarDays}>
        {p.work.length === 0 ? (
          <p className="text-muted-foreground text-sm">Finished tasks show up here.</p>
        ) : (
          <ol className="border-muted ml-3 flex flex-col gap-4 border-l-2 pl-6" data-testid="portfolio-work">
            {p.work.map((w, i) => {
              const Icon = TYPE_ICON[w.type];
              return (
                <li key={`${w.title}-${i}`} className="relative">
                  <span className="bg-background absolute top-0 -left-[2.3rem] grid size-7 place-items-center rounded-full border" aria-hidden>
                    <Icon className="text-muted-foreground size-3.5" />
                  </span>
                  <p className="font-medium">{w.title}</p>
                  <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                    <span>{TYPE_LABEL[w.type]}</span>
                    <span>· {dateLabel(w.done_at)}</span>
                    {w.url ? (
                      <a href={w.url} target="_blank" rel="noreferrer noopener nofollow" className="text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline">
                        · {linkLabel(w.url)} <ExternalLink className="size-3" aria-hidden />
                      </a>
                    ) : null}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      {p.review_lab.length > 0 ? (
        <Section title="Code reviews passed" icon={SearchCheck}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {p.review_lab.map((l) => (
              <li key={l.key} className="bg-card flex items-center gap-3 rounded-xl border p-3 text-sm">
                <SearchCheck className="size-4 text-emerald-600" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{l.title}</span>
                  <span className="text-muted-foreground text-xs">{l.language}</span>
                </span>
                <span className="font-semibold tabular-nums">{l.best_score}%</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Internship {dateOnlyLabel(p.start_date)} to {dateOnlyLabel(p.end_date)}.
      </p>
    </>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Award; label: string; value: ReactNode }) {
  return (
    <div className="bg-card rounded-xl border p-4">
      <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Icon className="size-3.5" aria-hidden /> {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Award; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Icon className="text-muted-foreground size-4" aria-hidden /> {title}
      </h2>
      {children}
    </section>
  );
}
