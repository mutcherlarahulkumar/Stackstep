/** Helpers for "YYYY-MM-DD" and "YYYY-MM-DDTHH:mm" strings in the browser's zone. */

const pad = (n: number) => String(n).padStart(2, "0");

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses "YYYY-MM-DD" as a local calendar day, or null. */
export function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null;
}

/** Splits "YYYY-MM-DDTHH:mm" into its date and time halves ("" when missing). */
export function splitLocal(v: string): { date: string; time: string } {
  const [date = "", time = ""] = v.split("T");
  return { date, time: time.slice(0, 5) };
}

export const joinLocal = (date: string, time: string) => (date ? `${date}T${time || "18:00"}` : "");

/** "Mon 3 Nov 2026" */
export function dayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
