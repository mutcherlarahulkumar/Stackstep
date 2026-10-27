"use client";

import { CircleAlert, Send, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, messageFor } from "@/lib/api/errors";
import { TASK_TYPES, type ReviewMode, type Student, type Task, type TaskType } from "@/lib/api/schemas";
import { TYPE_LABEL } from "@/lib/board";
import { dateTimeLabel, firstName, fromLocalInput, toLocalInput } from "@/lib/format";
import { type ContentInput } from "@/lib/api/client";
import { blankQuestion, cleanContent, ContentBounds, emptyContent, validateContent } from "@/lib/content";
import { DEFAULT_PERSONA_ID } from "@/lib/inbox";
import { usePersonas } from "@/lib/inbox-queries";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { Bounds, normalizeLine, runeLength, validateBrief, validateSchedule, validateTitle } from "@/lib/validation";

import { choiceItem } from "../app/choice";
import { DateTimePicker } from "../app/date-picker";
import { PersonaAvatar } from "../app/persona-avatar";
import { PracticeEditor, QuizEditor, ResourcesEditor, RubricEditor } from "./content-editors";
import { TYPE_ICON } from "../app/task-badges";

type DuePreset = "2h" | "today" | "tomorrow" | "custom";
type Errors = Record<string, string | undefined>;

export const REVIEW_LABEL: Record<ReviewMode, string> = { manual: "Admin reviews", self: "Student marks done" };
export const REVIEW_HINT: Record<ReviewMode, string> = {
  manual: "The student submits it and an admin approves or requests changes.",
  self: "The student marks it done themselves. Good for reading and practice.",
};

function presetDue(p: Exclude<DuePreset, "custom">, start: Date): Date {
  const at = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 18, 0, 0, 0);
  switch (p) {
    case "2h":
      return new Date(start.getTime() + 2 * 3_600_000);
    case "today":
      return at(start, 0);
    case "tomorrow":
      return at(start, 1);
  }
}

/**
 * Assign a task to one student. Client checks mirror the server; the server's own field
 * errors (e.g. "after this internship ends") land on the same inputs.
 */
