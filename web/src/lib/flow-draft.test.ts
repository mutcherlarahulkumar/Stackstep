import { describe, expect, it } from "vitest";

import { LEAD_ID } from "@/test/fixtures";

import { addBlocked, errorsByRow, ordered, sameRows, shift, toInput, type DraftRow } from "./flow-draft";

let k = 0;
const row = (day: number, title: string): DraftRow => ({
  key: `k${++k}`,
  day,
  template_id: null,
  type: "feature",
  title,
  brief: "",
  persona_id: LEAD_ID,
  review_mode: "manual",
  release_time: "10:00",
  due_minutes: 60,
  release_window: 0,
  content: { resources: [], quiz: null },
});

describe("flow draft", () => {
  it("orders by day and keeps the order inside a day", () => {
    const rows = [row(2, "b1"), row(1, "a1"), row(2, "b2"), row(1, "a2")];
    expect(ordered(rows).map((r) => r.title)).toEqual(["a1", "a2", "b1", "b2"]);
    expect(toInput(rows)[0]).not.toHaveProperty("key");
  });

  it("moves within a day only", () => {
    const rows = ordered([row(1, "a"), row(1, "b"), row(2, "c")]);
    const b = rows[1];
    expect(shift(rows, b?.key ?? "", -1).map((r) => r.title)).toEqual(["b", "a", "c"]);
    expect(shift(rows, b?.key ?? "", 1).map((r) => r.title)).toEqual(["a", "b", "c"]);
  });

  it("enforces 10 per day and 600 per flow (F2)", () => {
    const day = Array.from({ length: 10 }, (_, i) => row(3, `t${i}`));
    expect(addBlocked(day, 3)).toMatch(/at most 10/);
    expect(addBlocked(day, 4)).toBeNull();
    const big = Array.from({ length: 600 }, (_, i) => row((i % 60) + 1, `t${i}`));
    expect(addBlocked(big, 1)).toMatch(/at most 600/);
  });

  it("maps server errors back to rows in sent order", () => {
    const rows = [row(2, "late"), row(1, "early")];
    const byRow = errorsByRow(rows, { "items[0].title": "Too short", "items[1].day": "Pick a day", items: "x" });
    const [early, late] = ordered(rows);
    expect(byRow.get(early?.key ?? "")).toEqual({ title: "Too short" });
    expect(byRow.get(late?.key ?? "")).toEqual({ day: "Pick a day" });
  });

  it("dirty check ignores client keys", () => {
    const a = [row(1, "a")];
    const b = a.map((r) => ({ ...r, key: "other" }));
    expect(sameRows(a, b)).toBe(true);
    expect(sameRows(a, [{ ...a[0], title: "changed" } as DraftRow])).toBe(false);
  });
});
