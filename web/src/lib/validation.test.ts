import { describe, expect, it } from "vitest";

import { TASK_STATUSES } from "./api/schemas";
import { staffMoves, studentMoves, validateBrief, validateMessage, validateNote, validateSchedule, validateTitle } from "./validation";

describe("validation mirrors the server bounds", () => {
  it("title", () => {
    expect(validateTitle("  ")).not.toBeNull();
    expect(validateTitle("ab")).not.toBeNull();
    expect(validateTitle("abc")).toBeNull();
    expect(validateTitle("é".repeat(120))).toBeNull();
    expect(validateTitle("😀".repeat(120))).toBeNull(); // counts code points, not UTF-16 units
    expect(validateTitle("a".repeat(121))).not.toBeNull();
    expect(validateTitle("bad\u0007title")).not.toBeNull();
    expect(validateTitle("bad\u2028title")).toBeNull(); // U+2028 is whitespace: normalized to a space, like Go's strings.Fields
  });

  it("message and brief", () => {
    expect(validateMessage(" \n ")).not.toBeNull();
    expect(validateMessage("x".repeat(4000))).toBeNull();
    expect(validateMessage("x".repeat(4001))).not.toBeNull();
    expect(validateMessage("line\nbreak\ttab")).toBeNull();
    expect(validateBrief("b".repeat(8000))).toBeNull();
    expect(validateBrief("b".repeat(8001))).not.toBeNull();
  });

  it("note", () => {
    expect(validateNote("", "changes_requested")).not.toBeNull();
    expect(validateNote("", "done")).toBeNull();
    expect(validateNote("n".repeat(2001), "done")).not.toBeNull();
  });

  it("schedule", () => {
    const now = new Date("2026-11-04T10:00:00Z");
    const min = (m: number) => new Date(now.getTime() + m * 60_000);
    expect(validateSchedule(now, null, min(15)).due_at).toBeNull();
    expect(validateSchedule(now, null, min(14)).due_at).not.toBeNull();
    expect(validateSchedule(now, null, null).due_at).not.toBeNull();
    expect(validateSchedule(now, min(-6), min(60)).scheduled_for).not.toBeNull();
    expect(validateSchedule(now, min(-4), min(60)).scheduled_for).toBeNull();
  });

  it("transition graph matches backend/internal/domain", () => {
    const allowed = new Set([
      "todo>in_progress/student",
      "in_progress>in_review/student",
      "changes_requested>in_progress/student",
      "changes_requested>in_review/student",
      "in_review>done/staff",
      "in_review>changes_requested/staff",
      "todo>cancelled/staff",
      "in_progress>cancelled/staff",
      "in_review>cancelled/staff",
      "changes_requested>cancelled/staff",
    ]);
    for (const from of TASK_STATUSES) {
      for (const to of TASK_STATUSES) {
        expect(studentMoves(from).includes(to)).toBe(allowed.has(`${from}>${to}/student`));
        expect(staffMoves(from).includes(to)).toBe(allowed.has(`${from}>${to}/staff`));
      }
    }
  });
});
