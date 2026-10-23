import { describe, expect, it } from "vitest";

import { dateOnlyLabel, formatCode, isCode, normalizeCode, periodEnd, programLabel, verifyPath } from "./certificate";

describe("certificate codes", () => {
  it("normalizes what people type", () => {
    expect(normalizeCode(" abcd-efgh jk23 ")).toBe("ABCDEFGHJK23");
    expect(isCode("abcd-efgh-jk23")).toBe(true);
  });

  it("rejects look-alikes and wrong lengths", () => {
    expect(isCode("ABCDEFGHJK2O")).toBe(false); // O
    expect(isCode("ABCDEFGHJK21")).toBe(false); // 1
    expect(isCode("ABCDEFGHJKL2")).toBe(false); // L
    expect(isCode("ABCDEFGH")).toBe(false);
    expect(isCode("")).toBe(false);
  });

  it("groups codes in fours and builds safe paths", () => {
    expect(formatCode("ABCDEFGHJK23")).toBe("ABCD-EFGH-JK23");
    expect(verifyPath("AB/../C")).toBe("/verify/AB%2F..%2FC");
  });

  it("shows dates without shifting zones", () => {
    expect(dateOnlyLabel("2026-03-01")).toBe("March 1, 2026");
  });

  it("names the program", () => {
    expect(programLabel({ program_days: 30, program_slug: "frontend-30" })).toBe("30-day Frontend Engineering Internship");
    expect(programLabel({ program_days: 60, program_slug: "fullstack-60" })).toBe("60-day Full-stack Engineering Internship");
  });
});

describe("certificate period", () => {
  it("never claims days after the issue date", () => {
    expect(periodEnd({ end_date: "2026-11-19", issued_at: new Date("2026-10-23T10:00:00Z") })).toBe("2026-10-23");
    expect(periodEnd({ end_date: "2026-11-19", issued_at: new Date("2026-11-25T10:00:00Z") })).toBe("2026-11-19");
  });
});
