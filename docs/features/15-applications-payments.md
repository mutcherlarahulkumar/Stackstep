# Feature 15 — Applications and payments

Students who sign in without an active internship apply to an open cohort and pay by UPI.
They never see a previous cohort's chats, board or progress until an admin confirms the
payment and enrolls them.

## Student flow (web; the app shows status and links to the web)

1. **Your details**: full name, phone, date of birth, college, course, branch, graduation year
   and the cohort (open cohorts with a fee, starting no more than a week ago). Saved as a draft.
2. **Pay**: the platform QR, UPI ID, payee and the cohort fee. The student must tick
   "Fees are non-refundable under any circumstances" before uploading the payment screenshot
   (PNG, JPG or WebP, up to 4 MB), the UTR and the amount paid.
3. **Waiting**: "Payment received — awaiting confirmation". A chat with the admissions team
   is open at every step.

When an admin flags an issue, the student sees what is wrong in plain words and only the
actions that fix it:

| Flag | Student sees | Actions |
|---|---|---|
| `partial_payment` | received ₹X of ₹Y, pay the remaining ₹Z | QR again → upload |
| `cohort_mismatch` | the amount fits another cohort | change cohort, or pay the difference |
| `cohort_full` | no seats left; what was paid carries over | change cohort, or pay |
| `unclear_proof` | upload a clearer screenshot | upload |
| `payment_not_found` | check the UTR, upload the right one | upload |
| `duplicate_proof` | that screenshot or UTR was used before | upload |
| `details_incorrect` | fix the details | edit details, send back |
| `other` | the admin's note | everything |

Switching cohort carries the amount already paid: fully covered → back to review; short →
flagged `partial_payment` with the new balance. **No refunds**: rejection needs a reason and
always posts "Fees are non-refundable under any circumstances." The student can then start a
new application.

## Admin (desktop web)

- **Applications** in the admin nav, waiting count as a badge. Submitted first.
- Detail: the details, fee, paid and due, every screenshot (full size), UTR and amount, a
  warning when a screenshot or UTR was used on another application, and the chat.
- Decide: **Approve** (confirm the amount received, which must cover the fee; enrolls the
  student in the same transaction, optional flow), **Flag** (reason, amount received, note),
  **Reject** (reason required).
- **Payment settings** (Setup → Payments, platform admins): UPI ID, payee, note, QR image.
- **Cohort admissions** (Colleges & cohorts, platform admins): fee in ₹ and "applications open".
- College admins see applications to their college's cohorts only.

## Limits

10 screenshots and 40 messages per student per day; screenshots ≤ 4 MB, QR ≤ 2 MB; image
type is read from the bytes, not the name.

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| AP1 | Signed in, not enrolled | apply view: open cohorts with fees, UPI, QR, no-refund policy; no old chats | backend `TestApplicationHappyPathWithPartialPayment`, E2E `apply.spec.ts` |
| AP2 | Bad phone, DOB, year, empty name, unknown cohort | 422 with a message per field | backend `TestApplicationHappyPathWithPartialPayment`, domain `TestValidateDetails` |
| AP3 | Two tabs edit the draft | the stale one gets 409 `version_conflict` | backend `TestApplicationHappyPathWithPartialPayment` |
| AP4 | Not an image, short UTR, zero amount; upload while waiting | 422 per field; 400 `invalid_state` | backend `TestApplicationHappyPathWithPartialPayment`, domain `TestValidateProof` |
| AP5 | Admin queue | waiting count, unread, screenshot viewable; other colleges' admins get 404 | backend `TestApplicationHappyPathWithPartialPayment`, E2E `apply.spec.ts` |
| AP6 | Partial payment | approve refused below the fee; flag shows the balance; same screenshot again refused | backend `TestApplicationHappyPathWithPartialPayment`, E2E `apply.spec.ts` |
| AP7 | Approved | enrolled, workspace opens, system message | backend `TestApplicationHappyPathWithPartialPayment`, E2E `apply.spec.ts` |
| AP8 | Decide twice; enrolled student applies | 422 `invalid_transition`; 400 `invalid_state` | backend `TestApplicationHappyPathWithPartialPayment` |
| AP9 | Paid another cohort's fee | flagged mismatch → switch → back to review with nothing due | backend `TestApplicationIssues` |
| AP10 | Enrolled student tries to apply | 400 `invalid_state` | backend `TestApplicationIssues` |
| AP11 | Chat; rejection | both sides see messages; reason required; "non-refundable" posted; a new application can start, old screenshots refused | backend `TestApplicationIssues` |
| AP12 | Payment settings and admissions | platform admins only; UPI ID checked; PNG/JPG/WebP QR only; fee required to open | backend `TestApplicationIssues` |
