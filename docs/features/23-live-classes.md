# Feature 23 — Live classes

Admins teach live inside Stackstep, Zoom style: screen sharing, voice, drawing on the
screen, chat, Q&A with upvotes, raised hands and reactions.

## What is stored, and what isn't

- **Stored**: only the schedule. That is the title, description, time, length, who is invited
  (everyone, a flow or a cohort), the host and the status (scheduled, live, ended,
  cancelled). Each invitee also gets an invitation letter in Mail, and the class appears on
  their calendar.
- **Not stored**: everything in the room. The API keeps it in memory: the last 100 chat
  lines, up to 200 questions, raised hands, up to 2,000 strokes of drawing, and WebRTC
  signalling. An empty room is forgotten 10 minutes after the last person leaves, and at once
  when a host ends the class.
- **Promote**: a host can turn any chat line or question into an announcement with the
  megaphone. It is mailed to every invitee and kept.

## How media flows

The room is hub and spoke. The presenting host's browser keeps one WebRTC connection per
viewer and sends the screen (video) plus a voice mix (audio) to each. Students who have been
allowed to speak send their mic back to the presenter. The presenter mixes in **only the
students a host allowed**, so a tampered client can't talk over the class. Media never passes
through the API; it only relays signalling. `CLASS_ICE_SERVERS` adds TURN servers for strict
networks (STUN is the default), and `CLASS_MAX_PEERS` caps a room (60).

## Roles

- **Host** (any staff in scope): open the room (a scheduled class goes live), start
  presenting (voice on), share the screen, draw with a pen, highlighter or laser, clear,
  answer questions, let a student speak or mute them, promote, and end the class.
- **Student** (invited by audience): watch and hear, chat, ask and upvote questions, react,
  raise a hand, and speak once allowed.
- Students find classes through the invitation letter (Join the class), the calendar, and a
  "Live now" banner in the workspace. The app opens the room in the browser, where screen
  sharing and the mic work.

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| LC1 | Join | The welcome frame carries the room as it is: peers, last 100 lines, questions, strokes, presenter | `classroom` `TestJoinAndChat` |
| LC2 | Questions | One vote per person; unanswered first, then by votes; only hosts mark answered | `TestQuestionsHandsAndHostOnly` |
| LC3 | Hands and mics | A raised hand shows; a host letting someone speak clears it; students can't allow mics | `TestQuestionsHandsAndHostOnly` |
| LC4 | Host-only frames | answer, allow_mic, present, draw, clear, promote and end are refused for students | `classroom` tests, backend `TestClassRoom` |
| LC5 | Blank or long text; flooding | Refused with a reason; rate limited | `TestJoinAndChat` |
| LC6 | Signals | Only presenter ⇄ viewer; at most 64 KB | `TestSignalsAndDrawing` |
| LC7 | Drawing | Bounded strokes replayed to latecomers; the laser is never kept; the presenter leaving clears the stage | `TestSignalsAndDrawing` |
| LC8 | Capacity, end, empty room | Full rooms refuse with 4429; ending disconnects everyone; empty rooms are forgotten | `TestCapacityAndEnd` |
| LC9 | Schedule validation | 422 per field (title, time, length, audience); students get 403 | backend `TestClassSchedule` |
| LC10 | Invitations | Mail letter (kind class) and a calendar entry for invitees only | `TestClassSchedule` |
| LC11 | Access | Uninvited students get 404 or close 4404; college admins see only their college | `TestClassSchedule`, `TestClassRoom` |
| LC12 | Cancel and end | Cancel only before it starts (repeating is a no-op); cancelled or ended rooms close with 4410 | `TestClassSchedule`, `TestClassRoom` |
| LC13–LC16 | Room over the socket | A host opening it puts the class live; chat and questions reach everyone; promote mails invitees; only hosts end | `TestClassRoom` |
| LC17 | Web room state | Welcome without empty lists, last 100 lines, question order, laser not kept, reactions | web `state.test.ts` |
| LC18 | End to end | Schedule, invite, present a real (fake-device) screen the student sees, chat, promote, hands, mic, draw, end | E2E `classes.spec.ts` |
