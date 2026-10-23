const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const monthDay = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const full = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b) - startOfDay(a)) / 86_400_000);

export const timeLabel = (d: Date) => time.format(d);
export const dateTimeLabel = (d: Date) => full.format(d);
export const isOverdue = (due: Date, now: Date) => due.getTime() < now.getTime();

/** "Due in 3h", "Due tomorrow, 6:00 PM", "Overdue by 2d". */
export function dueLabel(due: Date, now: Date): string {
  const diff = due.getTime() - now.getTime();
  if (diff < 0) {
    const late = -diff;
    if (late < 3_600_000) return `Overdue by ${Math.max(1, Math.floor(late / 60_000))}m`;
    if (late < 86_400_000) return `Overdue by ${Math.floor(late / 3_600_000)}h`;
    return `Overdue by ${Math.floor(late / 86_400_000)}d`;
  }
  if (diff < 3_600_000) return `Due in ${Math.max(1, Math.floor(diff / 60_000))}m`;
  const days = daysBetween(now, due);
  if (days === 0 && diff < 12 * 3_600_000) return `Due in ${Math.floor(diff / 3_600_000)}h`;
  if (days === 0) return `Due today, ${time.format(due)}`;
  if (days === 1) return `Due tomorrow, ${time.format(due)}`;
  if (days < 7) return `Due ${weekday.format(due)}, ${time.format(due)}`;
  return `Due ${monthDay.format(due)}, ${time.format(due)}`;
}

/** Chat day separators: "Today", "Yesterday", "Monday", "Nov 2". */
export function dayLabel(at: Date, now: Date): string {
  const days = daysBetween(at, now);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return weekday.format(at);
  return monthDay.format(at);
}

export function initials(name: string, fallback: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? fallback[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Value for <input type="datetime-local"> in the browser's zone. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
