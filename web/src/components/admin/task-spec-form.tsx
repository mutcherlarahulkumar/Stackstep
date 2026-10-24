"use client";

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type TemplateInput } from "@/lib/api/client";
import { TASK_TYPES, type Persona, type TaskSpec, type TaskType } from "@/lib/api/schemas";
import { TYPE_LABEL } from "@/lib/board";
import { blankQuestion, cleanContent, ContentBounds, contentForEdit, emptyContent, releaseLabel, validateContent } from "@/lib/content";
import { cn } from "@/lib/utils";
import { Bounds, durationLabel, normalizeLine, runeLength, validateBrief, validateDueMinutes, validateReleaseTime, validateTitle } from "@/lib/validation";

import { choiceItem } from "../app/choice";
import { PersonaAvatar } from "../app/persona-avatar";
import { TYPE_ICON } from "../app/task-badges";
import { REVIEW_HINT, REVIEW_LABEL } from "./assign-task-form";
import { PracticeEditor, QuizEditor, ResourcesEditor, RubricEditor } from "./content-editors";

/** A task spec as the admin edits it: quiz answers are always set. */
export type SpecDraft = TemplateInput;
/** Field errors keyed like the server ("title", "quiz.questions[0].options", "day"). */
export type SpecErrors = Record<string, string | undefined>;

export const specFromServer = (s: TaskSpec): SpecDraft => ({
  type: s.type,
  title: s.title,
  brief: s.brief,
  persona_id: s.persona_id,
  review_mode: s.review_mode,
  release_time: s.release_time,
  due_minutes: s.due_minutes,
  release_window: s.release_window,
  content: contentForEdit(s.content),
});

/** Surprise windows offered in the editor (minutes). */
export const WINDOW_CHOICES = [0, 60, 120, 240, 480] as const;

/** Switching type keeps the quiz in step: quizzes get a first question and self-check. */
export function withType(s: SpecDraft, type: TaskType): SpecDraft {
  const next: SpecDraft = { ...s, type, ...(s.title ? {} : defaultsFor(type)) };
  if (type === "quiz") {
    next.review_mode = "self";
    next.content = { ...s.content, quiz: s.content.quiz ?? { pass_percent: ContentBounds.passDefault, questions: [blankQuestion()] } };
  } else next.content = { ...s.content, quiz: null };
  if (type !== "dsa") next.content = { ...next.content, practice: null };
  if (type === "quiz") next.content = { ...next.content, rubric: [] };
  return next;
}

/** Time-to-finish choices, 15 minutes to 7 days (the server's range). */
export const DUE_CHOICES = [15, 30, 60, 120, 240, 480, 1440, 2880, 4320, 7200, 10_080] as const;

/** Sensible starting values by type: practice is self-checked, code goes through review. */
export function defaultsFor(type: TaskSpec["type"]): Pick<TaskSpec, "review_mode" | "due_minutes" | "release_time"> {
  switch (type) {
    case "standup":
      return { review_mode: "self", due_minutes: 60, release_time: "09:30" };
    case "doc_reading":
    case "quiz":
      return { review_mode: "self", due_minutes: 480, release_time: "10:00" };
    case "dsa":
      return { review_mode: "manual", due_minutes: 480, release_time: "10:00" };
    case "blog":
      return { review_mode: "manual", due_minutes: 4320, release_time: "11:00" };
    case "feature":
    case "bug_fix":
    case "git_chore":
    case "code_review":
      return { review_mode: "manual", due_minutes: 1440, release_time: "10:00" };
  }
}

export function emptySpec(personaId: string): SpecDraft {
  return { type: "feature", title: "", brief: "", persona_id: personaId, release_window: 0, content: emptyContent(), ...defaultsFor("feature") };
}

