/// Consent copy, kept in step with web/src/lib/legal.ts.
library;

/// Must match backend `domain.TermsVersion` and web `TERMS_VERSION`.
const termsVersion = 3;

const consentSummary = <String>[
  'We keep your GitHub login, name, email and avatar, and everything you do here, including tasks, hand-ins, chat and AI helper conversations.',
  "Your mentors and your college's placement cell can read your progress, chat and AI helper conversations.",
  'Teammates in chat are characters played by mentors. Some also reply automatically, sometimes with AI, and every automatic reply is labelled.',
  "AI helper questions, messages to teammates who reply automatically, and hand-ins a mentor asks AI to draft a review for are sent to Groq. Don't paste passwords or personal details.",
  'If you apply and pay for a cohort, we keep your application details and payment screenshots. Fees are non-refundable under any circumstances.',
  'You can download all of your data from the account menu at any time.',
];
