/** Which live events deserve a browser notification, and what it says. Pure, so it's testable. */
import { type Frame } from "./api/schemas";
import { previewLine } from "./inbox";

export type Audience = "student" | "staff";
export type Note = { title: string; body: string; tag: string };

/** `personaName` resolves a persona id to its display name (falls back to "Your team"). */
export function notificationFor(f: Frame, who: Audience, personaName: (id: string) => string | undefined): Note | null {
  switch (f.type) {
    case "ready":
      return null;
    case "message": {
      const m = f.message;
      if (who === "student" && m.author === "persona") {
        return { title: personaName(m.persona_id) ?? "Your team", body: previewLine(m.body), tag: `chat-${m.persona_id}` };
      }
      if (who === "staff" && m.author === "student") {
        return { title: `New message for ${personaName(m.persona_id) ?? "your team"}`, body: previewLine(m.body), tag: `staff-${m.enrollment_id}-${m.persona_id}` };
      }
      return null;
    }
    case "task": {
      const t = f.task;
      if (who === "student") {
        switch (t.status) {
          case "changes_requested":
            return { title: "Changes requested", body: t.title, tag: `task-${t.id}` };
          case "done":
            return t.review_mode === "manual" ? { title: "Approved", body: t.title, tag: `task-${t.id}` } : null;
          case "todo":
            return t.version === 1 ? { title: "New task on your board", body: t.title, tag: `task-${t.id}` } : null;
          case "in_progress":
          case "in_review":
          case "cancelled":
            return null;
        }
      }
      return t.status === "in_review" ? { title: "New hand-in to review", body: t.title, tag: `review-${t.id}` } : null;
    }
  }
}

/** "(3) Stackstep" while something is unread. */
export function titleWithCount(base: string, unread: number): string {
  const clean = base.replace(/^\(\d+\+?\) /, "");
  return unread > 0 ? `(${unread > 99 ? "99+" : unread}) ${clean}` : clean;
}

const PREF = "stackstep:notifications";

export function notificationsWanted(): boolean {
  try {
    return localStorage.getItem(PREF) === "on";
  } catch {
    return false;
  }
}

export function setNotificationsWanted(on: boolean): void {
  try {
    localStorage.setItem(PREF, on ? "on" : "off");
  } catch {
    // Private mode: the toggle just won't persist.
  }
}
