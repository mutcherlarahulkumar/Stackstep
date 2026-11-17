import { describe, expect, it } from "vitest";

import { type Badge } from "./api/schemas";
import { earned, nextUp, streakLabel } from "./badges";

const b = (key: Badge["key"], progress: number, target: number, at: Date | null = null): Badge => ({
  key,
  title: key,
  description: "",
  target,
  progress,
  earned_at: at,
});

describe("badges (BG)", () => {
  it("splits earned from next up, closest first", () => {
    const badges = [b("first_pr", 1, 1, new Date()), b("tasks_10", 3, 10), b("reviews_5", 4, 5), b("streak_30", 0, 30)];
    expect(earned({ badges }).map((x) => x.key)).toEqual(["first_pr"]);
    expect(nextUp({ badges }).map((x) => x.key)).toEqual(["reviews_5", "tasks_10"]);
  });

  it("words the streak", () => {
    expect(streakLabel({ current: 0, longest: 4, active_today: false })).toBe("Start a streak today");
    expect(streakLabel({ current: 3, longest: 4, active_today: true })).toBe("3-day streak");
    expect(streakLabel({ current: 3, longest: 4, active_today: false })).toBe("3-day streak · keep it going today");
  });
});