/** Client checks mirroring domain.ValidateTaskSpec. */
export function validateSpec(s: SpecDraft, personaOk: (id: string) => boolean): SpecErrors {
  const e: SpecErrors = validateContent(s.content, s.type, s.review_mode);
  if (s.type === "quiz" && s.review_mode !== "self") e.review_mode = "Quizzes are graded automatically, so the student finishes them.";
  const [h = 0, m = 0] = s.release_time.split(":").map(Number);
  if (s.release_window < 0 || s.release_window > ContentBounds.windowMax) e.release_window = "A surprise window can be at most 8 hours.";
  else if (h * 60 + m + s.release_window > 23 * 60 + 59) e.release_window = "The surprise window must end the same day.";
  const title = validateTitle(s.title);
  if (title) e.title = title;
  const brief = validateBrief(s.brief);
  if (brief) e.brief = brief;
  if (!personaOk(s.persona_id)) e.persona_id = "Choose an active persona.";
  const release = validateReleaseTime(s.release_time);
  if (release) e.release_time = release;
  const due = validateDueMinutes(s.due_minutes);
  if (due) e.due_minutes = due;
  return e;
}

/** Normalizes text the way the server will store it. */
export const cleanSpec = (s: SpecDraft): SpecDraft => ({ ...s, title: normalizeLine(s.title), brief: s.brief.trim(), content: cleanContent(s.content) });

/** Picks the errors for one row out of a server response keyed like "items[3].title". */
export function rowErrors(fields: Record<string, string>, prefix: string): SpecErrors & { day?: string } {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
  return out;
}

