"use client";

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TASK_TYPES, type Persona, type TaskSpec } from "@/lib/api/schemas";
import { TYPE_LABEL } from "@/lib/board";
import { cn } from "@/lib/utils";
import { Bounds, durationLabel, normalizeLine, runeLength, validateBrief, validateDueMinutes, validateReleaseTime, validateTitle } from "@/lib/validation";

import { choiceItem } from "../app/choice";
import { PersonaAvatar } from "../app/persona-avatar";
import { TYPE_ICON } from "../app/task-badges";
import { REVIEW_HINT, REVIEW_LABEL } from "./assign-task-form";

export type SpecField = keyof TaskSpec;
export type SpecErrors = Partial<Record<SpecField, string>>;

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

export function emptySpec(personaId: string): TaskSpec {
  return { type: "feature", title: "", brief: "", persona_id: personaId, ...defaultsFor("feature") };
}

/** Client checks mirroring domain.ValidateTaskSpec. */
export function validateSpec(s: TaskSpec, personaOk: (id: string) => boolean): SpecErrors {
  const e: SpecErrors = {};
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
export const cleanSpec = (s: TaskSpec): TaskSpec => ({ ...s, title: normalizeLine(s.title), brief: s.brief.trim() });

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
}: {
  value: TaskSpec;
  onChange: (next: TaskSpec) => void;
  errors: SpecErrors;
  personas: readonly Persona[];
  idPrefix: string;
}) {
  const set = <K extends SpecField>(k: K, v: TaskSpec[K]) => onChange({ ...value, [k]: v });
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
              if (t) onChange({ ...value, type: t, ...(value.title ? {} : defaultsFor(t)) });
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
            if (v === "manual" || v === "self") set("review_mode", v);
          }}
          className="justify-start"
        >
          <ToggleGroupItem value="manual" className={choiceItem}>
            {REVIEW_LABEL.manual}
          </ToggleGroupItem>
          <ToggleGroupItem value="self" className={choiceItem}>
            {REVIEW_LABEL.self}
          </ToggleGroupItem>
        </ToggleGroup>
        {errors.review_mode ? <FieldError>{errors.review_mode}</FieldError> : <FieldDescription>{REVIEW_HINT[value.review_mode]}</FieldDescription>}
      </Field>
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
    </FieldGroup>
  );
}
