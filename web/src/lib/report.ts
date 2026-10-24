import { type ReportGroup, type WeeklyReport } from "./api/schemas";
import { csvCell } from "./csv";

/** "YYYY-MM-DD" shifted by whole days (UTC, so weeks don't drift across DST). */
export function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "3 – 9 Nov 2026" */
export function weekLabel(start: string, end: string): string {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  const day = (d: Date) => d.getUTCDate();
  const month = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  const sameMonth = s.getUTCMonth() === e.getUTCMonth();
  return `${day(s)}${sameMonth ? "" : ` ${month(s)}`} – ${day(e)} ${month(e)} ${e.getUTCFullYear()}`;
}

const HEADER = ["cohort", "college", "students", "active", "tasks_done", "on_time_percent", "points", "hand_ins", "certificates", "inactive_now", "avg_completion"];

const row = (g: ReportGroup) => [g.cohort, g.college ?? "", g.students, g.active, g.done, g.on_time_percent, g.points, g.hand_ins, g.certificates, g.inactive, g.avg_completion];

/** The report's cohort table as CSV, with a totals row. Cells are formula-safe. */
export function reportCsv(r: WeeklyReport): string {
  const lines = [HEADER, ...r.groups.map(row), row({ ...r.totals, cohort: "All students", college: null })];
  return lines.map((l) => l.map((c) => csvCell(String(c))).join(",")).join("\r\n") + "\r\n";
}
