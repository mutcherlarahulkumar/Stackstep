import { describe, expect, it } from "vitest";

import { callLabel, canonical, handInNote, sameValue, summary } from "./practice";

describe("practice", () => {
  it("compares JSON values regardless of key order (DP4)", () => {
    expect(sameValue([0, 1], [0, 1])).toBe(true);
    expect(sameValue([1, 0], [0, 1])).toBe(false);
    expect(sameValue({ a: 1, b: [2] }, { b: [2], a: 1 })).toBe(true);
    expect(sameValue(undefined, null)).toBe(false);
    expect(canonical(undefined)).toBe("undefined");
  });

  it("labels calls and summarises runs", () => {
    expect(callLabel("twoSum", [[2, 7], 9])).toBe("twoSum([2,7], 9)");
    const r = { cases: [{ index: 0, status: "pass" as const, actual: "[0,1]", error: null, ms: 0 }, { index: 1, status: "fail" as const, actual: "[]", error: null, ms: 0 }], logs: [], setupError: null };
    expect(summary(r, 2)).toBe("1 of 2 examples pass");
    expect(summary({ ...r, cases: r.cases.slice(0, 1) }, 1)).toBe("All 1 examples pass");
    expect(summary({ ...r, setupError: "SyntaxError" }, 2)).toBe("Your code didn't load");
  });

  it("builds a hand-in note within the limit (DP5)", () => {
    const note = handInNote("function f() {}", null, 3);
    expect(note).toContain("```js\nfunction f() {}\n```");
    expect(note).toContain("not run");
    const long = handInNote("x".repeat(10_000), null, 3, 4000);
    expect(long.length).toBeLessThanOrEqual(4000);
    expect(long).toContain("…trimmed");
  });
});