export function AssignTaskForm({ student, onAssigned }: { student: Student; onAssigned: (t: Task) => void }) {
  const { api } = useSession();
  const [type, setType] = useState<TaskType>("feature");
  const personas = usePersonas();
  const [personaPick, setPersonaPick] = useState<string | null>(null);
  const [reviewMode, setReviewMode] = useState<ReviewMode>("manual");
  const [content, setContent] = useState<ContentInput>(emptyContent());
  const changeType = (t: TaskType) => {
    setType(t);
    if (t === "quiz") {
      setReviewMode("self");
      setContent((c) => ({ ...c, quiz: c.quiz ?? { pass_percent: ContentBounds.passDefault, questions: [blankQuestion()] } }));
    } else setContent((c) => ({ ...c, quiz: null }));
    if (t !== "dsa") setContent((c) => ({ ...c, practice: null }));
    if (t === "quiz") setContent((c) => ({ ...c, rubric: [] }));
  };
  const personaList = personas.data ?? [];
  // The admin's pick, else the default team lead, else the first persona; null lets the server decide.
  const personaId = personaPick ?? (personaList.some((p) => p.id === DEFAULT_PERSONA_ID) ? DEFAULT_PERSONA_ID : (personaList[0]?.id ?? null));
  const persona = personaList.find((p) => p.id === personaId);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [later, setLater] = useState(false);
  // Persona, review, rubric, practice, links and start time fold away; errors there unfold them.
  const [more, setMore] = useState(false);
  const [startAt, setStartAt] = useState("");
  const now = useMemo(() => new Date(), []);
  const todayOpen = presetDue("today", now).getTime() - now.getTime() >= Bounds.minTaskMinutes * 60_000;
  const [preset, setPreset] = useState<DuePreset>(todayOpen ? "today" : "tomorrow");
  const [customDue, setCustomDue] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const moreOpen = more || Object.entries(errors).some(([k, v]) => !!v && /^(persona_id|review_mode|scheduled_for|rubric|resources|practice)/.test(k));
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const start = later ? fromLocalInput(startAt) : null;
  const due = preset === "custom" ? fromLocalInput(customDue) : presetDue(preset, start ?? new Date());
  const titleLen = runeLength(normalizeLine(title));
  const clear = (k: keyof Errors) => setErrors((e) => ({ ...e, [k]: undefined }));
  const paused = student.enrollment.status !== "active";

  const submit = async () => {
    const schedule = validateSchedule(new Date(), start, due);
    const next: Errors = {
      ...validateContent(content, type, reviewMode),
      title: validateTitle(title) ?? undefined,
      brief: validateBrief(brief) ?? undefined,
      scheduled_for: later && !start ? "Pick a start time." : (schedule.scheduled_for ?? undefined),
      due_at: schedule.due_at ?? undefined,
    };
    setErrors(next);
    setFormError(null);
    if (Object.values(next).some(Boolean) || !due) return;
    setSubmitting(true);
    try {
      const task = await api.createTask(student.enrollment.id, {
        type,
        persona_id: personaId,
        review_mode: reviewMode,
        title: normalizeLine(title),
        brief: brief.trim(),
        scheduled_for: start,
        due_at: due,
        content: cleanContent(content),
      });
      setTitle("");
      setBrief("");
      setContent({ resources: [], quiz: type === "quiz" ? { pass_percent: ContentBounds.passDefault, questions: [blankQuestion()] } : null, practice: null, rubric: [] });
      onAssigned(task);
    } catch (e) {
      if (e instanceof ApiError && e.code === "validation_failed" && Object.keys(e.fields).length) setErrors(e.fields as Errors);
      else setFormError(messageFor(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-6"
      aria-label={`Assign a task to ${student.user.name}`}
    >
      {paused ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>{student.user.name}&apos;s internship is {student.enrollment.status}</AlertTitle>
          <AlertDescription>Tasks can only be assigned to active internships.</AlertDescription>
        </Alert>
      ) : null}
      {formError ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>Couldn&apos;t assign this task</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        <Field data-invalid={!!errors.title}>
          <div className="flex items-baseline justify-between">
            <FieldLabel htmlFor="task-title">Title</FieldLabel>
            <span className={cn("text-xs tabular-nums", titleLen > Bounds.titleMax ? "text-destructive" : "text-muted-foreground")}>
              {titleLen} / {Bounds.titleMax}
            </span>
          </div>
          <Input
            id="task-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              clear("title");
            }}
            placeholder="e.g. Add filtering to the task list"
            aria-invalid={!!errors.title}
            autoComplete="off"
          />
          {errors.title ? <FieldError>{errors.title}</FieldError> : null}
        </Field>
        <Field data-invalid={!!errors.type}>
          <FieldLabel htmlFor="task-type">Type</FieldLabel>
          <Select
            value={type}
            onValueChange={(v) => {
              const t = TASK_TYPES.find((x) => x === v);
              if (t) changeType(t);
            }}
          >
            <SelectTrigger id="task-type" className="w-full">
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
        <Field data-invalid={!!errors.brief}>
          <FieldLabel htmlFor="task-brief">Brief</FieldLabel>
          <Textarea
            id="task-brief"
            value={brief}
            onChange={(e) => {
              setBrief(e.target.value);
              clear("brief");
            }}
            rows={5}
            placeholder="What done looks like, the branch name, and links to docs."
            aria-invalid={!!errors.brief}
          />
          {errors.brief ? (
            <FieldError>{errors.brief}</FieldError>
          ) : (
            <FieldDescription>Optional · up to {Bounds.briefMax.toLocaleString()} characters</FieldDescription>
          )}
        </Field>
        <Field data-invalid={!!errors.due_at}>
          <FieldLabel>Due</FieldLabel>
          <ToggleGroup
            type="single"
            variant="outline"
            value={preset}
            onValueChange={(v) => {
              if (!v) return;
              setPreset(v as DuePreset);
              clear("due_at");
            }}
            className="flex-wrap justify-start"
          >
            <ToggleGroupItem value="2h" className={choiceItem}>In 2 hours</ToggleGroupItem>
            {todayOpen ? <ToggleGroupItem value="today" className={choiceItem}>Today 6 PM</ToggleGroupItem> : null}
            <ToggleGroupItem value="tomorrow" className={choiceItem}>Tomorrow 6 PM</ToggleGroupItem>
            <ToggleGroupItem value="custom" className={choiceItem}>Pick…</ToggleGroupItem>
          </ToggleGroup>
          {preset === "custom" ? (
            <DateTimePicker
              aria-label="Due"
              value={customDue}
              min={toLocalInput(now)}
              onChange={(v) => {
                setCustomDue(v);
                clear("due_at");
              }}
              invalid={!!errors.due_at}
            />
          ) : null}
          {errors.due_at ? <FieldError>{errors.due_at}</FieldError> : due ? <FieldDescription>{dateTimeLabel(due)}</FieldDescription> : null}
        </Field>
        {content.quiz ? (
          <QuizEditor value={content.quiz} onChange={(quiz) => setContent((c) => ({ ...c, quiz }))} errors={errors} idPrefix="assign-quiz" />
        ) : null}
        {moreOpen ? (
          <>
            <Field data-invalid={!!errors.persona_id}>
              <FieldLabel htmlFor="task-persona">Posted by</FieldLabel>
              <Select
                value={personaId ?? ""}
                onValueChange={(v) => {
                  setPersonaPick(v);
                  clear("persona_id");
                }}
                disabled={personaList.length === 0}
              >
                <SelectTrigger id="task-persona" className="w-full" data-testid="task-persona">
                  <SelectValue placeholder={personas.isPending ? "Loading…" : "Team lead"} />
                </SelectTrigger>
                <SelectContent>
                  {personaList.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <PersonaAvatar persona={p} size="sm" /> {p.name} <span className="text-muted-foreground">· {p.title}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.persona_id ? (
                <FieldError>{errors.persona_id}</FieldError>
              ) : (
                <FieldDescription>{persona ? `Announced in ${firstName(student.user.name)}'s chat with ${persona.name}.` : "Announced in chat."}</FieldDescription>
              )}
            </Field>
            <Field data-invalid={!!errors.review_mode}>
              <FieldLabel>Review</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                value={reviewMode}
                onValueChange={(v) => {
                  if (v === "manual" || v === "self") setReviewMode(v);
                  if (v === "self") setContent((c) => ({ ...c, rubric: [] }));
                }}
                className="justify-start"
                disabled={type === "quiz"}
              >
                <ToggleGroupItem value="manual" className={choiceItem}>
                  {REVIEW_LABEL.manual}
                </ToggleGroupItem>
                <ToggleGroupItem value="self" className={choiceItem} data-testid="review-self">
                  {REVIEW_LABEL.self}
                </ToggleGroupItem>
              </ToggleGroup>
              {errors.review_mode ? (
                <FieldError>{errors.review_mode}</FieldError>
              ) : (
                <FieldDescription>{type === "quiz" ? "Quizzes grade themselves against your answer key." : REVIEW_HINT[reviewMode]}</FieldDescription>
              )}
            </Field>
            {reviewMode === "manual" && type !== "quiz" ? (
              <RubricEditor value={content.rubric} onChange={(rubric) => setContent((c) => ({ ...c, rubric }))} errors={errors} idPrefix="assign-rubric" />
            ) : null}
            {type === "dsa" ? (
              <PracticeEditor value={content.practice} onChange={(practice) => setContent((c) => ({ ...c, practice }))} errors={errors} idPrefix="assign-practice" />
            ) : null}
            <ResourcesEditor value={content.resources} onChange={(resources) => setContent((c) => ({ ...c, resources }))} errors={errors} idPrefix="assign-links" />
            <Field data-invalid={!!errors.scheduled_for}>
              <FieldLabel>Shows up</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                value={later ? "later" : "now"}
                onValueChange={(v) => {
                  if (!v) return;
                  setLater(v === "later");
                  clear("scheduled_for");
                }}
                className="justify-start"
              >
                <ToggleGroupItem value="now" className={choiceItem}>Now</ToggleGroupItem>
                <ToggleGroupItem value="later" className={choiceItem}>Later</ToggleGroupItem>
              </ToggleGroup>
              {later ? (
                <DateTimePicker
                  aria-label="Start"
                  value={startAt}
                  min={toLocalInput(now)}
                  onChange={(v) => {
                    setStartAt(v);
                    clear("scheduled_for");
                  }}
                  invalid={!!errors.scheduled_for}
                />
              ) : null}
              {errors.scheduled_for ? (
                <FieldError>{errors.scheduled_for}</FieldError>
              ) : (
                <FieldDescription>{later ? "Hidden from the student until then." : "Right away, with an announcement in chat."}</FieldDescription>
              )}
            </Field>
          </>
        ) : (
          <Button type="button" variant="outline" className="self-start" onClick={() => setMore(true)} data-testid="assign-more">
            <SlidersHorizontal data-icon="inline-start" aria-hidden /> More options
            <span className="text-muted-foreground hidden font-normal sm:inline">· persona, review, rubric, links, start time</span>
          </Button>
        )}
      </FieldGroup>
      <Button type="submit" size="lg" className="h-11" disabled={submitting || paused} data-testid="assign-submit">
        {submitting ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" aria-hidden />}
        {submitting ? "Assigning…" : `Assign to ${firstName(student.user.name)}`}
      </Button>
    </form>
  );
}
