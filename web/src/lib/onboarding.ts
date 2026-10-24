/** The first-run guide for students. Mirrored in mobile/lib/shared/onboarding.dart. */
export type GuideIcon = "board" | "chat" | "handin" | "points";
export type GuideStep = { icon: GuideIcon; title: string; body: string };

export const GUIDE: readonly GuideStep[] = [
  {
    icon: "board",
    title: "Your board fills up each morning",
    body: "New tickets land at the start of your day. Move a card to In progress when you start, so your team lead knows what you're on.",
  },
  {
    icon: "chat",
    title: "Your team talks to you in chat",
    body: "Each teammate has a role. Mentors play them, and a tag under the name says when some replies are automatic. Ask them anything.",
  },
  {
    icon: "handin",
    title: "Hand in a pull request",
    body: "Push your work to a repository you own and send the PR link for review. Your note shows up in the assigner's chat, and reviews usually come back within a day.",
  },
  {
    icon: "points",
    title: "Points, credits and the AI helper",
    body: "Finishing on time earns points toward your certificate. Credits pay for the AI helper, which nudges you with hints rather than answers. Mentors can read helper chats.",
  },
];
