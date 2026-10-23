/** Client mirror of backend/internal/domain/wallet.go (AI helper bounds). */
import { type AIFollowUpInput, type AIQuestionInput } from "./api/client";
import { runeLength } from "./validation";

export const AIBounds = {
  goalMin: 20,
  goalMax: 1000,
  triedMin: 30,
  triedMax: 2000,
  errorMax: 2000,
  codeMax: 4000,
  followUpMin: 10,
  followUpMax: 1500,
  triedSinceMin: 20,
} as const;

function check(v: string, label: string, min: number, max: number): string | undefined {
  const n = runeLength(v.trim());
  if (min > 0 && n < min) return `${label} needs at least ${min} characters.`;
  if (n > max) return `${label} can be at most ${max} characters.`;
  return undefined;
}

export function validateQuestion(q: AIQuestionInput): Record<string, string | undefined> {
  return {
    goal: check(q.goal, "What you're trying to do", AIBounds.goalMin, AIBounds.goalMax),
    tried: check(q.tried, "What you've tried", AIBounds.triedMin, AIBounds.triedMax),
    error: check(q.error, "What happens", 0, AIBounds.errorMax),
    code: check(q.code, "Code", 0, AIBounds.codeMax),
  };
}

export function validateFollowUp(f: AIFollowUpInput): Record<string, string | undefined> {
  return {
    tried_since: check(f.tried_since, "What you tried since", AIBounds.triedSinceMin, AIBounds.triedMax),
    body: check(f.body, "Your question", AIBounds.followUpMin, AIBounds.followUpMax),
  };
}

export const hasErrors = (e: Record<string, string | undefined>) => Object.values(e).some(Boolean);

/** "4:05" until a time, or null once it has passed. */
export function countdown(until: Date | null, now: Date): string | null {
  if (!until) return null;
  const s = Math.ceil((until.getTime() - now.getTime()) / 1000);
  if (s <= 0) return null;
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.ceil((s % 3600) / 60)}m`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** How to write a prompt the helper can actually answer. Shown next to the form. */
export const PROMPT_TIPS = [
  { title: "Say the goal, not just the symptom", body: "“Filter tasks by status without a reload” beats “filter broken”." },
  { title: "Show what you tried", body: "Name the docs you read and the fix you attempted. It skips advice you've already used." },
  { title: "Paste the exact error", body: "Copy the message and the line it points to. Paraphrased errors hide the clue." },
  { title: "Trim the code", body: "Only the part that matters, ideally under 30 lines. Remove secrets and keys." },
  { title: "Say what you expected", body: "“I expected 3 items, got 0” tells the helper where to look." },
] as const;
