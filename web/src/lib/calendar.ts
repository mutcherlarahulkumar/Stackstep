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

