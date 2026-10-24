"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, BadgeCheck, BellRing, CreditCard, Download, FileImage, GitPullRequest, Search, Sparkles, Users, type LucideIcon } from "lucide-react";
import { useDeferredValue, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { messageFor } from "@/lib/api/errors";
import { type Overview, type OverviewRow, type Student } from "@/lib/api/schemas";
import { formatCode } from "@/lib/certificate";
import { saveBlob } from "@/lib/download";
import { FILTER_LABEL, isOverviewFilter, lastActiveLabel, matchesFilter, NUDGE_DRAFT, OVERVIEW_FILTERS, sortRows, type OverviewFilter, type Sort, type SortKey } from "@/lib/overview";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { Bounds } from "@/lib/validation";

import { PAGE, PageHeader } from "../app/page-header";
import { choiceItem } from "../app/choice";
import { TableSkeleton } from "../app/loading";
import { EmptyState, ErrorState } from "../app/state";
import { AdminShell } from "./admin-shell";
import { BroadcastDialog } from "./broadcast-dialog";
import { StudentDetail } from "./review";
import { normalizeLineSafe } from "./util";

export function OverviewScreen() {
  return <AdminShell section="overview" phone="gate">{() => <OverviewPage />}</AdminShell>;
}

function OverviewPage() {
  const { api } = useSession();
  const [raw, setRaw] = useState("");
  const q = useDeferredValue(normalizeLineSafe(raw));
  const [filter, setFilter] = useState<OverviewFilter>("all");
  const [sort, setSort] = useState<Sort>({ key: "name", dir: "asc" });
  const [open, setOpen] = useState<Student | null>(null);
  const [nudge, setNudge] = useState<{ key: number; students: Student[] } | null>(null);
  const [exporting, setExporting] = useState(false);
  const data = useQuery({ queryKey: ["overview", q], queryFn: () => api.overview(q), placeholderData: (prev) => prev });

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await api.exportOverview(q);
      saveBlob(blob, filename);
      toast.success(`Downloaded ${filename}`);
    } catch (e) {
      toast.error(messageFor(e));
    } finally {
      setExporting(false);
    }
  };

  const o = data.data;
  const rows = o ? sortRows(o.items.filter((r) => matchesFilter(r, filter)), sort) : [];
  const inactive = o ? o.items.filter((r) => r.inactive).map((r) => r.student) : [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={cn(PAGE, "gap-6")}>
        <PageHeader title="Placement overview" description="Every student you manage, with progress, activity and certificates.">
          <div className="flex flex-wrap items-center gap-2">
            <InputGroup className="w-64">
              <InputGroupAddon>
                <Search aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                value={raw}
                maxLength={Bounds.searchMax}
                onChange={(e) => setRaw(e.target.value)}
                placeholder="Search name or GitHub login"
                aria-label="Search students"
                type="search"
                data-testid="overview-search"
              />
            </InputGroup>
            <Button variant="outline" onClick={() => void exportCsv()} disabled={exporting || !o || o.items.length === 0} data-testid="export-csv">
              {exporting ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" aria-hidden />} Export CSV
            </Button>
            <Button onClick={() => setNudge({ key: Date.now(), students: inactive })} disabled={inactive.length === 0} data-testid="open-nudge">
              <BellRing data-icon="inline-start" aria-hidden /> Nudge {inactive.length > 0 ? inactive.length : ""} inactive
            </Button>
          </div>
        </PageHeader>

        {data.isPending ? (
          <TableSkeleton rows={6} cols={6} />
        ) : data.isError ? (
          <ErrorState message={messageFor(data.error)} onRetry={() => void data.refetch()} />
        ) : o ? (
          <>
            <Summary o={o} />
            {o.truncated ? (
              <Alert>
                <AlertDescription>Showing the first 1,000 students. Search to narrow the list; the CSV has the same rows.</AlertDescription>
              </Alert>
            ) : null}
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={filter}
              onValueChange={(v) => {
                if (isOverviewFilter(v)) setFilter(v);
              }}
              aria-label="Show"
              className="flex-wrap"
            >
              {OVERVIEW_FILTERS.map((f) => (
                <ToggleGroupItem key={f} value={f} className={choiceItem} data-testid={`filter-${f}`}>
                  {FILTER_LABEL[f]}
                  <span className="text-muted-foreground tabular-nums">{o.items.filter((r) => matchesFilter(r, f)).length}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {o.items.length === 0 ? (
              <EmptyState icon={Users} title={q ? "No students match" : "No students yet"}>
                {q ? "Try a different name or GitHub login." : "Students appear here once they're enrolled."}
              </EmptyState>
            ) : rows.length === 0 ? (
              <EmptyState icon={BadgeCheck} title={`No one is “${FILTER_LABEL[filter].toLowerCase()}”`}>
                Pick another filter to see more students.
              </EmptyState>
            ) : (
              <CohortTable rows={rows} sort={sort} onSort={setSort} onOpen={setOpen} now={o.generated_at} />
            )}
          </>
        ) : null}

        <ComingSoon />
      </div>

      <Sheet open={open !== null} onOpenChange={(v) => (v ? null : setOpen(null))}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-4xl">
          <SheetHeader className="sr-only">
            <SheetTitle>{open?.user.name ?? "Student"}</SheetTitle>
            <SheetDescription>Board, review and certificate</SheetDescription>
          </SheetHeader>
          {/* Right padding keeps the sheet's close button clear of the header actions. */}
          {open ? (
            <div className="flex min-h-0 flex-1 flex-col pr-10">
              <StudentDetail key={open.enrollment.id} student={open} />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
      {nudge ? (
        <BroadcastDialog
          key={nudge.key}
          open
          onOpenChange={(v) => (v ? null : setNudge(null))}
          preset={{ title: `Nudge ${nudge.students.length} inactive ${nudge.students.length === 1 ? "student" : "students"}`, students: nudge.students, body: NUDGE_DRAFT }}
        />
      ) : null}
    </div>
  );
}

function Summary({ o }: { o: Overview }) {
  const s = o.summary;
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="overview-summary">
      <Stat label="Students" value={s.students} hint={`${s.active} active`} />
      <Stat label="Average completion" value={`${s.avg_completion}%`} hint="Done ÷ released tasks" />
      <Stat label="Inactive" value={s.inactive} hint={`Quiet ${o.inactive_after_hours}h or more`} warn={s.inactive > 0} />
      <Stat label="Overdue tasks" value={s.overdue_tasks} hint="Open past their due time" warn={s.overdue_tasks > 0} />
      <Stat label="Certificates" value={s.certificates} hint="Valid, issued by hand" />
    </dl>
  );
}

function Stat({ label, value, hint, warn = false }: { label: string; value: ReactNode; hint: string; warn?: boolean }) {
  return (
    <div className="bg-card rounded-xl border px-4 py-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={cn("text-2xl font-semibold tabular-nums", warn && "text-destructive")}>{value}</dd>
      <dd className="text-muted-foreground text-xs">{hint}</dd>
    </div>
  );
}

const COLUMNS: { key: SortKey | null; label: string; className?: string }[] = [
  { key: "name", label: "Student" },
  { key: null, label: "Day" },
  { key: "completion", label: "Progress", className: "w-48" },
  { key: "overdue", label: "Overdue", className: "text-right" },
  { key: "points", label: "Points", className: "text-right" },
  { key: null, label: "Credits", className: "text-right" },
  { key: "last_active", label: "Last active" },
  { key: null, label: "Certificate" },
];

function CohortTable({ rows, sort, onSort, onOpen, now }: { rows: OverviewRow[]; sort: Sort; onSort: (s: Sort) => void; onOpen: (s: Student) => void; now: Date }) {
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c) => (
              <TableHead key={c.label} className={c.className} aria-sort={c.key && sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                {c.key ? (
                  <button
                    type="button"
                    className={cn("hover:text-foreground inline-flex items-center gap-1", c.className?.includes("text-right") && "flex-row-reverse")}
                    onClick={() => {
                      const key = c.key;
                      if (key) onSort({ key, dir: sort.key === key && sort.dir === "asc" ? "desc" : "asc" });
                    }}
                  >
                    {c.label}
                    {sort.key === c.key ? sort.dir === "asc" ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden /> : null}
                  </button>
                ) : (
                  c.label
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const s = r.student;
            return (
              <TableRow key={s.enrollment.id} data-testid={`overview-row-${s.user.github_login}`}>
                <TableCell className="max-w-64">
                  <button type="button" onClick={() => onOpen(s)} className="flex flex-col items-start text-left hover:underline">
                    <span className="truncate font-medium">{s.user.name}</span>
                    <span className="text-muted-foreground truncate text-xs">
                      @{s.user.github_login} · {s.enrollment.program.slug}
                    </span>
                  </button>
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap tabular-nums">
                  {s.enrollment.status === "paused" ? <Badge variant="outline">Paused</Badge> : `${s.enrollment.day_number}/${s.enrollment.program.days}`}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={r.completion_percent} className="w-20" aria-label={`${r.completion_percent}% done`} />
                    <span className="text-xs tabular-nums">
                      {r.completion_percent}% <span className="text-muted-foreground">· {r.done}/{r.released}</span>
                    </span>
                  </div>
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", r.overdue > 0 && "text-destructive font-medium")}>{r.overdue}</TableCell>
                <TableCell className="text-right tabular-nums">{r.points}</TableCell>
                <TableCell className="text-right tabular-nums">{r.credits}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {r.inactive ? (
                    <Badge variant="destructive" data-testid="inactive-badge">
                      {lastActiveLabel(r.last_active_at, now)}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">{lastActiveLabel(r.last_active_at, now)}</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {r.certificate ? (
                    <span className={cn("inline-flex items-center gap-1 font-mono text-xs", r.certificate.status === "revoked" && "text-muted-foreground line-through")}>
                      {r.certificate.status === "valid" ? <BadgeCheck className="text-success size-3.5" aria-hidden /> : null}
                      {formatCode(r.certificate.code)}
                      <span className="sr-only">{r.certificate.status}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

const SOON: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: CreditCard, title: "Payments (Razorpay)", body: "Paid seats, college bulk seats and invoices. Enrollment is manual for now." },
  { icon: GitPullRequest, title: "GitHub PR checks", body: "Automatic checks and hidden tests on every pull request. Review links by hand for now." },
  { icon: Sparkles, title: "AI review suggestions", body: "Draft review notes for admins to edit. Reviews are fully manual for now." },
  { icon: FileImage, title: "Certificate artwork (Orshot)", body: "Designed certificate images and share cards. The printable certificate works today." },
];

function ComingSoon() {
  return (
    <section aria-labelledby="coming-soon" className="flex flex-col gap-3">
      <h2 id="coming-soon" className="text-muted-foreground text-sm font-medium">
        Coming soon
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SOON.map((c) => (
          <Card key={c.title} className="gap-0 border-dashed py-4 shadow-none">
            <CardHeader className="px-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <c.icon className="text-muted-foreground size-4" aria-hidden /> {c.title}
                <Badge variant="outline" className="ml-auto">
                  Soon
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">{c.body}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  );
}
