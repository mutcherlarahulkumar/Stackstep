import { describe, expect, it } from "vitest";

import { isoDate, joinLocal, parseIsoDate, splitLocal } from "./dates";

describe("dates", () => {
  it("round-trips calendar days and rejects impossible ones", () => {
    expect(isoDate(new Date(2026, 10, 3))).toBe("2026-11-03");
    expect(parseIsoDate("2026-11-03")?.getDate()).toBe(3);
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("nope")).toBeNull();
  });

  it("splits and joins local date-times", () => {
    expect(splitLocal("2026-11-03T09:30")).toEqual({ date: "2026-11-03", time: "09:30" });
    expect(splitLocal("")).toEqual({ date: "", time: "" });
    expect(joinLocal("2026-11-03", "")).toBe("2026-11-03T18:00");
    expect(joinLocal("", "09:00")).toBe("");
  });
});
