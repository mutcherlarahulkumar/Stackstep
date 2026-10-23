import { type DraftItemInput, type TemplateInput } from "./api/client";
import { type FlowItem, type TaskSpec, type TaskTemplate } from "./api/schemas";
import { contentForEdit } from "./content";
import { Bounds } from "./validation";

/** A draft row in the builder: the task spec, its day, and a stable client key. */
export type DraftRow = TemplateInput & { key: string; day: number; template_id: string | null };

let seq = 0;
export const newKey = () => `row-${Date.now().toString(36)}-${(++seq).toString(36)}`;

/** A server spec (template or flow item) as an editable draft. */
const fromServer = (s: TaskSpec): TemplateInput => ({
  type: s.type,
  title: s.title,
  brief: s.brief,
  persona_id: s.persona_id,
  review_mode: s.review_mode,
  release_time: s.release_time,
  due_minutes: s.due_minutes,
  release_window: s.release_window,
  content: contentForEdit(s.content),
});

/** The spec part of a row, without client-only fields. */
const specOfRow = (r: DraftRow): TemplateInput => ({
  type: r.type,
  title: r.title,
  brief: r.brief,
  persona_id: r.persona_id,
  review_mode: r.review_mode,
  release_time: r.release_time,
  due_minutes: r.due_minutes,
  release_window: r.release_window,
  content: r.content,
});

/** Rows from a saved version, in day then position order. */
export function rowsFromItems(items: readonly FlowItem[]): DraftRow[] {
  return [...items]
    .sort((a, b) => a.day - b.day || a.position - b.position)
    .map((it) => ({ ...fromServer(it), key: newKey(), day: it.day, template_id: it.template_id }));
}

export const rowFromTemplate = (t: TaskTemplate, day: number): DraftRow => ({ ...fromServer(t), key: newKey(), day, template_id: t.id });

/** Rows in the order the server stores them: by day, keeping the order within a day. */
export function ordered(rows: readonly DraftRow[]): DraftRow[] {
  return rows.map((r, i) => ({ r, i })).sort((a, b) => a.r.day - b.r.day || a.i - b.i).map((x) => x.r);
}

export function toInput(rows: readonly DraftRow[]): DraftItemInput[] {
  return ordered(rows).map((r) => ({ ...specOfRow(r), day: r.day, template_id: r.template_id }));
}

export function countByDay(rows: readonly DraftRow[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of rows) m.set(r.day, (m.get(r.day) ?? 0) + 1);
  return m;
}

/** Why another task can't go on `day`, or null. */
export function addBlocked(rows: readonly DraftRow[], day: number, adding = 1): string | null {
  if (rows.length + adding > Bounds.itemsPerFlow) return `A flow can hold at most ${Bounds.itemsPerFlow} tasks.`;
  if ((countByDay(rows).get(day) ?? 0) + adding > Bounds.itemsPerDay) return `A day can hold at most ${Bounds.itemsPerDay} tasks.`;
  return null;
}

/** Moves a row up or down within its day. */
export function shift(rows: readonly DraftRow[], key: string, dir: -1 | 1): DraftRow[] {
  const list = ordered(rows);
  const i = list.findIndex((r) => r.key === key);
  const j = i + dir;
  const a = list[i];
  const b = list[j];
  if (!a || !b || a.day !== b.day) return list;
  list[i] = b;
  list[j] = a;
  return list;
}

/** Maps server errors keyed "items[i].field" (i in sent order) back to row keys. */
export function errorsByRow(rows: readonly DraftRow[], fields: Record<string, string>): Map<string, Record<string, string>> {
  const sent = ordered(rows);
  const out = new Map<string, Record<string, string>>();
  for (const [k, v] of Object.entries(fields)) {
    const m = /^items\[(\d+)\]\.(\w+)$/.exec(k);
    const row = m ? sent[Number(m[1])] : undefined;
    if (!m || !row) continue;
    out.set(row.key, { ...out.get(row.key), [m[2] ?? ""]: v });
  }
  return out;
}

export function sameRows(a: readonly DraftRow[], b: readonly DraftRow[]): boolean {
  return JSON.stringify(toInput(a)) === JSON.stringify(toInput(b));
}
