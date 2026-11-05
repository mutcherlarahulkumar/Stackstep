import { describe, expect, it } from "vitest";

import { wrap } from "@/components/certificate/certificate-art";

import { dateOnlyLabel, formatCode, isCode, normalizeCode, periodEnd, programLabel, verifyPath, certificateWording, trackName } from "./certificate";

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

describe("certificate wording (C10)", () => {
  const cert = {
    student_name: "Asha Rao",
    program_days: 30 as const,
    program_slug: "frontend-30",
    flow_name: "React Frontend · 30 days",
    start_date: "2026-11-02",
    end_date: "2026-12-01",
    issued_at: new Date("2026-12-01T10:00:00Z"),
  };

  it("reads like an internship certificate and never mentions tasks or points", () => {
    const w = certificateWording(cert);
    expect(w.body).toBe("has successfully completed the 30-day Frontend Engineering Internship in React Frontend at Stackstep, from November 2, 2026 to December 1, 2026.");
    expect(w.closing).toContain("Asha showed dedication");
    expect(`${w.body} ${w.closing}`).not.toMatch(/task|point/i);
    expect(w.issued).toBe("2026-12-01");
  });

  it("leaves the track out when there is no flow", () => {
    expect(certificateWording({ ...cert, flow_name: null }).body).not.toContain(" in ");
    expect(trackName("Data · 60 days")).toBe("Data");
    expect(trackName(null)).toBeNull();
  });

  it("wraps on word boundaries", () => {
    expect(wrap("one two three four", 9)).toEqual(["one two", "three", "four"]);
    expect(wrap("", 10)).toEqual([]);
  });
});
