# Feature 20 — Student calendar

Students see their whole internship by day: what's out now, what's coming and when it
arrives. Some things stay a surprise.

- **Calendar** in the workspace header opens `/calendar` (web); the app has a **Calendar** tab.
  - It works like Google Calendar. Day, Week and Month views, Today, previous and next.
  - Week and Day are an hour timeline. Each event sits at its time; a red line marks now.
  - Desktop adds a mini month to jump to any date, a colour key and what is up next.
  - Phones open on the day timeline under a week strip. The Agenda view lists every day
    from today, with earlier days folded away.
  - Tapping an event shows its details and what you can do with it.
- **Released tasks** show their status and open on the board.
- **Tasks scheduled ahead** show their title, type, persona and the time they arrive, with
  a lock. They can't be opened or handed in early; the API sends no task ID for them.
- **Surprise tasks** (from a flow item with a release window) show only a marker on their
  day, "A surprise task lands sometime this day". The title and time appear once it lands.
- **Live classes** the student is invited to show as class entries (feature 23).
- Dates and times follow the student's time zone.

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| CA1 | Released task | Full entry with ID and status | domain `TestCalendarFor` |
| CA2 | Task scheduled ahead | Title and time, no ID, no status | domain `TestCalendarFor`, backend `TestStudentCalendar` |
| CA3 | Surprise task not landed; cancelled task | Day marker only; cancelled tasks don't appear | domain `TestCalendarFor` |
| CA4 | Released entries match the board; nothing ahead opens | Every released ID is on `/me/tasks` | backend `TestStudentCalendar`, E2E `calendar.spec.ts` |
| CA5 | No active internship | 409 `no_active_enrollment` | backend `TestStudentCalendar` |
| CA6 | Zones and layout | Dates in the student's zone; Monday-first weeks; week timeline on desktop, day timeline with a week strip on phones, agenda and month on both | web `calendar.test.ts`, E2E `calendar.spec.ts` |
| CA7 | App | Strict decoding; surprise without title; locked rows; released rows open the task | Flutter `calendar_test.dart` |
| CA8 | Timeline (Google Calendar style) | Tasks are 30 minute blocks at the moment they arrive, classes last as long as they run, overlapping events share the width, surprises sit in the all day lane, a red line marks now, a tap opens details with Open the task, Join the class or a lock | web `calendar.test.ts`, E2E `calendar.spec.ts`, Flutter `calendar_test.dart` |
