"use client";

import { Code2, Link2, ListChecks, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type ContentInput } from "@/lib/api/client";
import { blankPractice, blankQuestion, ContentBounds } from "@/lib/content";
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
      {value.length === 0 ? <FieldDescription>Optional. Docs, a starter repo or an article to read.</FieldDescription> : null}
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

/** Optional example tests for a DSA task. Students run them in their own browser; they're data, never code. */
export function PracticeEditor({
  value,
  onChange,
  errors,
  idPrefix,
}: {
  value: ContentInput["practice"];
  onChange: (next: ContentInput["practice"]) => void;
  errors: Errors;
  idPrefix: string;
}) {
  if (!value) {
    return (
      <Field>
        <FieldLabel>Practice pad</FieldLabel>
        <FieldDescription>Optional. Give example tests and the student can run a JavaScript solution in their browser before handing in.</FieldDescription>
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange(blankPractice())} data-testid={`${idPrefix}-add`}>
          <Code2 data-icon="inline-start" aria-hidden /> Add practice pad
        </Button>
      </Field>
    );
  }
  const p = value;
  const setTest = (i: number, patch: Partial<{ args: string; expected: string }>) => onChange({ ...p, tests: p.tests.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <legend className="text-sm font-medium">Practice pad</legend>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
          <Trash2 data-icon="inline-start" aria-hidden /> Remove
        </Button>
      </div>
      <Field data-invalid={!!errors["practice.function_name"]}>
        <FieldLabel htmlFor={`${idPrefix}-fn`}>Function name</FieldLabel>
        <Input
          id={`${idPrefix}-fn`}
          className="font-mono"
          value={p.function_name}
          onChange={(e) => onChange({ ...p, function_name: e.target.value })}
          aria-invalid={!!errors["practice.function_name"]}
          autoComplete="off"
          spellCheck={false}
        />
        {errors["practice.function_name"] ? <FieldError>{errors["practice.function_name"]}</FieldError> : <FieldDescription>The student defines this function, e.g. twoSum.</FieldDescription>}
      </Field>
      <Field data-invalid={!!errors["practice.starter"]}>
        <FieldLabel htmlFor={`${idPrefix}-starter`}>Starter code</FieldLabel>
        <Textarea
          id={`${idPrefix}-starter`}
          rows={4}
          className="font-mono text-[0.82rem]"
          value={p.starter}
          onChange={(e) => onChange({ ...p, starter: e.target.value })}
          spellCheck={false}
          aria-invalid={!!errors["practice.starter"]}
        />
        {errors["practice.starter"] ? <FieldError>{errors["practice.starter"]}</FieldError> : null}
      </Field>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Example tests</span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {p.tests.length} / {ContentBounds.practiceTests}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">Arguments as a JSON array, the expected return value as JSON. Students see these.</p>
        <ul className="flex flex-col gap-2">
          {p.tests.map((t, i) => {
            const argsErr = errors[`practice.tests[${i}].args`];
            const expErr = errors[`practice.tests[${i}].expected`];
            return (
              <li key={i} className="flex flex-col gap-1">
                <div className="flex items-start gap-2">
                  <Input
                    aria-label={`Test ${i + 1} arguments`}
                    className="font-mono text-xs"
                    value={t.args}
                    placeholder="[[2,7,11,15], 9]"
                    aria-invalid={!!argsErr}
                    onChange={(e) => setTest(i, { args: e.target.value })}
                    spellCheck={false}
                  />
                  <span className="text-muted-foreground mt-2 text-xs" aria-hidden>
                    →
                  </span>
                  <Input
                    aria-label={`Test ${i + 1} expected result`}
                    className="w-36 shrink-0 font-mono text-xs"
                    value={t.expected}
                    placeholder="[0,1]"
                    aria-invalid={!!expErr}
                    onChange={(e) => setTest(i, { expected: e.target.value })}
                    spellCheck={false}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove test ${i + 1}`}
                    disabled={p.tests.length === 1}
                    onClick={() => onChange({ ...p, tests: p.tests.filter((_, j) => j !== i) })}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                {argsErr || expErr ? <FieldError>{argsErr ?? expErr}</FieldError> : null}
              </li>
            );
          })}
        </ul>
        {errors["practice.tests"] ? <FieldError>{errors["practice.tests"]}</FieldError> : null}
        {p.tests.length < ContentBounds.practiceTests ? (
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange({ ...p, tests: [...p.tests, { args: "[]", expected: "null" }] })}>
            <Plus data-icon="inline-start" aria-hidden /> Add test
          </Button>
        ) : null}
      </div>
      {errors.practice ? <FieldError>{errors.practice}</FieldError> : null}
    </fieldset>
  );
}

/** What the reviewer checks. Students see the list before handing in, and the ticks after. */
export function RubricEditor({ value, onChange, errors, idPrefix }: { value: string[]; onChange: (next: string[]) => void; errors: Errors; idPrefix: string }) {
  return (
    <Field data-invalid={!!errors.rubric}>
      <div className="flex items-baseline justify-between">
        <FieldLabel>Review rubric</FieldLabel>
        <span className="text-muted-foreground text-xs tabular-nums">
          {value.length} / {ContentBounds.rubricItems}
        </span>
      </div>
      <FieldDescription>Optional. What you&apos;ll check. The student sees it up front, and which ones were met after review.</FieldDescription>
      <ol className="flex flex-col gap-2">
        {value.map((item, i) => {
          const err = errors[`rubric[${i}]`];
          return (
            <li key={i} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-5 text-right text-xs tabular-nums">{i + 1}.</span>
                <Input
                  id={`${idPrefix}-${i}`}
                  aria-label={`Criterion ${i + 1}`}
                  value={item}
                  placeholder="e.g. Tests cover the empty case"
                  aria-invalid={!!err}
                  onChange={(e) => onChange(value.map((v, j) => (j === i ? e.target.value : v)))}
                />
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove criterion ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
              {err ? <FieldError className="pl-7">{err}</FieldError> : null}
            </li>
          );
        })}
      </ol>
      {errors.rubric ? <FieldError>{errors.rubric}</FieldError> : null}
      {value.length < ContentBounds.rubricItems ? (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange([...value, ""])} data-testid={`${idPrefix}-add`}>
          <ListChecks data-icon="inline-start" aria-hidden /> Add criterion
        </Button>
      ) : null}
    </Field>
  );
}
