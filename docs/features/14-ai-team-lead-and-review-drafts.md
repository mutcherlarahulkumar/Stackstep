# Feature 14 — AI team lead and AI review drafts

Both use the Groq key the AI helper already uses. Without it, or with the switches off, the
scripted lead answers and reviews stay fully manual; nothing else changes.

## AI team lead

- Personas with **auto reply** on (the default Team Lead) answer student messages with a
  language model, in the persona's name and title. It sees the student's first name, day of the
  internship, up to five open tasks and the last eight messages of that conversation.
- Rules it follows: short plain-text replies, one question at most, hints not solutions, never
  promises approvals, points, credits, certificates or deadline changes, and hands anything
  personal, a complaint, payment or quitting to "a mentor will follow up here". Asked if it's a
  bot, it says the reply is automatic.
- It runs **after** the student's message is stored (never inside the request's transaction)
  and the reply arrives at the persona's usual delay (`LEAD_REPLY_DELAY`), or as soon as it is
  ready when the model is slower.
- Any model problem (off, error, timeout, rate limit, empty or over-long answer) or the shared
  per-minute cap (`AI_LEAD_PER_MINUTE`) falls back to the scripted lead. The student always
  gets a reply.
- **Honest personas:** every message no admin wrote carries `automated: true`, and web and app
  show "Automatic reply" under it. Admin replies as the persona are never labelled.
- `AI_TEAM_LEAD=off` keeps the scripted lead even with a Groq key.

## AI review drafts (desktop web)

- In **Reviews**, "Draft with AI" on a hand-in (or the button inside the review dialog) asks for
  a draft: a decision, a short summary for the admin, a note to the student and rubric ticks.
- It reads the task, its rubric, the hand-in link and note and, when the link is a public
  GitHub pull request, the PR's title, description, size and diff (cut at 48 KB).
  `GITHUB_TOKEN` (optional) raises GitHub's rate limit.
- **Suggestion only.** The dialog fills in, the admin edits and presses Approve or Send to
  student. The draft text is not stored; an audit row (who, which task, tokens) is.
- Per staff member per UTC day: `AI_REVIEW_DRAFTS_PER_DAY` (60). `AI_REVIEW_DRAFTS=off` hides
  the button.

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| AL1 | Student messages an auto-reply persona | AI reply after the delay, name prefix stripped, `automated: true`; web and app label it | backend `TestAITeamLead`, Flutter `app_routing_test.dart`, E2E `workspace.spec.ts` |
| AL2 | Prompt content | rules and board as system messages; the student's words only as a user turn | backend `TestAITeamLead`, lead `TestBuildPrompt` |
| AL3 | Second message | earlier turns sent as history | backend `TestAITeamLead` |
| AL4 | Model error, unusable or over-long answer, shared cap reached | scripted reply instead, still labelled | backend `TestAITeamLead`, lead `TestLLMFallsBack`, `TestCleanReply` |
| AL5 | Admin replies as the persona | not labelled | backend `TestAITeamLead` |
| AL6 | No key or `AI_TEAM_LEAD=off` | scripted lead; the model is never called | backend `TestScriptedLeadWhenAIOff` |
| RD1 | Draft for a GitHub PR hand-in | decision, summary, note and ticks; PR and diff in the prompt; `read_pr: true` | backend `TestReviewDraft`, E2E `reviews.spec.ts` |
| RD2 | After a draft | task still `in_review`; nothing sent until the admin reviews | backend `TestReviewDraft`, E2E `reviews.spec.ts` |
| RD3 | PR private or GitHub down; ticks of the wrong length | draft without the diff (`read_pr: false`); ticks dropped | backend `TestReviewDraft`, ai `TestParseReviewDraft` |
| RD4 | Model returns prose or fails; provider rate limit | 503 `ai_unavailable`; 429 `rate_limited` with Retry-After | backend `TestReviewDraft` |
| RD5 | Student asks; task not waiting for review; unknown or out-of-scope task | 403; 400 `invalid_state`; 404 | backend `TestReviewDraft` |
| RD6 | Over the daily limit | 429 with Retry-After; non-GitHub links are never fetched | backend `TestReviewDraftDailyLimit` |
| RD7 | No key or `AI_REVIEW_DRAFTS=off` | queue says `ai_drafts: false` (no button); endpoint 503 `not_configured` | backend `TestReviewDraftOff` |
| RD8 | PR URL parsing | only `https://github.com/{owner}/{repo}/pull/{n}` | ghpr `TestParse`, `TestGet` |
