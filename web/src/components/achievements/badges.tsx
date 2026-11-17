"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, type ReactNode } from "react";
import {
  Bug,
  CalendarCheck,
  Flame,
  GitMerge,
  ListChecks,
  Lock,
  Medal,
  Sparkles,
  ThumbsUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { type Achievements, type Badge, type BadgeKey, type Frame } from "@/lib/api/schemas";
import { BADGE_TONE, earned, nextUp, streakLabel } from "@/lib/badges";
import { dateLabel } from "@/lib/format";
import { useFrames } from "@/lib/realtime-context";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export const achievementsKey = ["achievements"] as const;

export const BADGE_ICON: Record<BadgeKey, LucideIcon> = {
  first_pr: GitMerge,
  reviews_5: ThumbsUp,
  on_time_week: CalendarCheck,
  streak_7: Flame,
  streak_30: Flame,
  bug_hunter: Bug,
  quiz_ace: Sparkles,
  tasks_10: ListChecks,
  tasks_25: Trophy,
};

/** A round medal: coloured when earned, grey with a lock when not. */
export function BadgeMedal({ badge, size = "md" }: { badge: Badge; size?: "sm" | "md" | "lg" }) {
  const Icon = BADGE_ICON[badge.key];
  const on = badge.earned_at !== null;
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full",
        size === "sm" ? "size-7" : size === "md" ? "size-10" : "size-14",
        on ? cn("bg-gradient-to-br text-white shadow-sm", BADGE_TONE[badge.key]) : "bg-muted text-muted-foreground",
      )}
      aria-hidden
    >
      <Icon className={size === "sm" ? "size-3.5" : size === "md" ? "size-5" : "size-7"} />
      {!on ? (
        <span className="bg-background absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full border">
          <Lock className="size-2.5" />
        </span>
      ) : null}
    </span>
  );
}

/** The streak flame with its count. */
export function StreakChip({ streak }: { streak: Achievements["streak"] }) {
  const hot = streak.current > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
        hot ? "bg-orange-500/12 text-orange-700 dark:text-orange-300" : "bg-muted text-muted-foreground",
      )}
      title={streakLabel(streak)}
      data-testid="streak-chip"
    >
      <Flame className={cn("size-3.5", hot && streak.active_today && "fill-current")} aria-hidden />
      {streak.current}
      <span className="sr-only">-day streak{streak.active_today ? "" : ", keep it going today"}</span>
    </span>
  );
}

export function useAchievements(enabled = true) {
  const { api } = useSession();
  const qc = useQueryClient();
  // A task moving can earn a badge; refresh shortly after (the server saves new ones in the background).
  useFrames(
    useCallback(
      (f: Frame) => {
        if (f.type === "task" || f.type === "ready") setTimeout(() => void qc.invalidateQueries({ queryKey: achievementsKey }), 1500);
      },
      [qc],
    ),
  );
  return useQuery({ queryKey: achievementsKey, queryFn: () => api.myAchievements(), staleTime: 60_000, enabled });
}

/** The strip at the top of the board: streak, earned medals and a button for the full list. */
export function AchievementsStrip() {
  const q = useAchievements();
  if (!q.data) return null;
  const won = earned(q.data);
  return (
    <div className="flex items-center gap-2 border-b px-4 py-2" data-testid="achievements-strip">
      <StreakChip streak={q.data.streak} />
      <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">{streakLabel(q.data.streak)}</span>
      <AllBadges a={q.data}>
        <Button variant="ghost" size="sm" className="gap-1.5" data-testid="open-badges">
          {won.length > 0 ? (
            <span className="flex -space-x-2">
              {won.slice(-3).map((b) => (
                <BadgeMedal key={b.key} badge={b} size="sm" />
              ))}
            </span>
          ) : (
            <Medal aria-hidden />
          )}
          <span className="tabular-nums">
            {won.length}/{q.data.badges.length}
          </span>
          <span className="sr-only">badges earned. See all badges</span>
        </Button>
      </AllBadges>
    </div>
  );
}

function AllBadges({ a, children }: { a: Achievements; children: ReactNode }) {
  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Your badges</SheetTitle>
          <SheetDescription>Earned from what you do, never handed out. They show on your certificate and portfolio.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="bg-card mb-4 flex items-center gap-3 rounded-xl border p-3">
            <span className="grid size-10 place-items-center rounded-full bg-orange-500/12 text-orange-600" aria-hidden>
              <Flame className="size-5" />
            </span>
            <div className="text-sm">
              <p className="font-semibold">{streakLabel(a.streak)}</p>
              <p className="text-muted-foreground text-xs">
                Longest {a.streak.longest} {a.streak.longest === 1 ? "day" : "days"}. A day counts when you move a task, send a message,
                take a quiz or review a pull request.
              </p>
            </div>
          </div>
          {nextUp(a).length > 0 ? (
            <>
              <h3 className="text-muted-foreground mb-2 text-xs font-medium">Closest next</h3>
              <BadgeList badges={nextUp(a)} />
              <h3 className="text-muted-foreground mt-5 mb-2 text-xs font-medium">All badges</h3>
            </>
          ) : null}
          <BadgeList badges={a.badges} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Every badge with its progress. */
export function BadgeList({ badges }: { badges: Badge[] }) {
  return (
    <ul className="flex flex-col gap-2" data-testid="badge-list">
      {badges.map((b) => (
        <li key={b.key} className={cn("flex items-center gap-3 rounded-xl border p-3", b.earned_at === null && "opacity-80")}>
          <BadgeMedal badge={b} />
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline justify-between gap-2 text-sm font-medium">
              {b.title}
              <span className="text-muted-foreground shrink-0 text-xs font-normal">
                {b.earned_at ? dateLabel(b.earned_at) : `${b.progress}/${b.target}`}
              </span>
            </p>
            <p className="text-muted-foreground text-xs">{b.description}</p>
            {b.earned_at === null && b.target > 1 ? (
              <Progress value={(b.progress / b.target) * 100} className="mt-1.5 h-1.5" aria-label={`${b.title} progress`} />
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Earned badges only, as medals with names (certificate, portfolio, profile). */
export function EarnedBadges({ badges, empty }: { badges: Badge[]; empty?: string }) {
  const won = badges.filter((b) => b.earned_at !== null);
  if (won.length === 0) return empty ? <p className="text-muted-foreground text-sm">{empty}</p> : null;
  return (
    <ul className="flex flex-wrap gap-2" data-testid="earned-badges">
      {won.map((b) => (
        <li key={b.key} className="bg-card flex items-center gap-2 rounded-full border py-1 pr-3 pl-1" title={b.description}>
          <BadgeMedal badge={b} size="sm" />
          <span className="text-sm font-medium">{b.title}</span>
        </li>
      ))}
    </ul>
  );
}
