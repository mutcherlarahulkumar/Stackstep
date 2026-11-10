# Feature 08 — Account: consent, first-run guide, honest personas

Trust basics a college will ask about. Web and app. No new external services.

## Consent

- Everyone (students and staff) accepts the privacy notice and terms on first sign-in, and again
  when `TermsVersion` is bumped (backend `domain.TermsVersion`, web `TERMS_VERSION`, Dart
  `termsVersion`; keep them equal).
- The consent step summarises in five lines what is kept and who sees it, links to the public
  `/privacy` and `/terms` pages, and needs a ticked checkbox. "Not now" signs out.
- The client sends the version whose text it showed; the server refuses any other version, so a
  stale tab can't accept terms the user never saw.

## First-run guide (students)

Four steps: board, chat and personas, hand-ins, points/credits/AI helper. Skip or finish is
stored on the server (`onboarded_at`), so it shows once across web and app.

## Honest personas and AI helper

- Each chat header says who's behind the persona: "Played by a mentor" or
  "Mentor · some replies automatic" (`auto_reply`).
- The AI helper says mentors can read helper chats and that questions go to an AI provider.

Data export was removed in November 2026. Students ask their program admin for a copy.

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| AC1 | New user | `consent_required: true`, `onboarded: false`; consent screen before anything else | backend `TestAccountConsentAndOnboarding`, E2E `people.spec.ts` |
| AC2 | Old version, wrong type, current version | 422 `version` / 400 / 200 | backend `TestAccountConsentAndOnboarding` |
| AC3 | Finish the guide twice; reload | 200 both times; no guide or consent after reload | backend, E2E `people.spec.ts` |
| AC4 | Signed out | 401 for consent | backend |
| AC5 | Privacy and terms | public, linked from sign-in and the consent step | E2E `account.spec.ts` |
| AC6 | API without `account` in `/me` | client rejects the response (no silent skip of consent) | web `schemas.test.ts` |
| PT1 | Persona tag | label follows `auto_reply` | web `inbox.test.ts`, Flutter `models_test.dart`, E2E `people.spec.ts` |
| AM1 | App: consent, then the guide once | consent screen, button waits for the box; guide's four steps; finish stored | Flutter `app_routing_test.dart` |
