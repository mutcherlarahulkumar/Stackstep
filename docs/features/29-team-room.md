# Feature 29 — Team room

Each intern has one group chat with their whole team: every persona and **Stackbot**, the AI
teammate. Only that intern is in it; no other students are, ever.

- It is one more conversation (held by a reserved persona, `team: true`), pinned under the AI
  helper in the chat list on the web and in the app.
- Stackbot welcomes the intern the first time it opens, naming everyone on the team.
- Each message names its speaker. Type `@` to pick a teammate; `@Sam` (first name, full name
  or title) asks that persona.
  - No mention: Stackbot answers (AI with the scripted fallback, labelled automatic).
  - A persona whose replies are automatic answers as themselves.
  - A persona played by a mentor: Stackbot says they will answer, and staff see it as unread.
- Staff answer from the inbox, choosing who they **speak as**.
- When a task is approved, the persona who assigned it says so in the room.
- New badges are celebrated by Stackbot here (feature 30).

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| TR1 | First visit | The room exists with one welcome from Stackbot naming the team; not repeated | Go `TestTeamRoom`, E2E `team-lab.spec.ts`, app `team_room_widget_test.dart` |
| TR2 | Persona lists, editing the room | The room never appears among personas; editing it is 404 | Go `TestTeamRoom` |
| TR3 | No mention | Stackbot answers | Go `TestTeamRoom`, web `team.test.ts`, app tests |
| TR4 | `@sam` (automatic persona) | Sam answers as Sam | Go `TestTeamRoom`, E2E |
| TR5 | `@Priya` (played by a mentor); staff reply | Stackbot hands off; staff must pick an active persona to speak as; a speaker outside the room is refused | Go `TestTeamRoom`, E2E, app tests |
| TR6 | Another student | Sees only their own room | Go `TestTeamRoom` |
| TR7 | A task approved | The assigning persona celebrates it in the room | Go `TestTeamKudos` |
| TR8 | Mentions in text | `@Name` is highlighted; emails are not mentions | web `team.test.ts`, Go `TestMentioned` |
