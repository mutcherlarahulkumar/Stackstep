"use client";

import { CircleAlert, Send } from "lucide-react";
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
import { TASK_TYPES, type Student, type Task, type TaskType } from "@/lib/api/schemas";
import { TYPE_LABEL } from "@/lib/board";
import { dateTimeLabel, firstName, fromLocalInput, toLocalInput } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { Bounds, normalizeLine, runeLength, validateBrief, validateSchedule, validateTitle } from "@/lib/validation";

import { choiceItem } from "../app/choice";
import { TYPE_ICON } from "../app/task-badges";

type DuePreset = "2h" | "today" | "tomorrow" | "custom";
type Errors = Partial<Record<"type" | "title" | "brief" | "scheduled_for" | "due_at", string>>;

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
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [later, setLater] = useState(false);
  const [startAt, setStartAt] = useState("");
  const now = useMemo(() => new Date(), []);
  const todayOpen = presetDue("today", now).getTime() - now.getTime() >= Bounds.minTaskMinutes * 60_000;
  const [preset, setPreset] = useState<DuePreset>(todayOpen ? "today" : "tomorrow");
  const [customDue, setCustomDue] = useState("");
  const [errors, setErrors] = useState<Errors>({});
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
      const task = await api.createTask(student.enrollment.id, { type, title: normalizeLine(title), brief: brief.trim(), scheduled_for: start, due_at: due });
      setTitle("");
      setBrief("");
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
        <Field data-invalid={!!errors.type}>
          <FieldLabel htmlFor="task-type">Type</FieldLabel>
          <Select value={type} onValueChange={(v) => setType(v as TaskType)}>
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
            <Input
              type="datetime-local"
              aria-label="Start time"
              value={startAt}
              min={toLocalInput(now)}
              onChange={(e) => {
                setStartAt(e.target.value);
                clear("scheduled_for");
              }}
              aria-invalid={!!errors.scheduled_for}
            />
          ) : null}
          {errors.scheduled_for ? (
            <FieldError>{errors.scheduled_for}</FieldError>
          ) : (
            <FieldDescription>{later ? "Hidden from the student until then." : "Right away. The lead announces it in chat."}</FieldDescription>
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
            <Input
              type="datetime-local"
              aria-label="Due time"
              value={customDue}
              min={toLocalInput(now)}
              onChange={(e) => {
                setCustomDue(e.target.value);
                clear("due_at");
              }}
              aria-invalid={!!errors.due_at}
            />
          ) : null}
          {errors.due_at ? <FieldError>{errors.due_at}</FieldError> : due ? <FieldDescription>{dateTimeLabel(due)}</FieldDescription> : null}
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" className="h-11" disabled={submitting || paused} data-testid="assign-submit">
        {submitting ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" aria-hidden />}
        {submitting ? "Assigning…" : `Assign to ${firstName(student.user.name)}`}
      </Button>
    </form>
  );
}
