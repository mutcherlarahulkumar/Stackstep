import { type EnrollmentStatus } from "./api/schemas";

/** GitHub's username rule, mirrored from the server: 1–39 letters, digits or single hyphens. */
export function validLogin(raw: string): boolean {
  const s = normalizeLogin(raw);
  return /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(s);
}

export const normalizeLogin = (raw: string) => raw.trim().replace(/^@/, "");

export const MAX_IMPORT_ROWS = 500;

export type ImportRow = { line: number; github_login: string; name: string; email: string; problem: string | null };

/** Splits one CSV line, honouring double quotes ("a, b" and "" escapes). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === "," || c === "\t" || c === ";") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

const HEADER_ALIASES: Record<string, "github_login" | "name" | "email"> = {
  github_login: "github_login",
  github: "github_login",
  login: "github_login",
  username: "github_login",
  github_username: "github_login",
  name: "name",
  full_name: "name",
  email: "email",
  email_address: "email",
};

/**
 * Parses pasted or uploaded CSV. A header row (github_login,name,email in any order, common
 * aliases accepted) is optional; without one, columns are login, name, email. Blank lines are
 * skipped, duplicates and bad logins are flagged per row.
 */
export function parseRoster(text: string): ImportRow[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  let cols: ("github_login" | "name" | "email" | null)[] = ["github_login", "name", "email"];
  let start = 0;
  const first = lines.findIndex((l) => l.trim() !== "");
  if (first >= 0) {
    const head = splitCsvLine(lines[first] ?? "").map((h) => HEADER_ALIASES[h.toLowerCase().replace(/[\s-]+/g, "_")] ?? null);
    if (head.includes("github_login")) {
      cols = head;
      start = first + 1;
    }
  }
  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    if (raw.trim() === "") continue;
    const cells = splitCsvLine(raw);
    const get = (k: "github_login" | "name" | "email") => {
      const idx = cols.indexOf(k);
      return idx >= 0 ? (cells[idx] ?? "") : "";
    };
    const login = normalizeLogin(get("github_login"));
    const email = get("email");
    let problem: string | null = null;
    if (!validLogin(login)) problem = login ? "Not a valid GitHub username" : "Missing GitHub username";
    else if (seen.has(login.toLowerCase())) problem = "Appears twice";
    else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problem = "Email looks wrong";
    if (login) seen.add(login.toLowerCase());
    rows.push({ line: i + 1, github_login: login, name: get("name"), email, problem });
  }
  return rows;
}

/** Status changes staff may make (mirrors the server). */
export function statusMoves(from: EnrollmentStatus): EnrollmentStatus[] {
  switch (from) {
    case "active":
      return ["paused", "completed", "cancelled"];
    case "paused":
      return ["active", "completed", "cancelled"];
    case "completed":
    case "cancelled":
      return [];
  }
}

export const STATUS_ACTION: Record<EnrollmentStatus, string> = {
  active: "Resume internship",
  paused: "Pause internship",
  completed: "Mark as completed",
  cancelled: "Cancel internship",
};

export const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Common zones first; the browser's own zone is added by the form. */
export const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "UTC"];

/** Today as YYYY-MM-DD in the browser's zone. */
export function todayISO(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/**
 * Day 1 for someone joining now: the next calendar day in their time zone, e.g. "Thursday 5
 * November". Mirrors domain.FirstWorkingDay on the server.
 */
export function firstWorkingDay(timeZone: string, now = new Date()): string {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m, d] = ymd.split("-").map(Number);
  const next = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + 1, 12));
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(next);
}

/** "Starts tomorrow" or "Starts Thu 5 Nov" for an internship that hasn't begun (start is YYYY-MM-DD). */
export function startsCaption(start: string, now = new Date()): string {
  const [y, m, d] = start.split("-").map(Number);
  const day = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (day.getTime() === tomorrow.getTime()) return "Starts tomorrow";
  return `Starts ${day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`;
}

/** The instant it is `hour`:00 on a calendar date (YYYY-MM-DD) in a time zone. */
export function zoneTime(ymd: string, hour: number, timeZone: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, hour);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const shown = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess - (shown - guess));
}

/** "Day 4 of 30", or "Starts tomorrow" before Day 1 (short form: "Day 4/30"). */
export function internshipDay(e: { day_number: number; start_date: string; program: { days: number } }, short = false, now = new Date()): string {
  if (e.day_number === 0) return startsCaption(e.start_date, now);
  return short ? `Day ${e.day_number}/${e.program.days}` : `Day ${e.day_number} of ${e.program.days}`;
}

