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
