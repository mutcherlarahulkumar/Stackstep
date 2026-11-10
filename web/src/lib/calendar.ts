import { type CalendarEntry } from "@/lib/api/schemas";
import { STATUS_LABEL } from "@/lib/board";

/** YYYY-MM-DD → a UTC midnight Date (calendar dates carry no time zone). */
export function parseDay(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, day ?? 1));
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's date (YYYY-MM-DD) in a time zone. */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Whole weeks (Monday first) covering start..end, each a list of 7 YYYY-MM-DD days. Days
 * outside the internship are still listed so the grid stays square.
 */
export function weeksBetween(start: string, end: string): string[][] {
  const first = parseDay(start);
  const last = parseDay(end);
  const monday = new Date(first);
  monday.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  const weeks: string[][] = [];
  for (let d = new Date(monday); d <= last; ) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(isoDay(d));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export function groupByDay(items: readonly CalendarEntry[]): Map<string, CalendarEntry[]> {
  const out = new Map<string, CalendarEntry[]>();
  for (const e of items) out.set(e.date, [...(out.get(e.date) ?? []), e]);
  return out;
}

/** "9:30 AM" in the student's zone. */
export function timeIn(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(at);
}

/** One line under an entry: when it lands, or its status once out. */
export function entryLine(e: CalendarEntry, timeZone: string): string {
  switch (e.kind) {
    case "surprise":
      return "A surprise task lands sometime this day";
    case "class":
      return e.at ? `Live class at ${timeIn(e.at, timeZone)}` : "Live class";
    case "task":
      if (e.released) return e.status ? STATUS_LABEL[e.status] : "Out now";
      return e.at ? `Arrives at ${timeIn(e.at, timeZone)}` : "Coming up";
  }
}


// ---- Timeline (week/day/month) helpers -------------------------------------------------

export type View = "day" | "week" | "month";

/** Minutes since midnight of an instant, in a zone. */
export function minutesIn(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export function addDays(d: string, n: number): string {
  const x = parseDay(d);
  x.setUTCDate(x.getUTCDate() + n);
  return isoDay(x);
}

/** The days a view shows around an anchor day (weeks start on Monday). */
export function daysOf(view: View, anchor: string): string[] {
  if (view === "day") return [anchor];
  const a = parseDay(anchor);
  if (view === "week") {
    const mon = addDays(anchor, -((a.getUTCDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  }
  const first = isoDay(new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1)));
  const last = isoDay(new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 0)));
  return weeksBetween(first, last).flat();
}

/** Moves the anchor one view forward or back. */
export function shift(view: View, anchor: string, dir: 1 | -1): string {
  if (view === "day") return addDays(anchor, dir);
  if (view === "week") return addDays(anchor, 7 * dir);
  const a = parseDay(anchor);
  return isoDay(new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + dir, 1)));
}

/** "10 – 16 November 2026", "November 2026" or "Tuesday 10 November". */
export function rangeTitle(view: View, anchor: string): string {
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => parseDay(d).toLocaleDateString("en-GB", { timeZone: "UTC", ...o });
  if (view === "day") return fmt(anchor, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (view === "month") return fmt(anchor, { month: "long", year: "numeric" });
  const days = daysOf("week", anchor);
  const a = days[0] ?? anchor;
  const b = days[6] ?? anchor;
  const sameMonth = parseDay(a).getUTCMonth() === parseDay(b).getUTCMonth();
  return sameMonth ? `${fmt(a, { day: "numeric" })} to ${fmt(b, { day: "numeric", month: "long", year: "numeric" })}` : `${fmt(a, { day: "numeric", month: "short" })} to ${fmt(b, { day: "numeric", month: "short", year: "numeric" })}`;
}

export type Placed = { entry: CalendarEntry; top: number; height: number; col: number; cols: number };

/**
 * Timed blocks for one day, Google Calendar style: top and height in minutes, and events
 * that overlap share the width side by side. Tasks show as 30-minute blocks at the moment
 * they arrive; classes last as long as they run.
 */
export function layoutDay(entries: readonly CalendarEntry[], timeZone: string): Placed[] {
  const timed = entries
    .filter((e) => e.at)
    .map((e) => {
      const top = minutesIn(e.at ?? new Date(0), timeZone);
      const span = e.kind === "class" && e.due_at && e.at ? Math.round((e.due_at.getTime() - e.at.getTime()) / 60_000) : 30;
      return { entry: e, top, height: Math.max(20, Math.min(span, 24 * 60 - top)) };
    })
    .sort((a, b) => a.top - b.top || b.height - a.height);
  const out: Placed[] = [];
  let group: Placed[] = [];
  let groupEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...group.map((g) => g.col + 1));
    for (const g of group) out.push({ ...g, cols });
    group = [];
  };
  for (const t of timed) {
    if (t.top >= groupEnd && group.length) flush();
    const used = new Set(group.filter((g) => g.top + g.height > t.top).map((g) => g.col));
    let col = 0;
    while (used.has(col)) col++;
    group.push({ ...t, col, cols: 1 });
    groupEnd = Math.max(groupEnd, t.top + t.height);
  }
  if (group.length) flush();
  return out;
}

/** Entries without a time (surprises): the all-day lane. */
export const untimed = (entries: readonly CalendarEntry[]) => entries.filter((e) => !e.at);
