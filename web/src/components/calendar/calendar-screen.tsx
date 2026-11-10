"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Gift,
  Lock,
  SquareKanban,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar as MiniMonth } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { messageFor } from "@/lib/api/errors";
import { type CalendarEntry, type Me } from "@/lib/api/schemas";
import {
  addDays,
  daysOf,
  entryLine,
  groupByDay,
  layoutDay,
  minutesIn,
  parseDay,
  rangeTitle,
  shift,
  timeIn,
  todayIn,
  untimed,
  type View,
} from "@/lib/calendar";
import { useStudentThreads } from "@/lib/inbox-queries";
import { RealtimeProvider } from "@/lib/realtime-context";
import { useSession } from "@/lib/session";
import { useIsDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";

import { AppHeader } from "../app/app-header";
import { RequireSession } from "../app/guard";
import { TYPE_ICON } from "../app/task-badges";
import { EmptyState, ErrorState, ListSkeleton } from "../app/state";
import { HelpWidget } from "../help/help-widget";

export function useCalendar() {
  const { api } = useSession();
  // Tasks land through the day, so the calendar refreshes whenever it is shown.
  return useQuery({
    queryKey: ["calendar"],
    queryFn: () => api.calendar(),
    staleTime: 0,
    refetchInterval: 5 * 60_000,
  });
}

type Mode = View | "agenda";
const MODES: { value: Mode; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "agenda", label: "Agenda" },
];
const HOUR = 52;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarScreen() {
  return (
    <RequireSession audience="student">
      {(me) =>
        me.enrollment ? (
          <RealtimeProvider>
            <CalendarView me={me} />
          </RealtimeProvider>
        ) : (
          <NoInternship me={me} />
        )
      }
    </RequireSession>
  );
}

function Shell({ me, children }: { me: Me; children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <AppHeader user={me.user}>
        <span className="bg-border hidden h-5 w-px sm:block" aria-hidden />
        <Button asChild variant="ghost" size="sm">
          <Link href={me.enrollment ? "/workspace" : "/"}>
            <ArrowLeft data-icon="inline-start" aria-hidden />{" "}
            {me.enrollment ? "Workspace" : "Home"}
          </Link>
        </Button>
      </AppHeader>
      <main id="main" className="flex min-h-0 flex-1 flex-col">
        {children}
      </main>
      <HelpWidget />
    </div>
  );
}

function NoInternship({ me }: { me: Me }) {
  return (
    <Shell me={me}>
      <div className="grid flex-1 place-items-center p-6">
        <EmptyState
          icon={CalendarDays}
          title="Your calendar starts with your internship"
        >
          Once you are admitted, your tasks and live classes show up here day by
          day.
        </EmptyState>
      </div>
    </Shell>
  );
}

