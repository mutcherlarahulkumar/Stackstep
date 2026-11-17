import { type Achievements, type Badge, type BadgeKey } from "./api/schemas";

/** Accent per badge (earned). Locked badges are grey. */
export const BADGE_TONE: Record<BadgeKey, string> = {
  first_pr: "from-emerald-500 to-teal-600",
  reviews_5: "from-sky-500 to-indigo-600",
  on_time_week: "from-amber-400 to-orange-600",
  streak_7: "from-orange-500 to-rose-600",
  streak_30: "from-rose-500 to-fuchsia-600",
  bug_hunter: "from-lime-500 to-emerald-700",
  quiz_ace: "from-violet-500 to-purple-700",
  tasks_10: "from-cyan-500 to-blue-700",
  tasks_25: "from-yellow-400 to-amber-600",
};

export const earned = (a: Pick<Achievements, "badges">): Badge[] => a.badges.filter((b) => b.earned_at !== null);

/** Badges still to earn, closest first. */
export function nextUp(a: Pick<Achievements, "badges">, n = 2): Badge[] {
  return a.badges
    .filter((b) => b.earned_at === null)
    .sort((x, y) => y.progress / y.target - x.progress / x.target)
    .slice(0, n);
}

/** "3-day streak", "Start a streak today", with honest wording for a day not yet worked. */
export function streakLabel(s: Achievements["streak"]): string {
  if (s.current === 0) return "Start a streak today";
  const days = `${s.current}-day streak`;
  return s.active_today ? days : `${days} · keep it going today`;
}
