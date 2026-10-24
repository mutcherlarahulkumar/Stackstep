import { describe, expect, it } from "vitest";

import { weekRecap } from "@/components/workspace/progress-sheet";

import { csvCell } from "./csv";
import { reportCsv, shiftDate, weekLabel } from "./report";

const g = { cohort: "ANITS Batch 1", college: "ANITS", students: 3, active: 3, done: 4, on_time_percent: 75, points: 90, hand_ins: 5, certificates: 1, inactive: 0, avg_completion: 40 };

describe("weekly report", () => {
  it("moves by weeks across months and years", () => {
    expect(shiftDate("2026-11-02", -7)).toBe("2026-10-26");
    expect(shiftDate("2026-12-28", 7)).toBe("2027-01-04");
  });

  it("labels the week compactly", () => {
    expect(weekLabel("2026-11-02", "2026-11-08")).toBe("2 – 8 Nov 2026");
    expect(weekLabel("2026-10-26", "2026-11-01")).toBe("26 Oct – 1 Nov 2026");
  });

  it("exports a formula-safe CSV with totals (WR6)", () => {
    const csv = reportCsv({ week_start: "2026-11-02", week_end: "2026-11-08", groups: [{ ...g, cohort: "=HYPERLINK()" }], totals: g, top: [], attention: [], truncated: false, generated_at: new Date() });
    const lines = csv.trim().split("\r\n");
    expect(lines[0]?.startsWith("cohort,college,students")).toBe(true);
    expect(lines[1]?.startsWith("'=HYPERLINK()")).toBe(true);
    expect(lines[2]?.startsWith("All students,,3")).toBe(true);
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
  });
});


describe("week recap", () => {
  const w = { start: "2026-11-02", done: 0, on_time: 0, points: 0, hand_ins: 0 };
  it("is honest about the week (WR5)", () => {
    expect(weekRecap(w)).toMatch(/Nothing finished yet/);
    expect(weekRecap({ ...w, hand_ins: 1 })).toMatch(/1 hand-in waiting/);
    expect(weekRecap({ ...w, done: 2, on_time: 2 })).toMatch(/all on time/);
    expect(weekRecap({ ...w, done: 3, on_time: 1 })).toMatch(/3 tasks finished, 1 on time/);
  });
});
