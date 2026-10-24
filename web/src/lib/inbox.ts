import { type Message, type Persona, type Thread } from "./api/schemas";

/** The default team lead (created by a migration); the server falls back to it when no persona is chosen. */
export const DEFAULT_PERSONA_ID = "00000000-0000-4000-8000-000000000001";

/** Which conversation a chat shows. Students leave `enrollmentId` null. */
export type ChatTarget = { personaId: string; enrollmentId: string | null };

export const isStaffTarget = (t: ChatTarget) => t.enrollmentId !== null;

/** Whether a message was written by "our side" of the conversation. */
export const isMine = (t: ChatTarget, m: Message) => (isStaffTarget(t) ? m.author === "persona" : m.author === "student");

export const belongsTo = (t: ChatTarget, m: Message) => m.persona_id === t.personaId && (t.enrollmentId === null || m.enrollment_id === t.enrollmentId);

export const threadKey = (t: { enrollment_id: string; persona: { id: string } }) => `${t.enrollment_id}/${t.persona.id}`;

/**
 * Applies a live message to a thread list: the thread moves to the top and, for messages
 * from the other side, its unread count grows. Returns null when no loaded thread matches
 * (the caller refetches) and the same array for a duplicate or older frame.
 */
export function applyMessage<T extends Thread>(threads: readonly T[], m: Message, staff: boolean): T[] | null {
  const i = threads.findIndex((t) => t.persona.id === m.persona_id && t.enrollment_id === m.enrollment_id);
  if (i < 0) return null;
  const t = threads[i];
  if (!t) return null;
  const last = t.last_message;
  if (last && (last.id === m.id || last.sent_at.getTime() > m.sent_at.getTime())) return threads as T[];
  const fromOther = staff ? m.author === "student" : m.author === "persona";
  const next = { ...t, last_message: m, unread: fromOther ? t.unread + 1 : t.unread };
  return [next, ...threads.slice(0, i), ...threads.slice(i + 1)];
}

export function clearUnread<T extends Thread>(threads: readonly T[], target: ChatTarget): T[] {
  return threads.map((t) =>
    t.persona.id === target.personaId && (target.enrollmentId === null || t.enrollment_id === target.enrollmentId) ? { ...t, unread: 0 } : t,
  );
}

export const totalUnread = (threads: readonly Thread[]) => threads.reduce((n, t) => n + t.unread, 0);

/** One line of a message for list previews. */
export function previewLine(body: string, max = 90): string {
  const one = body.trim().split(/\s+/).filter(Boolean).join(" ");
  const chars = [...one];
  return chars.length <= max ? one : `${chars.slice(0, max - 1).join("")}…`;
}

const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const weekdayShort = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const monthDay = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** "4:05 PM" today, then "Yesterday", "Mon", "Nov 2". */
export function inboxTimeLabel(at: Date, now: Date): string {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(now) - start(at)) / 86_400_000);
  if (days <= 0) return time.format(at);
  if (days === 1) return "Yesterday";
  if (days < 7) return weekdayShort.format(at);
  return monthDay.format(at);
}

/** Honest label for who is behind a persona (shown under its name in chat). */
export function personaTag(p: Pick<Persona, "auto_reply">): string {
  return p.auto_reply ? "Mentor · some replies automatic" : "Played by a mentor";
}
