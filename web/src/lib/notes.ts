import { type TaskNote } from "./api/schemas";

/** Matches the API's cap on a task note. */
export const NOTE_MAX = 20000;

/** Whether the editor matches what's saved. */
export function noteStatus(saved: TaskNote, body: string, shared: boolean): "saved" | "dirty" {
  return saved.body === body && saved.shared === shared ? "saved" : "dirty";
}
