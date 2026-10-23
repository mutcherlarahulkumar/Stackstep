"use client";

import { Link2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type ContentInput } from "@/lib/api/client";
import { blankQuestion, ContentBounds } from "@/lib/content";
import { cn } from "@/lib/utils";

type Errors = Record<string, string | undefined>;
type Quiz = NonNullable<ContentInput["quiz"]>;

/** Up to five named links shown on the task (docs, starter repo, article). */
export function ResourcesEditor({
  value,
  onChange,
  errors,
  idPrefix,
}: {
  value: ContentInput["resources"];
  onChange: (next: ContentInput["resources"]) => void;
  errors: Errors;
  idPrefix: string;
}) {
  const set = (i: number, patch: Partial<{ title: string; url: string }>) =>
    onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <Field data-invalid={!!errors.resources}>
      <div className="flex items-baseline justify-between">
        <FieldLabel>Links</FieldLabel>
        <span className="text-muted-foreground text-xs tabular-nums">
          {value.length} / {ContentBounds.resources}
        </span>
      </div>
      {value.length === 0 ? <FieldDescription>Optional: docs, a starter repo or an article to read.</FieldDescription> : null}
      <ul className="flex flex-col gap-2">
        {value.map((r, i) => {
          const titleErr = errors[`resources[${i}].title`];
          const urlErr = errors[`resources[${i}].url`];
          return (
            <li key={i} className="flex flex-col gap-1">
              <div className="flex items-start gap-2">
                <Input
                  aria-label={`Link ${i + 1} name`}
                  id={`${idPrefix}-res-${i}-title`}
                  className="w-40 shrink-0"
                  value={r.title}
                  placeholder="Name"
                  maxLength={ContentBounds.resourceTitleMax + 20}
                  aria-invalid={!!titleErr}
                  onChange={(e) => set(i, { title: e.target.value })}
                />
                <Input
                  aria-label={`Link ${i + 1} address`}
                  id={`${idPrefix}-res-${i}-url`}
                  value={r.url}
                  placeholder="https://"
                  inputMode="url"
                  aria-invalid={!!urlErr}
                  onChange={(e) => set(i, { url: e.target.value })}
                />
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove link ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
              {titleErr || urlErr ? <FieldError>{urlErr ?? titleErr}</FieldError> : null}
            </li>
          );
        })}
      </ul>
      {errors.resources ? <FieldError>{errors.resources}</FieldError> : null}
      {value.length < ContentBounds.resources ? (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange([...value, { title: "", url: "" }])}>
          <Link2 data-icon="inline-start" aria-hidden /> Add link
        </Button>
      ) : null}
    </Field>
  );
}

/** Multiple-choice questions with an answer key. Graded by the server, never by AI. */
export function QuizEditor({ value, onChange, errors, idPrefix }: { value: Quiz; onChange: (next: Quiz) => void; errors: Errors; idPrefix: string }) {
  const setQ = (i: number, patch: Partial<Quiz["questions"][number]>) =>
    onChange({ ...value, questions: value.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border p-4">
      <legend className="px-1 text-sm font-medium">Quiz</legend>
      <Field data-invalid={!!errors["quiz.pass_percent"]} orientation="horizontal" className="items-center">
        <FieldLabel htmlFor={`${idPrefix}-pass`} className="shrink-0">
          Pass mark
        </FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            id={`${idPrefix}-pass`}
            type="number"
            min={1}
            max={100}
            className="w-20"
            value={value.pass_percent}
            onChange={(e) => onChange({ ...value, pass_percent: Math.round(Number(e.target.value)) })}
          />
          <span className="text-muted-foreground text-sm">% · {ContentBounds.attempts} attempts, best score counts</span>
        </div>
      </Field>
      {errors["quiz.pass_percent"] ? <FieldError>{errors["quiz.pass_percent"]}</FieldError> : null}
      <ol className="flex flex-col gap-4">
        {value.questions.map((q, i) => {
          const k = `quiz.questions[${i}]`;
          const optErr = errors[`${k}.options`] ?? errors[`${k}.answer`];
          return (
            <li key={i} className="bg-muted/40 flex flex-col gap-2 rounded-md p-3" data-testid={`quiz-question-${i}`}>
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground mt-2 w-5 shrink-0 text-sm tabular-nums">{i + 1}.</span>
                <Textarea
                  aria-label={`Question ${i + 1}`}
                  rows={2}
                  value={q.prompt}
                  placeholder="Ask something with one clear right answer"
                  aria-invalid={!!errors[`${k}.prompt`]}
                  onChange={(e) => setQ(i, { prompt: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove question ${i + 1}`}
                  disabled={value.questions.length === 1}
                  onClick={() => onChange({ ...value, questions: value.questions.filter((_, j) => j !== i) })}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
              {errors[`${k}.prompt`] ? <FieldError className="pl-7">{errors[`${k}.prompt`]}</FieldError> : null}
              <div role="radiogroup" aria-label={`Right answer for question ${i + 1}`} className="flex flex-col gap-1.5 pl-7">
                {q.options.map((o, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`${idPrefix}-q${i}-answer`}
                      aria-label={`Option ${oi + 1} is right`}
                      className="accent-primary size-4"
                      checked={q.answer === oi}
                      onChange={() => setQ(i, { answer: oi })}
                    />
                    <Input
                      aria-label={`Question ${i + 1} option ${oi + 1}`}
                      value={o}
                      placeholder={`Option ${oi + 1}`}
                      className={cn(q.answer === oi && "border-success")}
                      onChange={(e) => setQ(i, { options: q.options.map((x, j) => (j === oi ? e.target.value : x)) })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove option ${oi + 1}`}
                      disabled={q.options.length <= ContentBounds.optionsMin}
                      onClick={() =>
                        setQ(i, {
                          options: q.options.filter((_, j) => j !== oi),
                          answer: q.answer === oi ? 0 : q.answer > oi ? q.answer - 1 : q.answer,
                        })
                      }
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                ))}
                {optErr ? <FieldError>{optErr}</FieldError> : null}
                {q.options.length < ContentBounds.optionsMax ? (
                  <Button type="button" variant="ghost" size="xs" className="self-start" onClick={() => setQ(i, { options: [...q.options, ""] })}>
                    <Plus data-icon="inline-start" aria-hidden /> Option
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {errors["quiz.questions"] ? <FieldError>{errors["quiz.questions"]}</FieldError> : null}
      {value.questions.length < ContentBounds.questions ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => onChange({ ...value, questions: [...value.questions, blankQuestion()] })}
          data-testid="quiz-add-question"
        >
          <Plus data-icon="inline-start" aria-hidden /> Add question
        </Button>
      ) : null}
      <FieldDescription>Mark the right option with the circle. Students see the answers only after they finish.</FieldDescription>
    </fieldset>
  );
}
