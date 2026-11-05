# Feature 21 — In-house mail and announcements

Students have a **Mail** box in Stackstep. Anything worth keeping lands there, instead of
in a notification that disappears.

## What arrives as mail

| Letter | When | From |
|---|---|---|
| **Welcome** | On joining. Says when day 1 is and when the first task arrives | Team lead |
| **Review** | A reviewer approves a hand-in or asks for changes. Carries the note, the rubric checklist and an "Open the task" button | The task's persona |
| **Certificate** | A certificate is issued, with its verify code | Team lead |
| **Announcement** | Staff send one (below) | The sender |
| **Live class** | Class invites and highlights promoted from a class (feature 23) | The host |

Letters are Markdown, read in the Stackstep reader. It renders coloured callouts
(`> [!TIP]`), code with a copy button, tables and checklists. Links open in a new tab, and
only http(s) links are live. A wide screen shows an outline beside long letters. Opening a
letter marks it read. The unread count shows on the Mail button (web) and the Mail tab (app),
and new letters arrive live over the socket with a toast.

## Announcements (admin console)

**Announcements** in the admin bar: pick **Everyone**, **students on a flow** or **students
in a cohort**, write a subject (3–120 characters) and a Markdown message (up to 20,000
characters) with a preview, and send. It reaches every student with an active or paused
internship in that group, at once. College admins only ever reach their own college. The
sent list shows each announcement's audience and how many have read it.

Broadcast in the Inbox stays for quick chat messages as a persona.

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| MA1 | A student joins | One unread welcome letter naming day 1 | backend `TestMailWelcomeAndReading` |
| MA2 | Open a letter; open someone else's; unknown ID | Body returned and marked read; 404; 404 | backend `TestMailWelcomeAndReading` |
| MA3 | Short or long subject, blank or long body, control characters, unknown audience, missing flow or cohort | 422 per field; subject whitespace normalized, body kept as written | domain `TestValidateAnnouncement`, backend `TestAnnouncements` |
| MA4 | To a cohort or a flow | Only those students get it; the sent list counts readers | backend `TestAnnouncements`, E2E `mail.spec.ts` |
| MA5 | College admin sends to everyone or to another college's cohort | Their college only; 422 | backend `TestAnnouncements` |
| MA6 | A group with no students; a student tries to announce | 422 "Nobody is in this group yet"; 403 | backend `TestAnnouncements` |
| MA7 | Review decision, certificate | Review letter with the note and task link; certificate letter | backend `TestSystemMail`, E2E `mail.spec.ts` |
| MA8 | App | Strict decoding (unknown kinds throw), Markdown reader, unread count drops, Open the task | Flutter `mail_test.dart` |
| MA9 | Web | Unread badge, live toast, read marks once, task link opens the task even though the workspace stays mounted | web `mail-queries.test.ts`, E2E `mail.spec.ts` |
| MA10 | Mailbox paging; same-instant letters | Cursor pages never repeat; letters keep the order they were sent | backend `TestAnnouncements` |
| RD1 | Reader safety | No raw HTML, scripts or images; `javascript:` links inert; others open in a new tab with `noopener` | web `prose.test.tsx` |
