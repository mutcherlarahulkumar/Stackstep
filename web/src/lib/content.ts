/** Client mirror of backend/internal/domain/content.go. The server stays the authority. */
import { type ContentInput, type SubmissionInput } from "./api/client";
import { type TaskContent, type TaskType } from "./api/schemas";
import { normalizeLine, runeLength } from "./validation";

export const ContentBounds = {
  resources: 5,
  resourceTitleMax: 80,
  urlMax: 2048,
  questions: 20,
  promptMin: 3,
  promptMax: 500,
  optionsMin: 2,
  optionsMax: 6,
  optionMax: 200,
  passDefault: 70,
  attempts: 3,
  windowMax: 480,
  submissionNoteMax: 4000,
} as const;

export const emptyContent = (): ContentInput => ({ resources: [], quiz: null });

export const blankQuestion = () => ({ prompt: "", options: ["", ""], answer: 0 });

/** Staff always receive answers; a missing one becomes -1 so validation flags it. */
export function contentForEdit(c: TaskContent): ContentInput {
  return {
    resources: c.resources.map((r) => ({ ...r })),
    quiz: c.quiz ? { pass_percent: c.quiz.pass_percent, questions: c.quiz.questions.map((q) => ({ prompt: q.prompt, options: [...q.options], answer: q.answer ?? -1 })) } : null,
  };
}

export function validUrl(raw: string): boolean {
  const s = raw.trim();
  if (!s || s.length > ContentBounds.urlMax || /\s/.test(s)) return false;
  try {
    const u = new URL(s);
    return (u.protocol === "https:" || u.protocol === "http:") && u.host !== "" && u.username === "" && u.password === "";
  } catch {
    return false;
  }
}

/** Needs a link when handed in (PR, post, repo). Mirrors TaskType.NeedsLink. */
export function needsLink(t: TaskType): boolean {
  switch (t) {
    case "feature":
    case "bug_fix":
    case "git_chore":
    case "code_review":
    case "blog":
      return true;
    case "dsa":
    case "doc_reading":
    case "quiz":
    case "standup":
      return false;
  }
}

/** Errors keyed like the server: "resources[0].url", "quiz.questions[1].options". */
export function validateContent(c: ContentInput, type: TaskType): Record<string, string> {
  const e: Record<string, string> = {};
  if (c.resources.length > ContentBounds.resources) e.resources = `Add at most ${ContentBounds.resources} links.`;
  c.resources.forEach((r, i) => {
    const title = normalizeLine(r.title);
    if (!validUrl(r.url)) e[`resources[${i}].url`] = "Use a full link starting with https://.";
    else if (!title) e[`resources[${i}].title`] = "Give the link a name.";
    else if (runeLength(title) > ContentBounds.resourceTitleMax) e[`resources[${i}].title`] = `Link names can be at most ${ContentBounds.resourceTitleMax} characters.`;
  });
  if (type === "quiz" && !c.quiz) e.quiz = "Add at least one question.";
  if (type !== "quiz" && c.quiz) e.quiz = "Only quiz tasks have questions.";
  const q = c.quiz;
  if (q) {
    if (q.pass_percent < 1 || q.pass_percent > 100 || !Number.isInteger(q.pass_percent)) e["quiz.pass_percent"] = "Pass mark must be between 1% and 100%.";
    if (q.questions.length === 0) e["quiz.questions"] = "Add at least one question.";
    if (q.questions.length > ContentBounds.questions) e["quiz.questions"] = `A quiz can have at most ${ContentBounds.questions} questions.`;
    q.questions.forEach((qq, i) => {
      const k = `quiz.questions[${i}]`;
      const n = runeLength(qq.prompt.trim());
      if (n < ContentBounds.promptMin) e[`${k}.prompt`] = "Write the question (at least 3 characters).";
      else if (n > ContentBounds.promptMax) e[`${k}.prompt`] = `Questions can be at most ${ContentBounds.promptMax} characters.`;
      const opts = qq.options.map(normalizeLine);
      const lower = opts.map((o) => o.toLowerCase());
      if (opts.length < ContentBounds.optionsMin || opts.length > ContentBounds.optionsMax) e[`${k}.options`] = "Give 2 to 6 options.";
      else if (opts.some((o) => !o)) e[`${k}.options`] = "Options can't be empty.";
      else if (opts.some((o) => runeLength(o) > ContentBounds.optionMax)) e[`${k}.options`] = `Options can be at most ${ContentBounds.optionMax} characters.`;
      else if (new Set(lower).size !== lower.length) e[`${k}.options`] = "Each option must be different.";
      if (qq.answer < 0 || qq.answer >= opts.length) e[`${k}.answer`] = "Mark the right option.";
    });
  }
  return e;
}

export function cleanContent(c: ContentInput): ContentInput {
  return {
    resources: c.resources.map((r) => ({ title: normalizeLine(r.title), url: r.url.trim() })),
    quiz: c.quiz
      ? { pass_percent: c.quiz.pass_percent, questions: c.quiz.questions.map((q) => ({ prompt: q.prompt.trim(), options: q.options.map(normalizeLine), answer: q.answer })) }
      : null,
  };
}

/** Mirrors domain.ValidateSubmission for a move to in_review (required) or done (optional). */
export function validateSubmission(s: SubmissionInput, type: TaskType, required: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  const url = s.url.trim();
  const note = s.note.trim();
  if (url && !validUrl(url)) e.url = "Use a full link starting with https://.";
  if (runeLength(note) > ContentBounds.submissionNoteMax) e.note = `Notes can be at most ${ContentBounds.submissionNoteMax} characters.`;
  if (required && !e.url) {
    if (needsLink(type) && !url) e.url = "Add the link to your work (PR, post or repo).";
    else if (!url && !note) e.note = "Add your solution or a note for the reviewer.";
  }
  return e;
}

/** "10:00–14:00" for a surprise window, or the exact time. */
export function releaseLabel(time: string, window: number): string {
  if (window <= 0) return time;
  const [h = 0, m = 0] = time.split(":").map(Number);
  const end = h * 60 + m + window;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${time}–${pad(Math.floor(end / 60))}:${pad(end % 60)}`;
}
