/// The first-run guide for students, kept in step with web/src/lib/onboarding.ts.
library;

import 'package:flutter/widgets.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

typedef GuideStep = ({IconData icon, String title, String body});

const guide = <GuideStep>[
  (
    icon: LucideIcons.squareKanban,
    title: 'Your board fills up each morning',
    body: "New tickets land at the start of your day. Move a card to In progress when you start, so your team lead knows what you're on.",
  ),
  (
    icon: LucideIcons.messagesSquare,
    title: 'Your team talks to you in chat',
    body: 'Each teammate has a role. Mentors play them, and a tag under the name says when some replies are automatic. Ask them anything.',
  ),
  (
    icon: LucideIcons.gitPullRequest,
    title: 'Hand in a pull request',
    body: "Push your work to a repository you own and send the PR link for review. Your note shows up in the assigner's chat, and reviews usually come back within a day.",
  ),
  (
    icon: LucideIcons.sparkles,
    title: 'Points, credits and the AI helper',
    body: 'Finishing on time earns points toward your certificate. Credits pay for the AI helper, which nudges you with hints rather than answers. Mentors can read helper chats.',
  ),
];
