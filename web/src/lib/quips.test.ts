import { describe, expect, it } from "vitest";

import { QUIPS, quipAt } from "./quips";

describe("loading quips", () => {
  it("wraps around in both directions and stays short enough for a phone", () => {
    expect(quipAt(0)).toBe(QUIPS[0]);
    expect(quipAt(QUIPS.length)).toBe(QUIPS[0]);
    expect(quipAt(-1)).toBe(QUIPS[QUIPS.length - 1]);
    for (const q of QUIPS) expect(q.length).toBeLessThanOrEqual(60);
    expect(new Set(QUIPS).size).toBe(QUIPS.length);
  });
});
