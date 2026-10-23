import { type Message, type Task, type TaskStatus, type TaskType } from "./api/schemas";

export const COLUMNS = ["today", "in_review", "changes", "done"] as const;
export type Column = (typeof COLUMNS)[number];

export const COLUMN_LABEL: Record<Column, string> = {
  today: "Today",
  in_review: "In review",
  changes: "Changes requested",
  done: "Done",
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  in_review: "In review",
  changes_requested: "Changes requested",
  done: "Done",
  cancelled: "Cancelled",
};

export const TYPE_LABEL: Record<TaskType, string> = {
  feature: "Feature",
  bug_fix: "Bug fix",
  dsa: "DSA",
  doc_reading: "Doc reading",
  quiz: "Quiz",
  git_chore: "Git chore",
  code_review: "Code review",
  standup: "Standup",
};

export function columnOf(s: TaskStatus): Column {
  switch (s) {
    case "todo":
    case "in_progress":
      return "today";
    case "in_review":
      return "in_review";
    case "changes_requested":
      return "changes";
    case "done":
    case "cancelled":
      return "done";
  }
}

/** Groups visible tasks into columns, earliest due first. Cancelled tasks are dropped. */
export function groupBoard(tasks: readonly Task[]): Record<Column, Task[]> {
  const out: Record<Column, Task[]> = { today: [], in_review: [], changes: [], done: [] };
  for (const t of tasks) if (t.status !== "cancelled") out[columnOf(t.status)].push(t);
  for (const c of COLUMNS) out[c].sort((a, b) => a.due_at.getTime() - b.due_at.getTime());
  return out;
}

/** Applies a live task update; stale versions are ignored and cancelled tasks removed. */
export function upsertTask(tasks: readonly Task[], t: Task): Task[] {
  const i = tasks.findIndex((x) => x.id === t.id);
  const existing = i >= 0 ? tasks[i] : undefined;
  if (existing && existing.version > t.version) return [...tasks];
  if (t.status === "cancelled") return tasks.filter((x) => x.id !== t.id);
  return existing ? tasks.map((x) => (x.id === t.id ? t : x)) : [...tasks, t];
}

/** Merges message pages and live frames: unique by id, newest first. */
export function mergeMessages(a: readonly Message[], b: readonly Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const m of [...a, ...b]) byId.set(m.id, m);
  return [...byId.values()].sort((x, y) => y.sent_at.getTime() - x.sent_at.getTime() || (y.id < x.id ? -1 : 1));
}
