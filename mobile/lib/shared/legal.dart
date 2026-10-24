/// Consent copy, kept in step with web/src/lib/legal.ts.
library;

/// Must match backend `domain.TermsVersion` and web `TERMS_VERSION`.
const termsVersion = 1;

const consentSummary = <String>[
  'We keep your GitHub login, name, email and avatar, and everything you do here: tasks, hand-ins, chat and AI helper conversations.',
  "Your mentors and your college's placement cell can read your progress, chat and AI helper conversations.",
  'Teammates in chat are characters played by mentors. Some also send automatic replies, and each chat says so.',
  "Questions to the AI helper are sent to Groq to generate answers. Don't paste passwords or personal details.",
  'You can download all of your data from the account menu at any time.',
];
