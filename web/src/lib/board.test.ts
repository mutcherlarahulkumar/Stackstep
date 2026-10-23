import { describe, expect, it } from "vitest";

import { message, task } from "@/test/fixtures";

import { Message, Task } from "./api/schemas";
import { groupBoard, mergeMessages, upsertTask } from "./board";

const T = (o: Record<string, unknown>) => Task.parse(task(o));
const M = (o: Record<string, unknown>) => Message.parse(message(o));

describe("board helpers", () => {
  it("groups by column, hides cancelled, sorts by due", () => {
    const g = groupBoard([
      T({ title: "a", status: "in_progress", due_at: "2026-11-05T00:00:00Z" }),
      T({ title: "b", status: "todo", due_at: "2026-11-04T00:00:00Z" }),
      T({ title: "c", status: "cancelled" }),
      T({ title: "d", status: "changes_requested" }),
      T({ title: "e", status: "done" }),
      T({ title: "f", status: "in_review" }),
    ]);
    expect(g.today.map((t) => t.title)).toEqual(["b", "a"]);
    expect(g.changes.map((t) => t.title)).toEqual(["d"]);
    expect(g.in_review.map((t) => t.title)).toEqual(["f"]);
    expect(g.done.map((t) => t.title)).toEqual(["e"]);
  });

  it("upsert ignores stale versions and removes cancelled", () => {
    const t1 = T({ version: 3 });
    expect(upsertTask([t1], { ...t1, version: 2, status: "done" })[0]?.status).toBe("todo");
    expect(upsertTask([t1], { ...t1, version: 4, status: "in_progress" })[0]?.status).toBe("in_progress");
    expect(upsertTask([t1], { ...t1, version: 4, status: "cancelled" })).toEqual([]);
    expect(upsertTask([], t1)).toHaveLength(1);
  });

  it("merges messages without duplicates, newest first", () => {
    const a = M({ sent_at: "2026-11-04T10:00:00Z" });
    const b = M({ sent_at: "2026-11-04T09:00:00Z" });
    const c = M({ sent_at: "2026-11-04T11:00:00Z" });
    expect(mergeMessages([a, b], [c, a]).map((m) => m.id)).toEqual([c.id, a.id, b.id]);
  });
});
