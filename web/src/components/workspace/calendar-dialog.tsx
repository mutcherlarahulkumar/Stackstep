"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronRight, Gift, Lock, Video } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { messageFor } from "@/lib/api/errors";
import { type CalendarEntry, type Persona } from "@/lib/api/schemas";
import { entryLine, groupByDay, parseDay, todayIn, weeksBetween } from "@/lib/calendar";
import { useSession } from "@/lib/session";
import { useIsDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";

import { TYPE_ICON } from "../app/task-badges";
import { EmptyState, ErrorState, ListSkeleton } from "../app/state";

export function useCalendar(enabled: boolean) {
  const { api } = useSession();
  // Refetched every time the calendar opens: tasks land through the day.
  return useQuery({ queryKey: ["calendar"], queryFn: () => api.calendar(), enabled, staleTime: 0 });
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Header button and dialog with the internship by day. Opening a released task hands it to the board. */
export function CalendarButton({ personas, onOpenTask }: { personas: readonly Persona[]; onOpenTask: (taskId: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 rounded-full" data-testid="open-calendar" aria-label="Your calendar">
          <CalendarDays aria-hidden />
          <span className="hidden md:inline">Calendar</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-4 sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Your calendar</DialogTitle>
          <DialogDescription>
            Tasks show up here ahead of time, with the moment they arrive. Surprise tasks only show the day, so keep an eye out.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <CalendarBody
            personas={personas}
            onOpenTask={(id) => {
              setOpen(false);
              onOpenTask(id);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CalendarBody({ personas, onOpenTask }: { personas: readonly Persona[]; onOpenTask: (taskId: string) => void }) {
  const q = useCalendar(true);
  const desktop = useIsDesktop();
  const byDay = useMemo(() => groupByDay(q.data?.items ?? []), [q.data]);
  const [now] = useState(() => new Date());
  if (q.isPending) return <ListSkeleton rows={4} className="h-24" />;
  if (q.isError) return <ErrorState message={messageFor(q.error)} onRetry={() => void q.refetch()} />;
  const cal = q.data;
  if (cal.items.length === 0) {
    return (
      <EmptyState icon={CalendarDays} title="Nothing scheduled yet">
        Your days fill in once your flow is assigned. Your team lead will tell you in chat.
      </EmptyState>
    );
  }
  const today = todayIn(cal.timezone, now);
  const names = new Map(personas.map((p) => [p.id, p.name]));
  return desktop ? (
    <MonthGrid start={cal.start_date} end={cal.end_date} today={today} byDay={byDay} timeZone={cal.timezone} names={names} onOpenTask={onOpenTask} />
  ) : (
    <Agenda today={today} byDay={byDay} timeZone={cal.timezone} names={names} onOpenTask={onOpenTask} />
  );
}

type ViewProps = { today: string; byDay: Map<string, CalendarEntry[]>; timeZone: string; names: Map<string, string>; onOpenTask: (taskId: string) => void };

function dayLabel(d: string, today: string): string {
  if (d === today) return "Today";
  const t = parseDay(today);
  t.setUTCDate(t.getUTCDate() + 1);
  if (t.toISOString().slice(0, 10) === d) return "Tomorrow";
  return parseDay(d).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "short" });
}

/** Desktop: the whole internship as weeks, with the picked day's details beside it. */
function MonthGrid({ start, end, today, byDay, timeZone, names, onOpenTask }: ViewProps & { start: string; end: string }) {
  const weeks = useMemo(() => weeksBetween(start, end), [start, end]);
  const first = [...byDay.keys()].find((d) => d >= today) ?? today;
  const [picked, setPicked] = useState(first);
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_20rem] gap-4 overflow-hidden">
      <div className="min-h-0 overflow-y-auto pr-1" role="grid" aria-label="Internship calendar">
        <div className="text-muted-foreground grid grid-cols-7 gap-1 pb-1 text-center text-xs font-medium" role="row">
          {WEEKDAYS.map((w) => (
            <span key={w} role="columnheader">
              {w}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          {weeks.map((week) => (
            <div key={week[0]} className="grid grid-cols-7 gap-1" role="row">
              {week.map((d) => {
                const entries = byDay.get(d) ?? [];
                const inside = d >= start && d <= end;
                const n = parseDay(d).getUTCDate();
                return (
                  <button
                    key={d}
                    type="button"
                    role="gridcell"
                    aria-selected={picked === d}
                    aria-label={`${dayLabel(d, today)}, ${entries.length} ${entries.length === 1 ? "item" : "items"}`}
                    onClick={() => setPicked(d)}
                    disabled={!inside}
                    data-testid={`calendar-cell-${d}`}
                    className={cn(
                      "group flex h-24 min-w-0 flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors",
                      "focus-visible:ring-ring/60 outline-none focus-visible:ring-2",
                      inside ? "bg-card hover:bg-accent/60" : "bg-muted/30 border-dashed opacity-50",
                      picked === d && "border-primary ring-primary/30 ring-2",
                    )}
                  >
                    <span className={cn("flex items-center gap-1 text-xs tabular-nums", d === today && "text-primary font-semibold")}>
                      <span className={cn("grid size-5 place-items-center rounded-full", d === today && "bg-primary text-primary-foreground")}>{n}</span>
                      {entries[0]?.day ? <span className="text-muted-foreground">Day {entries[0].day}</span> : null}
                    </span>
                    {entries.slice(0, 2).map((e, i) => (
                      <EntryPill key={`${e.task_id ?? e.title ?? e.kind}-${i}`} e={e} />
                    ))}
                    {entries.length > 2 ? <span className="text-muted-foreground text-[11px]">+{entries.length - 2} more</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <aside className="bg-muted/30 min-h-0 overflow-y-auto rounded-xl border p-3" aria-label="Day details">
        <DayList d={picked} today={today} entries={byDay.get(picked) ?? []} timeZone={timeZone} names={names} onOpenTask={onOpenTask} />
      </aside>
    </div>
  );
}

function EntryPill({ e }: { e: CalendarEntry }) {
  if (e.kind === "surprise") {
    return (
      <span className="border-primary/50 text-primary bg-primary/5 flex items-center gap-1 truncate rounded border border-dashed px-1 py-0.5 text-[11px]">
        <Gift className="size-3 shrink-0" aria-hidden /> Surprise
      </span>
    );
  }
  const Icon = e.kind === "class" ? Video : e.task_type ? TYPE_ICON[e.task_type] : CalendarDays;
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-[11px]",
        e.status === "done" ? "bg-success/12 text-success-strong line-through decoration-1" : e.released ? "bg-primary/12 text-primary" : "bg-secondary text-secondary-foreground",
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{e.title}</span>
    </span>
  );
}

/** Phones: an agenda from today on, with earlier days folded away. */
function Agenda({ today, byDay, timeZone, names, onOpenTask }: ViewProps) {
  const [showPast, setShowPast] = useState(false);
  const days = [...byDay.keys()];
  const past = days.filter((d) => d < today).length;
  const shown = days.filter((d) => showPast || d >= today);
  return (
    <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
      {past > 0 ? (
        <Button variant="ghost" size="sm" className="mb-2" onClick={() => setShowPast((v) => !v)} data-testid="calendar-past">
          {showPast ? "Hide earlier days" : `Show ${past} earlier ${past === 1 ? "day" : "days"}`}
        </Button>
      ) : null}
      <div className="flex flex-col gap-5">
        {shown.map((d) => (
          <DayList key={d} d={d} today={today} entries={byDay.get(d) ?? []} timeZone={timeZone} names={names} onOpenTask={onOpenTask} />
        ))}
      </div>
    </div>
  );
}

function DayList({ d, today, entries, timeZone, names, onOpenTask }: { d: string; entries: CalendarEntry[] } & Omit<ViewProps, "byDay">) {
  return (
    <section aria-label={dayLabel(d, today)} data-testid={`calendar-day-${d}`}>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {dayLabel(d, today)}
        {entries[0]?.day ? (
          <Badge variant="outline" className="font-normal">
            Day {entries[0].day}
          </Badge>
        ) : null}
      </h3>
      {entries.length === 0 ? <p className="text-muted-foreground text-sm">Nothing scheduled. A good day to catch up or read ahead.</p> : null}
      <ul className="flex flex-col gap-2">
        {entries.map((e, i) => (
          <li key={`${e.task_id ?? e.title ?? e.kind}-${i}`}>
            <EntryRow e={e} timeZone={timeZone} persona={e.persona_id ? names.get(e.persona_id) : undefined} onOpenTask={onOpenTask} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function EntryRow({ e, timeZone, persona, onOpenTask }: { e: CalendarEntry; timeZone: string; persona?: string; onOpenTask: (id: string) => void }) {
  const line = entryLine(e, timeZone);
  if (e.kind === "surprise") {
    return (
      <div className="border-primary/50 bg-primary/5 flex items-center gap-3 rounded-lg border border-dashed p-3 text-sm" data-testid="calendar-surprise">
        <Gift className="text-primary size-4 shrink-0" aria-hidden />
        {line}
      </div>
    );
  }
  const Icon = e.kind === "class" ? Video : e.task_type ? TYPE_ICON[e.task_type] : CalendarDays;
  const body = (
    <>
      <Icon className={cn("size-4 shrink-0", e.released ? "text-primary" : "text-muted-foreground")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{e.title}</span>
        <span className="text-muted-foreground block text-xs">{persona ? `${line} · ${persona}` : line}</span>
      </span>
    </>
  );
  const taskId = e.task_id;
  if (e.class_id) {
    return (
      <Link
        href={`/classes/${e.class_id}`}
        className="bg-card hover:bg-accent/60 focus-visible:ring-ring/60 flex w-full items-center gap-3 rounded-lg border border-rose-500/30 p-3 text-left text-sm outline-none focus-visible:ring-2"
        data-testid={`calendar-entry-${e.title ?? ""}`}
      >
        {body}
        <ChevronRight className="text-muted-foreground size-4" aria-hidden />
      </Link>
    );
  }
  return taskId ? (
    <button
      type="button"
      onClick={() => onOpenTask(taskId)}
      className="bg-card hover:bg-accent/60 focus-visible:ring-ring/60 flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm outline-none focus-visible:ring-2"
      data-testid={`calendar-entry-${e.title ?? ""}`}
    >
      {body}
      <ChevronRight className="text-muted-foreground size-4" aria-hidden />
    </button>
  ) : (
    <div className="bg-card flex items-center gap-3 rounded-lg border p-3 text-sm" data-testid={`calendar-entry-${e.title ?? ""}`}>
      {body}
      <Lock className="text-muted-foreground size-3.5" aria-label="Opens when it arrives" />
    </div>
  );
}
