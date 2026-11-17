# Feature 28 — Public portfolio

A page per intern that recruiters can open without signing in: `/p/{github login}`.

- Off by default. The intern turns it on in **Your portfolio** (`/portfolio`, account menu on
  the web and in the app) and can add a one-line headline (up to 120 characters).
- Shows the name, avatar, GitHub link, headline, internship and where it stands, totals (tasks
  finished, pull requests approved, points, longest streak), earned badges, valid certificates
  (with Verify links), shipped work (each finished task with its hand-in link) and the review
  lab pull requests passed.
- Never shows chats, notes, reviews, rubric ticks, quiz scores or email.
- Built from what happened, so it updates by itself.

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| PF1 | Not turned on, unknown login, staff | 404, shown as "No public portfolio here" | Go `TestPortfolio`, E2E `team-lab.spec.ts` |
| PF2 | Turned on with a headline | Public page with name, headline, work and badges; whitespace normalized | Go `TestPortfolio`, E2E |
| PF3 | Headline over 120 characters, staff saving one | 422, 403 | Go `TestPortfolio` |
| PF4 | Turned off again | 404 again | Go `TestPortfolio`, E2E |
| PF5 | Private fields | None in the response | Go `TestPortfolio` |
