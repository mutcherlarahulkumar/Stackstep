import { describe, expect, it } from "vitest";

import { type LabIssue, type LabReview } from "./api/schemas";
import { byLine, checkReview, inIssue, issuesByLine, lineKey, scoreLine, usefulComments } from "./review-lab";

const issue = (id: string, from: number, to = from, comment: number | null = null): LabIssue => ({
  id,
  path: "a.js",
  from,
  to,
  severity: "bug",
  title: id,
  explanation: "why",
  found: comment !== null,
  comment,
});

const review = (over: Partial<LabReview>): LabReview => ({
  id: "00000000-0000-4000-8000-000000000001",
  task_id: null,
  verdict: "request_changes",
  summary: "",
  comments: [],
  score: 50,
  found: 1,
  total: 2,
  noise: 0,
  noise_penalty: 0,
  approve_penalty: 0,
  passed: false,
  issues: [],
  created_at: new Date(),
  ...over,
});

describe("review lab", () => {
  it("groups comments and issues by line (RL4)", () => {
    const g = byLine([
      { path: "a.js", line: 3, side: "new", body: "x" },
      { path: "a.js", line: 3, side: "new", body: "y" },
      { path: "a.js", line: 3, side: "old", body: "z" },
    ]);
    expect(g.get(lineKey("a.js", "new", 3))).toHaveLength(2);
    expect(g.get(lineKey("a.js", "old", 3))).toHaveLength(1);
    expect(issuesByLine([issue("a", 2, 4)]).get(lineKey("a.js", "new", 4))?.[0]?.id).toBe("a");
    expect(inIssue([issue("a", 2, 4)], "a.js", 3)?.id).toBe("a");
    expect(inIssue([issue("a", 2, 4)], "a.js", 5)).toBeNull();
    expect(inIssue([issue("a", 2, 4)], "a.js", null)).toBeNull();
  });

  it("explains the score in plain words", () => {
    expect(scoreLine(review({}))).toBe("Found 1 of 2 planted problems.");
    expect(scoreLine(review({ noise_penalty: 5, approve_penalty: 10 }))).toBe(
      "Found 1 of 2 planted problems, 5 off for comments that pointed at nothing, 10 off for approving a pull request with problems.",
    );
    expect(usefulComments(review({ issues: [issue("a", 1, 1, 2), issue("b", 5)] }))).toEqual(new Set([2]));
  });

  it("checks a review before sending (RL3)", () => {
    expect(checkReview([], "")).toMatch(/at least one/);
    expect(checkReview([{ path: "a", line: 1, side: "new", body: "x" }], "")).toBeNull();
    expect(checkReview([{ path: "a", line: 1, side: "new", body: "x" }], "x".repeat(4001))).toMatch(/summary/);
  });
});
