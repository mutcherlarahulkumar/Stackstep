import { type Portfolio } from "./api/schemas";

export const portfolioPath = (login: string) => `/p/${encodeURIComponent(login)}`;

export const HEADLINE_MAX = 120;

/** "30-day Frontend internship", from the program. */
export function programName(p: Pick<Portfolio, "program_days" | "program_slug">): string {
  const track = p.program_slug.includes("fullstack") ? "Full-stack" : p.program_slug.includes("frontend") ? "Frontend" : "Software";
  return `${p.program_days}-day ${track} engineering internship`;
}

/** Where the internship stands, in a few words. */
export function statusLine(p: Pick<Portfolio, "status" | "day_number" | "program_days">): string {
  switch (p.status) {
    case "completed":
      return "Completed";
    case "cancelled":
      return "Ended early";
    case "paused":
      return "On a break";
    case "active":
      return p.day_number === 0 ? "Starting soon" : `Day ${p.day_number} of ${p.program_days}`;
  }
}

/** Link text for a piece of work: pull requests say so. */
export function linkLabel(url: string): string {
  try {
    const u = new URL(url);
    if (/(^|\.)github\.com$/i.test(u.hostname) && /\/pull\/\d+/.test(u.pathname)) return "View pull request";
    return `View on ${u.hostname.replace(/^www\./, "")}`;
  } catch {
    return "View";
  }
}

/** Trims and squeezes spaces, like the server does. */
export function cleanHeadline(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
