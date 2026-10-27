# Feature 06 — Placement overview, CSV export and nudges

Desktop web only (admins and college admins). Phones keep Assign and Inbox.

## What it shows

`GET /v1/admin/overview?q=` returns every student the caller manages (college admins: their
college only), at most 1,000 (`truncated` says when there are more; search narrows):

- the student and enrollment (same shape as the Students list);
- tasks released / done / in review / overdue and `completion_percent` (same rules as
  Progress in feature 05);
- points and credits (credits include the 20 welcome credits even before the student first
  opens their wallet — they are granted lazily);
- `last_active_at`: the student's latest chat message, task move or AI question;
- `inactive`: an **active** internship that has started and not ended, quiet for **48 hours**
  counting from the later of the last activity and day 1. Paused, finished or not-yet-started
  internships are never inactive;
- the latest certificate (a valid one wins over a revoked one).

A summary totals students, active, inactive, overdue tasks, valid certificates and the average
completion.

## CSV export

`GET /v1/admin/overview/export?q=` returns the same rows as `text/csv` with a dated
`attachment` filename. Cells starting with `= + - @`, tab or carriage return are prefixed with
`'` so spreadsheet apps never run them as formulas. The web app downloads it with the session's
bearer token (it can't be a plain link).

## Nudges

*Nudge N inactive* opens the existing broadcast dialog with the inactive students pre-picked and
a friendly draft. The admin picks the persona, edits the text and can trim recipients. Messages
go out one-to-one through the normal broadcast (idempotent per recipient, paused students are
skipped). No automatic or AI-written nudges.

## Coming soon (shown, not faked)

Payments (Razorpay), GitHub PR checks, push notifications on phones and certificate artwork (Orshot)
appear as labelled cards. Nothing behind them is simulated.

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| PO1 | Numbers per student after a task is approved and a certificate issued | released/done/points/credits/last active/certificate correct | backend `TestOverview` |
| PO2 | Paused internship; credits before the wallet is opened | never inactive; 20 credits shown | backend `TestOverview`, E2E `overview.spec.ts` |
| PO3 | 48 quiet hours, then a chat message | flagged, then cleared | backend `TestOverview`, domain `TestInactive` |
| PO4 | Search; college admin scope; student caller | narrows; only their college; 403 (JSON and CSV) | backend `TestOverview` |
| PO5 | CSV export | header + one row per student, `text/csv`, attachment filename | backend `TestOverview`, web `client.test.ts`, E2E `overview.spec.ts` |
| PO6 | Formula-like cells | prefixed with `'` | backend `TestCSVSafe` |
| PO7 | Filters (inactive, overdue, ready for certificate, certified) and sorting | ready = past 70% without a valid certificate; never-active sorts oldest | web `overview.test.ts` |
| PO8 | Nudge | inactive students and draft pre-filled; admin can trim; sent one-to-one | E2E `overview.spec.ts` |
| PO9 | Loading, empty search, empty filter, error/offline, more than 1,000 students | skeleton / "No students match" / filter empty state / retry / truncated notice | web (manual + screenshots) |
