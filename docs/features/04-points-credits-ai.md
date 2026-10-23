# Feature 04 — Points, credits and the AI helper

Everything an admin does stays manual (assigning, reviewing, grading). AI is used in exactly
one place: a **study helper** students can ask when they're stuck, powered by Groq. It is
built to teach rather than to hand out answers, it costs credits, and it is rate-limited.
Admin-side AI (review drafts, task drafting) is shown as **coming soon**.

## Points

Awarded once, when a task reaches *Done* (approved, marked done, or a finished quiz).

| Type | Points |
|---|---|
| Feature | 20 |
| Bug fix, DSA, Blog post | 15 |
| Code review, Quiz | 10 (quizzes × best score) |
| Git chore, Doc reading | 5 |
| Standup | 2 |

**On time** (+25%): the first hand-in, or the finish when there is no hand-in, happened by
the due time. A slow review never costs the student their bonus.

## Credits

| Event | Credits |
|---|---|
| Starting balance | +20 (once per internship) |
| A task reaches Done | +1 |
| Admin grant / revoke | ±1–100, with a reason the student sees |
| A question or follow-up to the AI helper | −1 (refunded if no answer comes back) |

## The AI helper

- **Explain it in one go.** A first question has fields: what you're trying to do (≥ 20
  characters), what you've tried (≥ 30), what happens instead, and the code. One-line
  prompts are refused, and the form explains how to write a good prompt.
- **Try it yourself first.** A follow-up opens 5 minutes after the last answer and must say
  what was tried since (≥ 20 characters). At most 3 follow-ups per conversation; after that
  the student starts a new question with everything they've learned.
- **Limits.** One question in flight at a time, 2 minutes between new questions, 8 questions
  per local day, and a server-wide cap (30/min) to stay inside Groq's limits. Every limit
  answers `rate_limited` with `retry_after_seconds` so the client can show a countdown.
- **Teaches, doesn't solve.** A fixed system prompt (students can't change it; their text is
  only ever a user message) tells the model to start from what they tried, explain the
  concept, give graded hints and one next step, keep snippets under ~10 lines, never write
  the full solution or PR, refuse quiz help and off-topic questions, and end with an
  **Asking tip** on how the question could have been clearer. Answers are Markdown and render
  safely (no raw HTML) on web and in the app.
- **Context.** A question can be linked to one of the student's tasks; its title and brief
  are sent as labelled context. Quiz tasks can't be linked.
- **Off by default.** Without `GROQ_API_KEY` the helper reports itself as not set up.
- **Oversight.** Staff in scope can read a student's AI conversations (read only) and see
  their credits.

## API (added)

| Method | Path | Who |
|---|---|---|
| GET | `/v1/me/wallet` | student |
| GET / POST | `/v1/me/ai/conversations` | student |
| GET | `/v1/me/ai/conversations/{id}`, POST `…/messages` | student |
| GET | `/v1/admin/enrollments/{id}/wallet`, POST `…/credits` | admin, college admin |
| GET | `/v1/admin/enrollments/{id}/ai/conversations`, `…/{conversation}` | admin, college admin |

New error codes: `insufficient_credits` (402), `ai_unavailable` (503).

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| PT1 | Feature approved after an on-time hand-in / handed in late | 25 / 20 points, +1 credit each, never twice | backend `TestPoints`, domain `TestTaskPoints` |
| PT2 | Quiz finished at 70% | points scale with the best score | domain `TestTaskPoints` |
| CR1 | Grant without a reason, over 100, or taking the balance below 0 | 422 | backend `TestCredits`, domain `TestValidateCreditGrant` |
| CR2 | Student or out-of-scope college admin changes credits | 403 / 404 | backend `TestCredits` |
| A1 | Goal < 20 or tried < 30 characters | 422 `goal`, `tried` | backend `TestAskAI` |
| A2 | Question answered | −1 credit; the model gets the fixed instruction first and the student's text as a user message | backend `TestAskAI`, `TestBuild` |
| A3 | Same `client_id` retried | same conversation, no second charge | backend `TestAskAI` |
| A4 | New question within 2 min; follow-up within 5 min or without "tried since" | 429 with `retry_after_seconds` / 422 `tried_since` | backend `TestAskAI` |
| A5 | Model fails or rate-limits us | credit refunded; a failed first question leaves no conversation; 503 `ai_unavailable` / 429 | backend `TestAskAI` |
| A6 | Question linked to a quiz; reading someone else's conversation | 422 `task_id` / 404 | backend `TestAskAI` |
| A7 | 9th question of the day; 4th follow-up | 429 until local midnight / 422 | backend `TestAILimits` |
| A8 | No credits left | 402 `insufficient_credits` | backend `TestAILimits` |
| A9 | No API key | wallet says disabled; asking returns 503 `not_configured` | backend `TestAINotConfigured` |
| A10 | Provider errors: 429 with Retry-After, 401, 5xx, empty answer | mapped to rate limited / not configured / unavailable | `ai.TestGroqErrors` |
