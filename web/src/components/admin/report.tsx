"use client";

import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, CalendarRange, ChevronLeft, ChevronRight, ClipboardCheck, Download, GitPullRequest, Printer, Timer, TriangleAlert, Trophy, Users } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { messageFor } from "@/lib/api/errors";
import { type ReportGroup, type ReportStudent, type WeeklyReport } from "@/lib/api/schemas";
import { saveBlob } from "@/lib/download";
import { reportCsv, shiftDate, weekLabel } from "@/lib/report";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { stagger, TableSkeleton } from "../app/loading";
import { PAGE, PageHeader } from "../app/page-header";
import { InsightsTabs } from "./insights-tabs";
import { EmptyState, ErrorState } from "../app/state";
import { StatTile } from "../app/stat-tile";
import { AdminShell } from "./admin-shell";

export function ReportScreen() {
  return <AdminShell section="report" phone="gate">{() => <Report />}</AdminShell>;
}

function Report() {
  const { api } = useSession();
  const [week, setWeek] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["weekly-report", week], queryFn: () => api.weeklyReport(week), placeholderData: (prev) => prev });
  const r = q.data;
  const current = week === null;
  const go = (days: number) => r && setWeek(shiftDate(r.week_start, days));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">
      <div className={cn(PAGE, "gap-6")}>
        <InsightsTabs active="report" />
        <PageHeader title="Weekly report" description="What each cohort did this week, who stood out and who needs a nudge. Print it or share the CSV with your placement team.">
          <div className="flex items-center gap-1 print:hidden" role="group" aria-label="Week">
            <Button variant="outline" size="icon" onClick={() => go(-7)} disabled={!r} aria-label="Previous week">
              <ChevronLeft aria-hidden />
            </Button>
            <span className="inline-flex min-w-40 items-center justify-center gap-1.5 text-sm font-medium tabular-nums" aria-live="polite" data-testid="report-week">
              <CalendarRange className="text-muted-foreground size-4" aria-hidden />
              {r ? weekLabel(r.week_start, r.week_end) : "…"}
            </span>
            <Button variant="outline" size="icon" onClick={() => go(7)} disabled={!r || current} aria-label="Next week">
              <ChevronRight aria-hidden />
            </Button>
          </div>
          <Button variant="outline" onClick={() => window.print()} disabled={!r} className="print:hidden">
            <Printer data-icon="inline-start" aria-hidden /> Print
          </Button>
          <Button
            variant="outline"
            disabled={!r}
            className="print:hidden"
            onClick={() => r && saveBlob(new Blob([reportCsv(r)], { type: "text/csv;charset=utf-8" }), `stackstep-week-${r.week_start}.csv`)}
            data-testid="report-csv"
          >
            <Download data-icon="inline-start" aria-hidden /> CSV
          </Button>
        </PageHeader>
        {r ? <p className="hidden text-sm print:block">Week of {weekLabel(r.week_start, r.week_end)} · generated {r.generated_at.toLocaleString()}</p> : null}
        {q.isPending ? (
          <TableSkeleton rows={4} cols={7} />
        ) : q.isError ? (
          <ErrorState message={messageFor(q.error)} onRetry={() => void q.refetch()} />
        ) : r && r.totals.students === 0 ? (
          <EmptyState icon={Users} title="No students yet">
            Enroll students from People, and their week shows up here.
          </EmptyState>
        ) : r ? (
          <Body r={r} />
        ) : null}
      </div>
    </div>
  );
}

