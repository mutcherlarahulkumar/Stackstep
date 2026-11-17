import { type LabComment, type LabDifficulty, type LabExercise, type LabIssue, type LabReview, type LabSeverity, type LabVerdict } from "./api/schemas";

/** Mirrors the server's grading rules (backend/internal/reviewlab). */
export const LAB = {
  maxComments: 30,
  commentMax: 2000,
  summaryMax: 4000,
  freeNoise: 2,
  noisePenalty: 5,
  approvePenalty: 10,
  defaultPass: 60,
  taskTries: 3,
} as const;

export const DIFFICULTY_LABEL: Record<LabDifficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

export const SEVERITY_LABEL: Record<LabSeverity, string> = {
  bug: "Bug",
  security: "Security",
  performance: "Performance",
  accessibility: "Accessibility",
};

export const VERDICT_LABEL: Record<LabVerdict, { title: string; hint: string }> = {
  comment: { title: "Comment", hint: "Submit general feedback without explicit approval." },
  approve: { title: "Approve", hint: "Give your approval to merge these changes." },
  request_changes: { title: "Request changes", hint: "Submit feedback that must be addressed before merging." },
};

/** A pending comment: where it sits and what it says. */
export type Draft = LabComment & { id: string };

export const lineKey = (path: string, side: "new" | "old", line: number) => `${path}:${side}:${line}`;

/** Comments grouped by the line they sit under. */
export function byLine<T extends LabComment>(comments: readonly T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const c of comments) {
    const k = lineKey(c.path, c.side, c.line);
    out.set(k, [...(out.get(k) ?? []), c]);
  }
  return out;
}

/** Planted issues, keyed by the last line of each (where the reveal is shown). */
export function issuesByLine(issues: readonly LabIssue[]): Map<string, LabIssue[]> {
  const out = new Map<string, LabIssue[]>();
  for (const i of issues) {
    const k = lineKey(i.path, "new", i.to);
    out.set(k, [...(out.get(k) ?? []), i]);
  }
  return out;
}

/** Whether a new-side line sits inside a planted issue (for highlighting after grading). */
export function inIssue(issues: readonly LabIssue[], path: string, line: number | null): LabIssue | null {
  if (line === null) return null;
  return issues.find((i) => i.path === path && line >= i.from && line <= i.to) ?? null;
}

/** Indexes of comments that found a planted issue. */
export function usefulComments(review: LabReview): Set<number> {
  return new Set(review.issues.flatMap((i) => (i.comment === null ? [] : [i.comment])));
}

/** One line under the score, plain words. */
export function scoreLine(r: LabReview): string {
  const parts = [`Found ${r.found} of ${r.total} planted ${r.total === 1 ? "problem" : "problems"}`];
  if (r.noise_penalty > 0) parts.push(`${r.noise_penalty} off for comments that pointed at nothing`);
  if (r.approve_penalty > 0) parts.push(`${r.approve_penalty} off for approving a pull request with problems`);
  return parts.join(", ") + ".";
}

export const totals = (ex: Pick<LabExercise, "file_diffs">) => ({
  files: ex.file_diffs.length,
  additions: ex.file_diffs.reduce((n, f) => n + f.additions, 0),
  deletions: ex.file_diffs.reduce((n, f) => n + f.deletions, 0),
});

/** Validation the server repeats; returns a message or null. */
export function checkReview(comments: readonly LabComment[], summary: string): string | null {
  if (comments.length === 0) return "Leave at least one comment on a line before you submit.";
  if (comments.length > LAB.maxComments) return `Leave at most ${LAB.maxComments} comments.`;
  if ([...summary].length > LAB.summaryMax) return `The summary can be at most ${LAB.summaryMax} characters.`;
  return null;
}
