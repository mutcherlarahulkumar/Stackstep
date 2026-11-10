# Feature 22 — Reactions, livelier bubbles and a student-first inbox

## Reactions

- Six reactions: 👍 ❤️ 🎉 😂 🤔 👀. Each side of a conversation leaves each one at most
  once. The sides are the student, and staff speaking as the persona.
- **Web**: hover or focus a bubble for the smile button; chips under the bubble undo your own.
  **App**: long-press a message for the reaction bar (and Copy text); tap a chip to undo.
- Changes appear instantly and roll back if the server refuses. The other side sees them live
  through a `reaction` frame, which never counts as unread. Students react only on their own
  conversations, and staff only on students in their scope.

## Bubbles

Your own messages use a gradient bubble, and the other side's are muted. Messages sent within
five minutes group together, with one avatar and one time. Day separators, automatic-reply
labels and task buttons stay as before.

## Inbox, student first (admin console)

1. **Students**: every student with an open internship in your scope, whether or not they
   have chatted. Unread ones come first, then the most recent activity, then names. Filter by
   **flow** or **cohort**, or search by name or login. Each row shows the day, the flow or
   cohort, the unread count and "No chats yet".
2. Pick a student to see **who they're talking with**: one row per persona, with unread
   counts and the last line. **Start a chat as** lists every other persona.
3. Pick a persona to open the conversation and reply as them.

On phones the three steps stack, each with a Back button. **Latest chats** keeps the old
most-recent-first list, and **Broadcast** still sends one chat message to many students.

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| CH1 | Student and staff react; repeat the same reaction | Both listed, once each; repeating is a no-op | backend `TestReactions` |
| CH2 | Toggle off; unknown emoji | Removed; 422 | backend `TestReactions` |
| CH3 | Another student's message; unknown ID; college admin outside scope | 404 | backend `TestReactions` |
| CH4 | Inbox lists everyone in scope, including students who haven't chatted; a new student message moves them to the top | Unread first, with day number and counts | backend `TestInboxStudents`, E2E `flows.spec.ts` |
| CH5 | Filter by flow, cohort or name; college admin | Only those students; own college only | backend `TestInboxStudents`, E2E `chat.spec.ts` |
| CH6 | One student's conversations | `/admin/threads?enrollment_id=` returns only theirs | backend `TestInboxStudents` |
| CH7 | App reactions | Strict decoding; long-press bar; chip undo; server told | Flutter `reactions_test.dart` |
| CH8 | Web reactions live on both sides; start a chat as a new persona | Chip appears on the other screen without a reload | web `reactions.test.ts`, E2E `chat.spec.ts` |