function Body({ r }: { r: WeeklyReport }) {
  const t = r.totals;
  return (
    <>
      {r.truncated ? (
        <Alert>
          <TriangleAlert aria-hidden />
          <AlertDescription>Showing the first students only. Narrow it down from the overview for a full export.</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="report-totals">
        <StatTile icon={Users} label="Students" value={t.students} detail={`${t.active} active`} />
        <StatTile icon={ClipboardCheck} iconClassName="text-primary" label="Tasks finished" value={t.done} detail="this week" />
        <StatTile icon={Timer} iconClassName="text-success" label="On time" value={`${t.on_time_percent}%`} detail="of finished tasks" />
        <StatTile icon={GitPullRequest} label="Hand-ins" value={t.hand_ins} detail="sent for review" />
        <StatTile icon={BadgeCheck} iconClassName="text-success" label="Certificates" value={t.certificates} detail="issued this week" />
        <StatTile icon={TriangleAlert} iconClassName="text-warning" label="Quiet now" value={t.inactive} detail="no activity for 2 days" />
      </div>
      <section aria-labelledby="by-cohort" className="flex flex-col gap-2">
        <h2 id="by-cohort" className="text-base font-semibold">
          By cohort
        </h2>
        <div className="overflow-x-auto rounded-lg border">
          <Table data-testid="report-cohorts">
            <TableHeader>
              <TableRow>
                <TableHead>Cohort</TableHead>
                <TableHead className="text-right">Students</TableHead>
                <TableHead className="text-right">Finished</TableHead>
                <TableHead className="text-right">On time</TableHead>
                <TableHead className="text-right">Hand-ins</TableHead>
                <TableHead className="text-right">Certificates</TableHead>
                <TableHead className="text-right">Quiet</TableHead>
                <TableHead className="text-right">Avg. progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.groups.map((g) => (
                <GroupRow key={g.cohort} g={g} />
              ))}
            </TableBody>
            {r.groups.length > 1 ? (
              <TableFooter>
                <GroupRow g={{ ...t, cohort: "All students", college: null }} />
              </TableFooter>
            ) : null}
          </Table>
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
        <People
          title="Stood out"
          description="Most points earned this week."
          icon={Trophy}
          rows={r.top}
          empty="Nobody finished a task this week yet."
          detail={(s) => `${s.points} points · ${s.done} finished`}
          testId="report-top"
        />
        <People
          title="Needs a nudge"
          description="Quiet, behind, or nothing finished. A message from their lead helps."
          icon={TriangleAlert}
          rows={r.attention}
          empty="Everyone's on track."
          detail={(s) => `${s.reason ?? ""}${s.overdue > 0 ? ` · ${s.overdue} overdue` : ""}`}
          testId="report-attention"
        />
      </div>
    </>
  );
}

function GroupRow({ g }: { g: ReportGroup }) {
  return (
    <TableRow>
      <TableCell>
        <span className="font-medium">{g.cohort}</span>
        {g.college ? <span className="text-muted-foreground block text-xs">{g.college}</span> : null}
      </TableCell>
      <TableCell className="text-right tabular-nums">{g.students}</TableCell>
      <TableCell className="text-right tabular-nums">{g.done}</TableCell>
      <TableCell className="text-right tabular-nums">{g.done > 0 ? `${g.on_time_percent}%` : "—"}</TableCell>
      <TableCell className="text-right tabular-nums">{g.hand_ins}</TableCell>
      <TableCell className="text-right tabular-nums">{g.certificates}</TableCell>
      <TableCell className={cn("text-right tabular-nums", g.inactive > 0 && "text-warning font-medium")}>{g.inactive}</TableCell>
      <TableCell className="text-right tabular-nums">{g.avg_completion}%</TableCell>
    </TableRow>
  );
}

function People({
  title,
  description,
  icon: Icon,
  rows,
  empty,
  detail,
  testId,
}: {
  title: string;
  description: string;
  icon: typeof Trophy;
  rows: ReportStudent[];
  empty: string;
  detail: (s: ReportStudent) => string;
  testId: string;
}) {
  return (
    <Card className="break-inside-avoid" data-testid={testId}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="text-muted-foreground size-4" aria-hidden /> {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{empty}</p>
        ) : (
          <ol className="flex flex-col divide-y">
            {rows.map((s, i) => (
              <li key={s.github_login} className="animate-enter-stagger flex items-center gap-3 py-2 text-sm" style={stagger(i)}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    @{s.github_login} · {s.cohort}
                  </span>
                </span>
                <span className="text-muted-foreground shrink-0 text-right text-xs">{detail(s)}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