export function SpecFields({
  value,
  onChange,
  errors,
  personas,
  idPrefix,
  showWindow = true,
}: {
  value: SpecDraft;
  onChange: (next: SpecDraft) => void;
  errors: SpecErrors;
  personas: readonly Persona[];
  idPrefix: string;
  /** Surprise windows apply to flows and library tasks, not one-off assignments. */
  showWindow?: boolean;
}) {
  const set = <K extends keyof SpecDraft>(k: K, v: SpecDraft[K]) => onChange({ ...value, [k]: v });
  const titleLen = runeLength(normalizeLine(value.title));
  const id = (s: string) => `${idPrefix}-${s}`;
  return (
    <FieldGroup>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!errors.type}>
          <FieldLabel htmlFor={id("type")}>Type</FieldLabel>
          <Select
            value={value.type}
            onValueChange={(v) => {
              const t = TASK_TYPES.find((x) => x === v);
              if (t) onChange(withType(value, t));
            }}
          >
            <SelectTrigger id={id("type")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_TYPES.map((t) => {
                const Icon = TYPE_ICON[t];
                return (
                  <SelectItem key={t} value={t}>
                    <Icon aria-hidden /> {TYPE_LABEL[t]}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {errors.type ? <FieldError>{errors.type}</FieldError> : null}
        </Field>
        <Field data-invalid={!!errors.persona_id}>
          <FieldLabel htmlFor={id("persona")}>Posted by</FieldLabel>
          <Select value={value.persona_id} onValueChange={(v) => set("persona_id", v)}>
            <SelectTrigger id={id("persona")} className="w-full">
              <SelectValue placeholder="Pick a persona" />
            </SelectTrigger>
            <SelectContent>
              {personas.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <PersonaAvatar persona={p} size="sm" /> {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.persona_id ? <FieldError>{errors.persona_id}</FieldError> : null}
        </Field>
      </div>
      <Field data-invalid={!!errors.title}>
        <div className="flex items-baseline justify-between">
          <FieldLabel htmlFor={id("title")}>Title</FieldLabel>
          <span className={cn("text-xs tabular-nums", titleLen > Bounds.titleMax ? "text-destructive" : "text-muted-foreground")}>
            {titleLen} / {Bounds.titleMax}
          </span>
        </div>
        <Input id={id("title")} value={value.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Two-pointer warmup" aria-invalid={!!errors.title} autoComplete="off" />
        {errors.title ? <FieldError>{errors.title}</FieldError> : null}
      </Field>
      <Field data-invalid={!!errors.brief}>
        <FieldLabel htmlFor={id("brief")}>Brief</FieldLabel>
        <Textarea id={id("brief")} rows={5} value={value.brief} onChange={(e) => set("brief", e.target.value)} placeholder="What done looks like, links, the branch name." aria-invalid={!!errors.brief} />
        {errors.brief ? <FieldError>{errors.brief}</FieldError> : <FieldDescription>Optional · up to {Bounds.briefMax.toLocaleString()} characters</FieldDescription>}
      </Field>
      <Field data-invalid={!!errors.review_mode}>
        <FieldLabel>Review</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          value={value.review_mode}
          onValueChange={(v) => {
            if (v === "self") onChange({ ...value, review_mode: v, content: { ...value.content, rubric: [] } });
            else if (v === "manual") set("review_mode", v);
          }}
          className="justify-start"
          disabled={value.type === "quiz"}
        >
          <ToggleGroupItem value="manual" className={choiceItem}>
            {REVIEW_LABEL.manual}
          </ToggleGroupItem>
          <ToggleGroupItem value="self" className={choiceItem}>
            {REVIEW_LABEL.self}
          </ToggleGroupItem>
        </ToggleGroup>
        {errors.review_mode ? (
          <FieldError>{errors.review_mode}</FieldError>
        ) : (
          <FieldDescription>{value.type === "quiz" ? "Quizzes grade themselves against your answer key." : REVIEW_HINT[value.review_mode]}</FieldDescription>
        )}
      </Field>
      {value.content.quiz ? (
        <QuizEditor value={value.content.quiz} onChange={(quiz) => set("content", { ...value.content, quiz })} errors={errors} idPrefix={id("quiz")} />
      ) : null}
      {errors.quiz ? <FieldError>{errors.quiz}</FieldError> : null}
      {value.review_mode === "manual" && value.type !== "quiz" ? (
        <RubricEditor value={value.content.rubric} onChange={(rubric) => set("content", { ...value.content, rubric })} errors={errors} idPrefix={id("rubric")} />
      ) : null}
      {value.type === "dsa" ? (
        <PracticeEditor value={value.content.practice} onChange={(practice) => set("content", { ...value.content, practice })} errors={errors} idPrefix={id("practice")} />
      ) : null}
      <ResourcesEditor value={value.content.resources} onChange={(resources) => set("content", { ...value.content, resources })} errors={errors} idPrefix={id("links")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!errors.release_time}>
          <FieldLabel htmlFor={id("release")}>Shows up at</FieldLabel>
          <Input id={id("release")} type="time" step={60} value={value.release_time} onChange={(e) => set("release_time", e.target.value.slice(0, 5))} aria-invalid={!!errors.release_time} />
          {errors.release_time ? <FieldError>{errors.release_time}</FieldError> : <FieldDescription>In the student&apos;s time zone.</FieldDescription>}
        </Field>
        <Field data-invalid={!!errors.due_minutes}>
          <FieldLabel htmlFor={id("due")}>Time to finish</FieldLabel>
          <Select value={String(value.due_minutes)} onValueChange={(v) => set("due_minutes", Number(v))}>
            <SelectTrigger id={id("due")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(DUE_CHOICES.includes(value.due_minutes as (typeof DUE_CHOICES)[number]) ? DUE_CHOICES : [...DUE_CHOICES, value.due_minutes].sort((a, b) => a - b)).map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {durationLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.due_minutes ? <FieldError>{errors.due_minutes}</FieldError> : <FieldDescription>Never past the internship&apos;s last day.</FieldDescription>}
        </Field>
      </div>
      {showWindow ? (
        <Field data-invalid={!!errors.release_window}>
          <FieldLabel htmlFor={id("window")}>Surprise</FieldLabel>
          <Select value={String(value.release_window)} onValueChange={(v) => set("release_window", Number(v))}>
            <SelectTrigger id={id("window")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOW_CHOICES.map((w) => (
                <SelectItem key={w} value={String(w)}>
                  {w === 0 ? "Exact time" : `Random time within ${durationLabel(w)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.release_window ? (
            <FieldError>{errors.release_window}</FieldError>
          ) : (
            <FieldDescription>
              {value.release_window === 0
                ? "Shows up at exactly this time."
                : `Each student gets it at a different time between ${releaseLabel(value.release_time, value.release_window)}.`}
            </FieldDescription>
          )}
        </Field>
      ) : null}
    </FieldGroup>
  );
}
