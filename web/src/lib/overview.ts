import { type OverviewRow } from "./api/schemas";

export const OVERVIEW_FILTERS = ["all", "inactive", "overdue", "ready", "certified"] as const;
export type OverviewFilter = (typeof OVERVIEW_FILTERS)[number];

export const isOverviewFilter = (v: string): v is OverviewFilter => (OVERVIEW_FILTERS as readonly string[]).includes(v);

export const FILTER_LABEL: Record<OverviewFilter, string> = {
  all: "All",
  inactive: "Inactive",
  overdue: "Overdue work",
  ready: "Ready for certificate",
  certified: "Certified",
};

/** Suggested completion before a certificate (mirrors the server's bar). */
export const CERTIFICATE_BAR = 70;

const hasValidCert = (r: OverviewRow) => r.certificate?.status === "valid";

export function matchesFilter(r: OverviewRow, f: OverviewFilter): boolean {
  switch (f) {
    case "all":
      return true;
    case "inactive":
      return r.inactive;
    case "overdue":
      return r.overdue > 0;
    case "ready":
      return !hasValidCert(r) && r.released > 0 && r.completion_percent >= CERTIFICATE_BAR;
    case "certified":
      return hasValidCert(r);
  }
}

export const SORT_KEYS = ["name", "completion", "points", "overdue", "last_active"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type Sort = { key: SortKey; dir: "asc" | "desc" };

const collator = new Intl.Collator(undefined, { sensitivity: "base" });

function compare(a: OverviewRow, b: OverviewRow, key: SortKey): number {
  switch (key) {
    case "name":
      return collator.compare(a.student.user.name, b.student.user.name);
    case "completion":
      return a.completion_percent - b.completion_percent;
    case "points":
      return a.points - b.points;
    case "overdue":
      return a.overdue - b.overdue;
    case "last_active":
      // Never active sorts as the oldest.
      return (a.last_active_at?.getTime() ?? 0) - (b.last_active_at?.getTime() ?? 0);
  }
}

/** Sorted copy; ties fall back to name so the order is stable. */
export function sortRows(rows: readonly OverviewRow[], sort: Sort): OverviewRow[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => sign * compare(a, b, sort.key) || compare(a, b, "name") || a.student.enrollment.id.localeCompare(b.student.enrollment.id));
}

/** "2h ago", "3 days ago", "Never". */
export function lastActiveLabel(at: Date | null, now: Date): string {
  if (!at) return "Never";
  const mins = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 60_000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export const NUDGE_DRAFT =
  "Hi! We haven't seen you on Stackstep for a couple of days. Is anything blocking you? Reply here and we'll help you get moving again — even a small step today counts.";
