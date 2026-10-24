# Feature 13 — Notifications

Students miss replies and reviews when Stackstep sits in a background tab; reviewers miss
hand-ins. Real push (phones, closed tabs) needs an external push service — Firebase Cloud
Messaging or Web Push keys — so it's labelled **coming soon**. What works today needs nothing
external:

- **Browser notifications, opt in.** Account menu → "Notifications". The browser asks for
  permission once; "blocked" explains how to allow it. Notifications only show while the tab is
  open but hidden, using the live connection the app already has.
  - Students: a persona's message (titled with the persona's name), changes requested,
    approved (admin-reviewed tasks), a new task on the board.
  - Staff: a student's message, a new hand-in to review.
- **Unread count in the tab title**, e.g. "(3) Workspace · Stackstep", for students and staff.
- An open conversation no longer marks messages read while the tab is hidden; they're marked
  read when you come back, so the count stays honest.
- The app keeps its in-app unread badges.

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| NT1 | Persona message to a student in a hidden tab, opted in | notification titled with the persona (waits for a brand-new thread's name) | web `notify.test.ts`, E2E `notifications.spec.ts` |
| NT2 | Student's own message; self-check done; in-progress moves | no notification | web `notify.test.ts` |
| NT3 | Student message / hand-in for staff | notification | web `notify.test.ts` |
| NT4 | Unread while hidden | "(n) " in the title; not marked read until visible | web `notify.test.ts`, E2E |
| NT5 | Permission denied; unsupported browser | toggle says "blocked" / is hidden | manual |
