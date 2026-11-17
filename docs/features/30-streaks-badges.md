# Feature 30 — Streaks and badges

Worked out from what the intern did; nothing is handed out by hand.

- **Streak**: consecutive days (in the intern's time zone) with work: moving a task, sending a
  message, taking a quiz or reviewing a pull request. A streak that ended yesterday still
  counts until today ends ("keep it going today").
- **Badges**: First PR merged, 5 reviews passed, On time all week (two hand-ins in one week
  with none late), 7-day and 30-day streaks, Bug hunter (every planted problem found in a
  review lab pull request), Quiz ace (100% on a quiz), 10 and 25 tasks done.
- Earned badges are saved with their date, so it never moves, and Stackbot celebrates each one
  once in the team room (badges already earned more than two days ago are saved quietly).
- Shown on the board (streak and medals, with a sheet of every badge and its progress), the
  staff profile, the public certificate pages and the portfolio. The app shows the strip on
  the board and a badges screen.

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| BG1 | Bug hunter earned | Saved, shown, celebrated once | Go `TestReviewLabPractice`, E2E |
| BG2 | Streaks: gaps, today not yet active, empty | Current resets after a missed day; yesterday counts until today ends | Go `TestComputeStreak`, web `badges.test.ts` |
| BG3 | First PR needs a reviewer's approval of a GitHub PR link | Earned on that approval only | Go `TestComputeAchievements`, `TestPortfolio`, `TestIsPullRequestURL` |
| BG4 | On time all week with a late hand-in first | Not earned that week | Go `TestComputeAchievements` |
| BG5 | Every badge listed with progress | Locked badges show progress toward the target | Go `TestComputeAchievements`, web and app tests |
