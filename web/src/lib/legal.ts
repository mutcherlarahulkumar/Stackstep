/** Privacy notice and terms, as data so the pages, the consent step and the app agree. */

/** Must match backend `domain.TermsVersion`; bump both when the text changes materially. */
export const TERMS_VERSION = 2;
export const LEGAL_UPDATED = "23 October 2026";

export type LegalSection = { heading: string; points: readonly string[] };

/** The short version shown on the consent step. */
export const CONSENT_SUMMARY: readonly string[] = [
  "We keep your GitHub login, name, email and avatar, and everything you do here: tasks, hand-ins, chat and AI helper conversations.",
  "Your mentors and your college's placement cell can read your progress, chat and AI helper conversations.",
  "Teammates in chat are characters played by mentors. Some also reply automatically, sometimes with AI, and every automatic reply is labelled.",
  "AI helper questions, messages to teammates who reply automatically, and hand-ins a mentor asks AI to draft a review for are sent to Groq. Don't paste passwords or personal details.",
  "You can download all of your data from the account menu at any time.",
];

export const PRIVACY: readonly LegalSection[] = [
  {
    heading: "What we collect",
    points: [
      "From GitHub when you sign in: your login, display name, email and avatar. We only ask GitHub for read access to your profile and email address, and we never see your GitHub password.",
      "What you do on Stackstep: task status changes, hand-in links and notes, quiz answers, chat messages, AI helper questions and answers, points, credits and certificates.",
      "Basic request logs (time, path, status, request id) to keep the service running. Logs don't include message text.",
    ],
  },
  {
    heading: "Who can see it",
    points: [
      "Stackstep admins and mentors can see everything about your internship so they can review your work.",
      "If your internship belongs to a college cohort, that college's placement cell can see your progress, chat and AI helper conversations, but not other colleges' students.",
      "A certificate's public verification page shows your name, program, dates and the numbers on the certificate. Nothing else is public.",
    ],
  },
  {
    heading: "Teammates and the AI helper",
    points: [
      "The people in your chat are characters that make the internship feel real. Mentors play them and answer you. Some also reply automatically: scripted notes such as standups and \u201cgot it\u201d, and an AI team lead that answers everyday questions when no mentor has. Each chat header says which teammates do, and every automatic reply is labelled \u201cAutomatic reply\u201d.",
      "Stackstep uses Groq, an AI provider, in three places: the AI helper (your question and the task brief), automatic teammate replies (your message, your open tasks and the recent conversation), and review drafts a mentor may ask for (the task, your hand-in note and your public pull request). A mentor always makes review decisions. Don't paste passwords, keys or personal details into chat or the helper.",
    ],
  },
  {
    heading: "How long we keep it",
    points: [
      "We keep your account and internship data while your account exists, so certificates stay verifiable and colleges can report placements.",
      "To have your account deleted, ask your program admin.",
    ],
  },
  {
    heading: "Your choices",
    points: [
      "Download everything we hold about you as a JSON file from the account menu (“Download my data”).",
      "Ask your program admin to correct or delete your data.",
      "We don't sell your data or show ads, and we don't use tracking cookies. We store your sign-in session in your browser.",
    ],
  },
];

export const TERMS: readonly LegalSection[] = [
  {
    heading: "The program",
    points: [
      "Stackstep is a practice internship. Tasks, deadlines and teammates are simulated to feel like a real software team; it is not employment and there is no pay.",
      "A certificate records the work you finished. Admins decide when to issue one and may revoke it if the work wasn't yours.",
    ],
  },
  {
    heading: "Your work",
    points: [
      "Hand in your own work. Pull requests should be in repositories you own. Reviewers are shown a warning when a link points elsewhere or was handed in before.",
      "You keep the rights to the code you write. You allow Stackstep staff to view it for review.",
    ],
  },
  {
    heading: "Behaviour",
    points: [
      "Be respectful in chat, including with automated teammates; mentors read these conversations.",
      "Don't try to break, overload or get around limits in the service, including AI helper credits.",
      "We may pause or end an internship that breaks these rules. You'll be told in chat why.",
    ],
  },
  {
    heading: "Service",
    points: [
      "We try to keep Stackstep available but can't promise it will never be down. If an outage makes you miss a deadline, tell your team lead in chat.",
      "We'll ask you to accept these terms again if they change in a way that matters.",
    ],
  },
];