function CalendarView({ me }: { me: Me }) {
  const q = useCalendar();
  const threads = useStudentThreads();
  const desktop = useIsDesktop();
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const timeZone =
    q.data?.timezone ?? me.enrollment?.timezone ?? "Asia/Kolkata";
  const today = todayIn(timeZone, now);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [picked, setPicked] = useState<Mode | null>(null);
  const mode: Mode = picked ?? (desktop ? "week" : "day");
  const day = anchor ?? today;
  const byDay = useMemo(() => groupByDay(q.data?.items ?? []), [q.data]);
  const names = useMemo(
    () =>
      new Map((threads.data ?? []).map((t) => [t.persona.id, t.persona.name])),
    [threads.data],
  );
  const openTask = (id: string) => router.push(`/workspace?task=${id}`);
  const go = (d: string, m?: Mode) => {
    setAnchor(d);
    if (m) setPicked(m);
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 sm:px-4">
      <Button
        variant="outline"
        size="sm"
        className="rounded-full"
        onClick={() => setAnchor(null)}
        data-testid="calendar-today"
      >
        Today
      </Button>
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          aria-label="Previous"
          onClick={() =>
            setAnchor(shift(mode === "agenda" ? "week" : mode, day, -1))
          }
        >
          <ChevronLeft aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          aria-label="Next"
          onClick={() =>
            setAnchor(shift(mode === "agenda" ? "week" : mode, day, 1))
          }
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
      <h1
        className="order-first min-w-0 basis-full truncate text-base font-semibold sm:order-none sm:flex-1 sm:basis-auto sm:text-lg"
        aria-live="polite"
        data-testid="calendar-title"
      >
        {rangeTitle(mode === "agenda" ? "month" : mode, day)}
      </h1>
      <ToggleGroup
        className="ml-auto"
        type="single"
        size="sm"
        variant="outline"
        value={mode}
        onValueChange={(v) =>
          v && setPicked(MODES.find((m) => m.value === v)?.value ?? "week")
        }
        aria-label="View"
      >
        {MODES.filter((m) => desktop || m.value !== "week").map((m) => (
          <ToggleGroupItem
            key={m.value}
            value={m.value}
            data-testid={`calendar-view-${m.value}`}
          >
            {m.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );

  let body: ReactNode;
  if (q.isPending || desktop === null) {
    body = (
      <div className="p-4">
        <ListSkeleton rows={6} className="h-14" />
      </div>
    );
  } else if (q.isError) {
    body = (
      <div className="p-4">
        <ErrorState
          message={messageFor(q.error)}
          onRetry={() => void q.refetch()}
        />
      </div>
    );
  } else if (q.data.items.length === 0) {
    body = (
      <div className="grid flex-1 place-items-center p-6">
        <EmptyState icon={CalendarDays} title="Nothing scheduled yet">
          Your days fill in once your flow is assigned. Your team lead will tell
          you in chat.
        </EmptyState>
      </div>
    );
  } else {
    const ctx: Ctx = { today, now, timeZone, byDay, names, openTask };
    body =
      mode === "month" ? (
        <MonthView anchor={day} ctx={ctx} onDay={(d) => go(d, "day")} />
      ) : mode === "agenda" ? (
        <AgendaView ctx={ctx} />
      ) : (
        <TimeGrid
          days={daysOf(mode, day)}
          ctx={ctx}
          onDay={(d) => go(d, "day")}
          head={desktop || mode !== "day"}
        />
      );
  }

  return (
    <Shell me={me}>
      {toolbar}
      {!desktop && mode === "day" ? (
        <WeekStrip
          anchor={day}
          ctx={{ today, byDay }}
          onPick={(d) => setAnchor(d)}
        />
      ) : null}
      <div className="flex min-h-0 flex-1">
        {desktop && q.data ? (
          <aside
            className="hidden w-[17.5rem] shrink-0 flex-col gap-4 overflow-y-auto border-r p-3 lg:flex"
            aria-label="Pick a date"
          >
            <MiniMonth
              mode="single"
              weekStartsOn={1}
              selected={toLocal(day)}
              month={toLocal(day)}
              onMonthChange={(m) => setAnchor(fromLocal(m))}
              onSelect={(d) => d && setAnchor(fromLocal(d))}
              modifiers={{ busy: [...byDay.keys()].map(toLocal) }}
              modifiersClassNames={{
                busy: "font-semibold [&>button]:underline [&>button]:decoration-primary [&>button]:decoration-2 [&>button]:underline-offset-4",
              }}
              className="mx-auto rounded-lg border p-2 [--cell:--spacing(8)]"
            />
            <Legend />
            <UpNext
              items={q.data.items}
              now={now}
              timeZone={timeZone}
              onPick={(d) =>
                go(d, mode === "month" || mode === "agenda" ? "day" : undefined)
              }
            />
          </aside>
        ) : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{body}</div>
      </div>
    </Shell>
  );
}

const toLocal = (d: string) => {
  const p = parseDay(d);
  return new Date(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate());
};
const fromLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Ctx = {
  today: string;
  now: Date;
  timeZone: string;
  byDay: Map<string, CalendarEntry[]>;
  names: Map<string, string>;
  openTask: (id: string) => void;
};

function tone(e: CalendarEntry): string {
  if (e.kind === "class")
    return "border-rose-500/50 bg-rose-500/15 text-rose-900 dark:text-rose-100";
  if (e.kind === "surprise")
    return "border-primary/60 border-dashed bg-primary/5 text-primary";
  if (e.status === "done")
    return "border-success/40 bg-success/12 text-success-strong";
  if (e.released) return "border-primary/50 bg-primary/15 text-foreground";
  return "border-border bg-muted text-muted-foreground";
}

function EntryIcon({ e, className }: { e: CalendarEntry; className?: string }) {
  const Icon =
    e.kind === "class"
      ? Video
      : e.kind === "surprise"
        ? Gift
        : e.task_type
          ? TYPE_ICON[e.task_type]
          : CalendarDays;
  return <Icon className={cn("size-3.5 shrink-0", className)} aria-hidden />;
}

/** The details card that opens from an event, with what you can do with it. */
function Details({ e, ctx }: { e: CalendarEntry; ctx: Ctx }) {
  const persona = e.persona_id ? ctx.names.get(e.persona_id) : undefined;
  const taskId = e.task_id;
  return (
    <div className="flex flex-col gap-3" data-testid="calendar-details">
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border",
            tone(e),
          )}
        >
          <EntryIcon e={e} />
        </span>
        <div className="min-w-0">
          <p className="font-semibold leading-snug">
            {e.kind === "surprise" ? "Surprise task" : e.title}
          </p>
          <p className="text-muted-foreground text-xs">
            {parseDay(e.date).toLocaleDateString("en-GB", {
              timeZone: "UTC",
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
            {e.day ? ` · Day ${e.day}` : ""}
          </p>
        </div>
      </div>
      <p className="text-sm">{entryLine(e, ctx.timeZone)}</p>
      {e.kind === "class" && e.at && e.due_at ? (
        <p className="text-muted-foreground text-xs">
          {timeIn(e.at, ctx.timeZone)} to {timeIn(e.due_at, ctx.timeZone)}
        </p>
      ) : null}
      {e.kind === "task" && e.due_at ? (
        <p className="text-muted-foreground text-xs">
          Due{" "}
          {e.due_at.toLocaleString([], {
            timeZone: ctx.timeZone,
            weekday: "short",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      ) : null}
      {persona ? (
        <p className="text-muted-foreground text-xs">From {persona}</p>
      ) : null}
      {e.class_id ? (
        <Button asChild size="sm" data-testid="calendar-join-class">
          <Link href={`/classes/${e.class_id}`}>
            <Video data-icon="inline-start" aria-hidden /> Join the class
          </Link>
        </Button>
      ) : taskId ? (
        <Button
          size="sm"
          onClick={() => ctx.openTask(taskId)}
          data-testid="calendar-open-task"
        >
          <SquareKanban data-icon="inline-start" aria-hidden /> Open the task
        </Button>
      ) : e.kind === "task" ? (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Lock className="size-3.5" aria-label="Opens when it arrives" /> Opens
          when it arrives
        </p>
      ) : null}
    </div>
  );
}

/** A clickable event: a block on the timeline or a pill in the month. */
function Event({
  e,
  ctx,
  className,
  style,
  children,
}: {
  e: CalendarEntry;
  ctx: Ctx;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          style={style}
          className={cn(
            "focus-visible:ring-ring/60 min-w-0 overflow-hidden rounded-md border text-left outline-none focus-visible:ring-2",
            tone(e),
            className,
          )}
          data-testid={`calendar-entry-${e.kind === "surprise" ? "surprise" : (e.title ?? "")}`}
          aria-label={`${e.kind === "surprise" ? "Surprise task" : e.title}, ${entryLine(e, ctx.timeZone)}`}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <Details e={e} ctx={ctx} />
      </PopoverContent>
    </Popover>
  );
}

function hourLabel(h: number): string {
  if (h === 0) return "";
  return new Date(2000, 0, 1, h).toLocaleTimeString("en-US", {
    hour: "numeric",
  });
}

/** Day and week: an hour timeline with timed blocks, a now line and an all-day lane. */
function TimeGrid({
  days,
  ctx,
  onDay,
  head,
}: {
  days: string[];
  ctx: Ctx;
  onDay: (d: string) => void;
  head: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const nowMin = minutesIn(ctx.now, ctx.timeZone);
  const key = days.join();
  // Open on the busy part of the day: an hour before now, or the first event.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const tops = days.flatMap((d) =>
      layoutDay(ctx.byDay.get(d) ?? [], ctx.timeZone).map((p) => p.top),
    );
    const target = days.includes(ctx.today)
      ? nowMin - 60
      : tops.length
        ? Math.min(...tops) - 60
        : 8 * 60;
    el.scrollTop = Math.max(0, (target / 60) * HOUR);
    // Only when the range changes, not on every tick of the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const allDay = days.map((d) => untimed(ctx.byDay.get(d) ?? []));
  const anyAllDay = allDay.some((a) => a.length > 0);
  const cols = `3.5rem repeat(${days.length}, minmax(0, 1fr))`;
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      role="grid"
      aria-label="Timeline"
      data-testid="calendar-timeline"
    >
      <div
        className={cn(
          "grid overflow-y-hidden border-b [scrollbar-gutter:stable]",
          !head && "sr-only",
        )}
        style={{ gridTemplateColumns: cols }}
        role="row"
      >
        <span aria-hidden />
        {days.map((d) => {
          const p = parseDay(d);
          const isToday = d === ctx.today;
          const dayNo = ctx.byDay.get(d)?.[0]?.day;
          return (
            <button
              key={d}
              type="button"
              role="columnheader"
              onClick={() => onDay(d)}
              className="hover:bg-accent/50 flex flex-col items-center gap-0.5 py-2 outline-none focus-visible:ring-2"
              data-testid={`calendar-col-${d}`}
            >
              <span
                className={cn(
                  "text-[11px] font-medium uppercase",
                  isToday ? "text-primary" : "text-muted-foreground",
                )}
              >
                {WEEKDAYS[(p.getUTCDay() + 6) % 7]}
              </span>
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-full text-lg tabular-nums",
                  isToday && "bg-primary text-primary-foreground font-semibold",
                )}
              >
                {p.getUTCDate()}
              </span>
              {dayNo ? (
                <span className="text-muted-foreground text-[10px]">
                  Day {dayNo}
                </span>
              ) : (
                <span className="h-[15px]" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
      {anyAllDay ? (
        <div
          className="grid overflow-y-hidden border-b [scrollbar-gutter:stable]"
          style={{ gridTemplateColumns: cols }}
          role="row"
          aria-label="All day"
        >
          <span className="text-muted-foreground self-center pr-2 text-right text-[10px]">
            All day
          </span>
          {allDay.map((list, i) => (
            <div
              key={days[i]}
              className="flex min-w-0 flex-col gap-1 border-l p-1"
            >
              {list.map((e, j) => (
                <Event
                  key={j}
                  e={e}
                  ctx={ctx}
                  className="flex items-center gap-1 px-1.5 py-0.5 text-[11px]"
                >
                  <EntryIcon e={e} />{" "}
                  <span className="truncate">Surprise task</span>
                </Event>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      <div
        ref={scroller}
        className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
        data-testid="calendar-scroll"
      >
        <div
          className="relative grid"
          style={{ gridTemplateColumns: cols, height: 24 * HOUR }}
        >
          <div className="relative" aria-hidden>
            {Array.from({ length: 24 }, (_, h) => (
              <span
                key={h}
                className="text-muted-foreground absolute right-2 -translate-y-1/2 text-[10px] tabular-nums"
                style={{ top: h * HOUR }}
              >
                {hourLabel(h)}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const placed = layoutDay(ctx.byDay.get(d) ?? [], ctx.timeZone);
            const isToday = d === ctx.today;
            const past = d < ctx.today;
            return (
              <div
                key={d}
                className={cn("relative border-l", past && "bg-muted/25")}
                role="gridcell"
                aria-label={parseDay(d).toLocaleDateString("en-GB", {
                  timeZone: "UTC",
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <span
                    key={h}
                    className="border-border/70 absolute inset-x-0 border-t"
                    style={{ top: h * HOUR }}
                    aria-hidden
                  />
                ))}
                {placed.map((p, i) => {
                  const e = p.entry;
                  const h = (p.height / 60) * HOUR;
                  return (
                    <Event
                      key={`${e.task_id ?? e.class_id ?? i}`}
                      e={e}
                      ctx={ctx}
                      className={cn(
                        "absolute flex flex-col px-1.5 py-0.5 text-xs shadow-sm transition-shadow hover:z-10 hover:shadow-md",
                        !e.released && e.kind === "task" && "opacity-90",
                      )}
                      style={{
                        top: (p.top / 60) * HOUR + 1,
                        height: h - 2,
                        left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
                        width: `calc(${100 / p.cols}% - 4px)`,
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-1 font-medium">
                        <EntryIcon e={e} />
                        <span className="truncate">{e.title}</span>
                        {e.kind === "task" && !e.task_id ? (
                          <Lock
                            className="size-3 shrink-0 opacity-70"
                            aria-hidden
                          />
                        ) : null}
                      </span>
                      {h >= 34 && e.at ? (
                        <span className="truncate text-[11px] opacity-80">
                          {timeIn(e.at, ctx.timeZone)}
                          {e.kind === "class" && e.due_at
                            ? ` to ${timeIn(e.due_at, ctx.timeZone)}`
                            : ""}
                        </span>
                      ) : null}
                    </Event>
                  );
                })}
                {isToday ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-20"
                    style={{ top: (nowMin / 60) * HOUR }}
                    data-testid="calendar-now"
                  >
                    <span className="absolute -top-1.5 -left-1.5 size-3 rounded-full bg-red-500" />
                    <span className="block h-0.5 bg-red-500" />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Month: weeks of days with a few events each; a day opens the day view. */
function MonthView({
  anchor,
  ctx,
  onDay,
}: {
  anchor: string;
  ctx: Ctx;
  onDay: (d: string) => void;
}) {
  const days = daysOf("month", anchor);
  const month = parseDay(anchor).getUTCMonth();
  const weeks = Array.from({ length: days.length / 7 }, (_, i) =>
    days.slice(i * 7, i * 7 + 7),
  );
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      role="grid"
      aria-label="Month"
      data-testid="calendar-month"
    >
      <div
        className="text-muted-foreground grid grid-cols-7 border-b text-center text-[11px] font-medium uppercase"
        role="row"
      >
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1.5" role="columnheader">
            {w}
          </span>
        ))}
      </div>
      <div
        className="grid min-h-0 flex-1 overflow-y-auto"
        style={{
          gridTemplateRows: `repeat(${weeks.length}, minmax(6.5rem, 1fr))`,
        }}
      >
        {weeks.map((week) => (
          <div
            key={week[0]}
            className="grid grid-cols-7 border-b last:border-b-0"
            role="row"
          >
            {week.map((d) => {
              const entries = ctx.byDay.get(d) ?? [];
              const outside = parseDay(d).getUTCMonth() !== month;
              const isToday = d === ctx.today;
              return (
                <div
                  key={d}
                  className={cn(
                    "flex min-w-0 flex-col gap-0.5 border-l p-1 first:border-l-0",
                    outside && "bg-muted/30",
                  )}
                  role="gridcell"
                  data-testid={`calendar-cell-${d}`}
                >
                  <button
                    type="button"
                    onClick={() => onDay(d)}
                    className={cn(
                      "hover:bg-accent mx-auto grid size-7 place-items-center rounded-full text-xs tabular-nums outline-none focus-visible:ring-2",
                      isToday &&
                        "bg-primary text-primary-foreground hover:bg-primary font-semibold",
                      outside && !isToday && "text-muted-foreground",
                    )}
                    aria-label={`Open ${parseDay(d).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })}`}
                  >
                    {parseDay(d).getUTCDate()}
                  </button>
                  {entries.slice(0, 3).map((e, i) => (
                    <Event
                      key={i}
                      e={e}
                      ctx={ctx}
                      className="flex items-center gap-1 px-1 py-0.5 text-[11px]"
                    >
                      <EntryIcon e={e} className="size-3" />
                      {e.at ? (
                        <span className="hidden shrink-0 whitespace-nowrap tabular-nums opacity-80 xl:inline">
                          {timeIn(e.at, ctx.timeZone)}
                        </span>
                      ) : null}
                      <span className="truncate">
                        {e.kind === "surprise" ? "Surprise" : e.title}
                      </span>
                    </Event>
                  ))}
                  {entries.length > 3 ? (
                    <button
                      type="button"
                      onClick={() => onDay(d)}
                      className="text-muted-foreground hover:text-foreground px-1 text-left text-[11px]"
                    >
                      {entries.length - 3} more
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function dayLabel(d: string, today: string): string {
  if (d === today) return "Today";
  if (d === addDays(today, 1)) return "Tomorrow";
  return parseDay(d).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

/** Agenda: every day with something on it, from today on, earlier days folded away. */
function AgendaView({ ctx }: { ctx: Ctx }) {
  const [showPast, setShowPast] = useState(false);
  const days = [...ctx.byDay.keys()].sort();
  const past = days.filter((d) => d < ctx.today).length;
  const shown = days.filter((d) => showPast || d >= ctx.today);
  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-6"
      data-testid="calendar-agenda"
    >
      {past > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="mb-2"
          onClick={() => setShowPast((v) => !v)}
          data-testid="calendar-past"
        >
          {showPast
            ? "Hide earlier days"
            : `Show ${past} earlier ${past === 1 ? "day" : "days"}`}
        </Button>
      ) : null}
      {shown.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm">
          Nothing else on the calendar yet.
        </p>
      ) : null}
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        {shown.map((d) => {
          const entries = ctx.byDay.get(d) ?? [];
          const p = parseDay(d);
          return (
            <section
              key={d}
              aria-label={dayLabel(d, ctx.today)}
              data-testid={`calendar-day-${d}`}
              className="flex gap-4"
            >
              <div className="w-12 shrink-0 text-center">
                <p
                  className={cn(
                    "text-[11px] font-medium uppercase",
                    d === ctx.today ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {WEEKDAYS[(p.getUTCDay() + 6) % 7]}
                </p>
                <p
                  className={cn(
                    "mx-auto grid size-9 place-items-center rounded-full text-lg tabular-nums",
                    d === ctx.today &&
                      "bg-primary text-primary-foreground font-semibold",
                  )}
                >
                  {p.getUTCDate()}
                </p>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                  {dayLabel(d, ctx.today)}
                  {entries[0]?.day ? (
                    <Badge variant="outline" className="font-normal">
                      Day {entries[0].day}
                    </Badge>
                  ) : null}
                </h2>
                <ul className="flex flex-col gap-1.5">
                  {entries.map((e, i) => (
                    <li key={i}>
                      <Event
                        e={e}
                        ctx={ctx}
                        className="flex w-full items-center gap-3 p-2.5 text-sm"
                      >
                        <EntryIcon e={e} className="size-4" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {e.kind === "surprise" ? "Surprise task" : e.title}
                          </span>
                          <span className="block truncate text-xs opacity-80">
                            {entryLine(e, ctx.timeZone)}
                          </span>
                        </span>
                        {e.kind === "task" && !e.task_id ? (
                          <Lock
                            className="size-3.5 shrink-0 opacity-70"
                            aria-hidden
                          />
                        ) : (
                          <ChevronRight
                            className="size-4 shrink-0 opacity-60"
                            aria-hidden
                          />
                        )}
                      </Event>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Phones in day view: a swipeable strip of the week with dots on busy days. */
function WeekStrip({
  anchor,
  ctx,
  onPick,
}: {
  anchor: string;
  ctx: Pick<Ctx, "today" | "byDay">;
  onPick: (d: string) => void;
}) {
  const days = daysOf("week", anchor);
  return (
    <div
      className="grid grid-cols-7 border-b px-1 py-1.5"
      role="tablist"
      aria-label="Week"
    >
      {days.map((d) => {
        const p = parseDay(d);
        const busy = (ctx.byDay.get(d)?.length ?? 0) > 0;
        return (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={d === anchor}
            onClick={() => onPick(d)}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-lg py-1 outline-none focus-visible:ring-2",
              d === anchor && "bg-accent",
            )}
            data-testid={`calendar-strip-${d}`}
          >
            <span
              className={cn(
                "text-[10px] font-medium uppercase",
                d === ctx.today ? "text-primary" : "text-muted-foreground",
              )}
            >
              {WEEKDAYS[(p.getUTCDay() + 6) % 7]?.slice(0, 1)}
            </span>
            <span
              className={cn(
                "grid size-7 place-items-center rounded-full text-sm tabular-nums",
                d === ctx.today &&
                  "bg-primary text-primary-foreground font-semibold",
              )}
            >
              {p.getUTCDate()}
            </span>
            <span
              className={cn(
                "size-1 rounded-full",
                busy ? "bg-primary" : "bg-transparent",
              )}
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}

function Legend() {
  const rows: [string, string][] = [
    ["border-primary/50 bg-primary/15", "Task out now"],
    ["border-border bg-muted", "Task on its way"],
    ["border-success/40 bg-success/12", "Task done"],
    ["border-primary/60 border-dashed bg-primary/5", "Surprise task"],
    ["border-rose-500/50 bg-rose-500/15", "Live class"],
  ];
  return (
    <div>
      <p className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
        Key
      </p>
      <ul className="flex flex-col gap-1 text-xs">
        {rows.map(([c, l]) => (
          <li key={l} className="flex items-center gap-2">
            <span className={cn("size-3 rounded-sm border", c)} aria-hidden />{" "}
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

function UpNext({
  items,
  now,
  timeZone,
  onPick,
}: {
  items: readonly CalendarEntry[];
  now: Date;
  timeZone: string;
  onPick: (d: string) => void;
}) {
  const next = items
    .filter((e) => e.at && e.at > now)
    .sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0))
    .slice(0, 4);
  if (next.length === 0) return null;
  return (
    <div>
      <p className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
        Up next
      </p>
      <ul className="flex flex-col gap-1">
        {next.map((e, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => onPick(e.date)}
              className="hover:bg-accent flex w-full items-start gap-2 rounded-md p-1.5 text-left text-xs"
            >
              <EntryIcon e={e} className="mt-0.5" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{e.title}</span>
                <span className="text-muted-foreground block">
                  {parseDay(e.date).toLocaleDateString("en-GB", {
                    timeZone: "UTC",
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                  {e.at ? `, ${timeIn(e.at, timeZone)}` : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
