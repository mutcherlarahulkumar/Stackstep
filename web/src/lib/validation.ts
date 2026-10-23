/** Mirrors backend/internal/domain/task.go. The server stays the authority. */
import { type ReviewMode, type TaskStatus } from "./api/schemas";

export const Bounds = {
  titleMin: 3,
  titleMax: 120,
  briefMax: 8000,
  noteMax: 2000,
  messageMax: 4000,
  searchMax: 100,
  minTaskMinutes: 15,
  backdateGraceMinutes: 5,
  personaNameMin: 2,
  personaNameMax: 60,
  flowNameMin: 3,
  flowNameMax: 80,
  streamMin: 2,
  streamMax: 40,
  flowDescriptionMax: 500,
  dueMinutesMin: 15,
  dueMinutesMax: 7 * 24 * 60,
  itemsPerDay: 10,
  itemsPerFlow: 600,
  broadcastMax: 500,
  bulkAssignMax: 500,
} as const;

const CONTROL_MULTILINE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]/;
const CONTROL_LINE = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;

/** Length in Unicode code points, like Go's utf8.RuneCountInString. */
export const runeLength = (s: string) => [...s].length;

export const normalizeLine = (s: string) => s.trim().split(/\s+/).filter(Boolean).join(" ");

export function validateTitle(raw: string): string | null {
  const t = normalizeLine(raw);
  const n = runeLength(t);
  if (n === 0) return "Title is required.";
  if (n < Bounds.titleMin) return "Title must be at least 3 characters.";
  if (n > Bounds.titleMax) return "Title can be at most 120 characters.";
  if (CONTROL_LINE.test(t)) return "Title contains characters that can't be displayed.";
  return null;
}

export function validateBrief(raw: string): string | null {
  const b = raw.trim();
  if (runeLength(b) > Bounds.briefMax) return "Brief can be at most 8000 characters.";
  if (CONTROL_MULTILINE.test(b)) return "Brief contains characters that can't be displayed.";
  return null;
}

export function validateMessage(raw: string): string | null {
  const b = raw.trim();
  if (!b) return "Write a message first.";
  if (runeLength(b) > Bounds.messageMax) return "Messages can be at most 4000 characters.";
  if (CONTROL_MULTILINE.test(b)) return "Message contains characters that can't be displayed.";
  return null;
}

export function validateNote(raw: string, to: TaskStatus): string | null {
  const n = raw.trim();
  if (to === "changes_requested" && !n) return "Tell the student what to change.";
  if (runeLength(n) > Bounds.noteMax) return "Note can be at most 2000 characters.";
  return null;
}

export function validateSchedule(now: Date, scheduledFor: Date | null, dueAt: Date | null) {
  const start = scheduledFor ?? now;
  let scheduled: string | null = null;
  let due: string | null = null;
  if (start.getTime() < now.getTime() - Bounds.backdateGraceMinutes * 60_000) scheduled = "Start time can't be in the past.";
  if (!dueAt || Number.isNaN(dueAt.getTime())) due = "Pick a due time.";
  else if (dueAt.getTime() < start.getTime() + Bounds.minTaskMinutes * 60_000) due = "Due time must be at least 15 minutes after the start.";
  return { scheduled_for: scheduled, due_at: due };
}

/** Student-allowed moves, mirroring the server's transition graph. Self-reviewed tasks are finished by the student. */
export function studentMoves(from: TaskStatus, mode: ReviewMode = "manual"): TaskStatus[] {
  switch (from) {
    case "todo":
      return ["in_progress"];
    case "in_progress":
      return mode === "self" ? ["done"] : ["in_review"];
    case "changes_requested":
      return ["in_review", "in_progress"];
    case "in_review":
    case "done":
    case "cancelled":
      return [];
  }
}

/** Reviewer moves (admins and college admins). */
export function staffMoves(from: TaskStatus): TaskStatus[] {
  switch (from) {
    case "in_review":
      return ["done", "changes_requested", "cancelled"];
    case "todo":
    case "in_progress":
    case "changes_requested":
      return ["cancelled"];
    case "done":
    case "cancelled":
      return [];
  }
}

/** A single-line field with a length range, like the server's lineBetween. */
export function validateLine(raw: string, label: string, min: number, max: number): string | null {
  const t = normalizeLine(raw);
  const n = runeLength(t);
  if (n === 0) return `${label} is required.`;
  if (n < min) return `${label} must be at least ${min} characters.`;
  if (n > max) return `${label} can be at most ${max} characters.`;
  if (CONTROL_LINE.test(t)) return `${label} contains characters that can't be displayed.`;
  return null;
}

export function validateDescription(raw: string): string | null {
  const d = raw.trim();
  if (runeLength(d) > Bounds.flowDescriptionMax) return "Description can be at most 500 characters.";
  if (CONTROL_MULTILINE.test(d)) return "Description contains characters that can't be displayed.";
  return null;
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateReleaseTime(raw: string): string | null {
  return CLOCK.test(raw) ? null : "Use a 24-hour time like 10:00.";
}

export function validateDueMinutes(n: number): string | null {
  if (!Number.isInteger(n) || n < Bounds.dueMinutesMin || n > Bounds.dueMinutesMax) return "Time to finish must be between 15 minutes and 7 days.";
  return null;
}

/** "45 min", "2 h", "1 day 4 h" for due_minutes. */
export function durationLabel(minutes: number): string {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  const parts = [d ? `${d} ${d === 1 ? "day" : "days"}` : "", h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean);
  return parts.join(" ") || "0 min";
}
