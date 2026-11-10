import { describe, expect, it } from "vitest";

import { type CalendarEntry } from "./api/schemas";
import { entryLine, groupByDay, todayIn, weeksBetween } from "./calendar";

const base: CalendarEntry = {
  kind: "task",
  date: "2026-11-05",
  day: 1,
  at: new Date("2026-11-05T04:00:00Z"),
  due_at: new Date("2026-11-05T07:00:00Z"),
  released: false,
  task_id: null,
  title: "Standup",
  task_type: "standup",
  status: null,
  persona_id: null,
  class_id: null,
};

describe("calendar (CA6)", () => {
  it("lays the internship out in whole Monday-first weeks", () => {
    const weeks = weeksBetween("2026-11-05", "2026-12-04"); // Thursday to Friday
    expect(weeks[0]?.[0]).toBe("2026-11-02");
    expect(weeks[0]?.[3]).toBe("2026-11-05");
    expect(weeks.at(-1)?.[6]).toBe("2026-12-06");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
  it("groups entries by day and says when each lands, in the student's zone", () => {
    const g = groupByDay([base, { ...base, title: "Two" }, { ...base, date: "2026-11-06" }]);
    expect(g.get("2026-11-05")).toHaveLength(2);
    expect(entryLine(base, "Asia/Kolkata")).toBe("Arrives at 9:30 AM");
    expect(entryLine({ ...base, released: true, status: "in_review", task_id: "x" }, "Asia/Kolkata")).toBe("In review");
    expect(entryLine({ ...base, kind: "surprise", at: null, title: null }, "Asia/Kolkata")).toBe("A surprise task lands sometime this day");
  });
  it("knows today in another zone", () => {
    expect(todayIn("Asia/Kolkata", new Date(Date.UTC(2026, 10, 4, 20, 0)))).toBe("2026-11-05");
  });
});

import { daysOf, layoutDay, minutesIn, rangeTitle, shift } from "./calendar";

describe("calendar timeline (CA8)", () => {
  const at = (iso: string) => new Date(iso);
  it("places blocks by time in the student's zone and shares width when they overlap", () => {
    expect(minutesIn(at("2026-11-10T04:00:00Z"), "Asia/Kolkata")).toBe(9 * 60 + 30);
    const placed = layoutDay(
      [
        { ...base, at: at("2026-11-10T04:00:00Z"), title: "Standup" },
        { ...base, at: at("2026-11-10T04:15:00Z"), title: "Two Sum" },
        { ...base, kind: "class", at: at("2026-11-10T12:30:00Z"), due_at: at("2026-11-10T13:30:00Z"), title: "Class", task_type: null },
      ],
      "Asia/Kolkata",
    );
    const by = new Map(placed.map((p) => [p.entry.title ?? "", p]));
    expect(by.get("Standup")).toMatchObject({ top: 570, height: 30, col: 0, cols: 2 });
    expect(by.get("Two Sum")).toMatchObject({ col: 1, cols: 2 });
    expect(by.get("Class")).toMatchObject({ top: 18 * 60, height: 60, cols: 1 });
  });
  it("lays out days, weeks and months and moves between them", () => {
    expect(daysOf("week", "2026-11-12")[0]).toBe("2026-11-09");
    expect(daysOf("month", "2026-11-12")).toHaveLength(42);
    expect(shift("month", "2026-11-12", 1)).toBe("2026-12-01");
    expect(shift("week", "2026-11-12", -1)).toBe("2026-11-05");
    expect(rangeTitle("week", "2026-11-12")).toBe("9 to 15 November 2026");
  });
});
