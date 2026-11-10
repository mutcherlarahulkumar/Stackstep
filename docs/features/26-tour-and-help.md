# Feature 26 — Tour and help assistant

## Tour

A guided walk through the page: the screen dims, a spotlight sits on one part at a time,
and a card explains it. Next and Back (or the arrow keys) move through it; Escape, the close
button or a click on the dim ends it.

- **Workspace** (students): chats, the conversation, the board, the phone tabs, Mail,
  Calendar, Progress and attendance, and Help. Steps whose part isn't on screen (the tabs on
  desktop, the panels on a phone) show as a centred card.
- **Console** (staff): every top-level section and Setup.
- Start it from the account menu (**Take the tour**), from the last step of the first-run
  guide (**Show me around**), or from the help panel on the workspace.

## Help assistant

A chat panel that answers questions about using Stackstep. It is "trained" on our own
student guide (`backend/internal/help/guide.md`), which covers applying, Day 1, the
workspace, chats, the board, hand-ins, reviews, readings, notes, the practice pad, the AI
helper and credits, points, certificates, the calendar, mail, live classes, attendance, the
phone app, paused internships, privacy and where to get more help. It never covers staff tools.

- The question is matched against the guide's topics (keywords, titles and text). With the
  AI configured, the model writes a short answer from the best four topics and the last six
  turns, under rules that keep it to the guide and the student side. Without the AI, or when
  the model is busy or fails, the best topic is returned word for word.
- Each answer names the topics it came from. Suggested questions get people started.
- Anyone can ask, signed in or not: it's on the home page, Get the app, the workspace (in
  the header), Mail, Calendar and Attendance. It is not shown in the staff console.
- In the phone app it is under the account menu, **Help**, as its own chat screen.
- `POST /v1/help/ask` needs no sign-in and is limited to a few questions a minute per visitor.

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| HB1 | A question with the AI on | The model answers from the matching topics; the prompt holds the rules and the guide | backend `TestHelpBot`, E2E `help.spec.ts` |
| HB2 | A follow-up | The recent turns go with it (at most six) | backend `TestHelpBot` |
| HB3 | Staff tools | The guide never mentions them; the rules refuse them | backend `TestGuideParses`, `TestMessages` |
| HB4 | No AI, or the AI fails | The best topic word for word; an unknown question points to the team lead | backend `TestHelpBot`, `TestHelpBotWithoutAI` |
| HB5 | Blank, too long, or a forged system turn | 422 | backend `TestHelpBot` |
| HB6 | Signed out on the home page | The panel opens and answers; Escape closes it | E2E `help.spec.ts` |
| HB7 | Topic search | Common questions find the right topic first; nonsense finds none | backend `TestSearch` |
| HB8 | App | Strict decoding; no auth header; suggestions ask straight away; recent turns go along; the source topic shows | Flutter `help_test.dart` |
| TR1 | Workspace tour from the account menu | Steps in order; arrow keys move; Finish ends it | E2E `help.spec.ts` |
| TR2 | Tour from the help panel | Starts the same tour; the close button ends it | E2E `help.spec.ts` |
| TR3 | Console | A staff tour from the account menu; no help assistant | E2E `help.spec.ts` |
