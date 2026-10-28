"use client";

import { Check, Code2, ExternalLink, FileCheck2, ListChecks, Send, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { type SubmissionInput } from "@/lib/api/client";
import { ApiError, messageFor } from "@/lib/api/errors";
import { type Resource, type Submission, type Task } from "@/lib/api/schemas";
import { ContentBounds, needsLink, validateSubmission } from "@/lib/content";
import { dateTimeLabel } from "@/lib/format";
import { handInNote, loadDraft } from "@/lib/practice";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { runeLength } from "@/lib/validation";

/** Links the task points to. Opened in a new tab without leaking the workspace URL. */
export function ResourceList({ resources }: { resources: Resource[] }) {
  if (resources.length === 0) return null;
  return (
    <section aria-label="Links" className="mt-6">
      <h3 className="mb-2 text-sm font-medium">Links</h3>
      <ul className="flex flex-col gap-1.5">
        {resources.map((r) => (
          <li key={r.url}>
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
            >
              <ExternalLink className="size-3.5" aria-hidden /> {r.title}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SubmissionCard({ submission, title }: { submission: Submission; title: string }) {
  return (
    <section aria-label={title} className="bg-muted/50 mt-6 rounded-lg border p-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <FileCheck2 className="text-muted-foreground size-4" aria-hidden /> {title}
        <span className="text-muted-foreground text-xs font-normal">
          #{submission.attempt} · {dateTimeLabel(submission.submitted_at)}
        </span>
      </h3>
      {submission.url ? (
        <a href={submission.url} target="_blank" rel="noopener noreferrer" className="text-primary mt-1.5 block truncate text-sm underline-offset-4 hover:underline">
          {submission.url}
        </a>
      ) : null}
      {submission.note ? <p className="mt-1.5 text-sm whitespace-pre-wrap">{submission.note}</p> : null}
    </section>
  );
}

/** Collects the link and note sent with "Submit for review". */
export function HandInDialog({
  task,
  open,
  onClose,
  onSubmit,
}: {
  task: Task;
  open: boolean;
  onClose: () => void;
  onSubmit: (s: SubmissionInput) => Promise<string | null>;
}) {
  const last = task.submission;
  const [url, setUrl] = useState(last?.url ?? "");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const linkFirst = needsLink(task.type);
  const noteLen = runeLength(note.trim());

  const submit = async () => {
    const e = validateSubmission({ url, note }, task.type, true);
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const err = await onSubmit({ url: url.trim(), note: note.trim() });
    setBusy(false);
    if (err) setErrors({ form: err });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit for review</DialogTitle>
          <DialogDescription>
            {linkFirst ? "Link the pull request (or post) and tell the reviewer what changed." : "Share your solution or a link, and anything the reviewer should know."}
          </DialogDescription>
        </DialogHeader>
        <form
          id="hand-in"
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {errors.form ? (
            <Alert variant="destructive">
              <AlertTitle>Couldn&apos;t submit</AlertTitle>
              <AlertDescription>{errors.form}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={!!errors.url}>
            <FieldLabel htmlFor="hand-in-url">{linkFirst ? "Link" : "Link (optional)"}</FieldLabel>
            <Input
              id="hand-in-url"
              inputMode="url"
              placeholder="https://github.com/you/repo/pull/1"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-invalid={!!errors.url}
              autoFocus
            />
            {errors.url ? <FieldError>{errors.url}</FieldError> : null}
          </Field>
          <Field data-invalid={!!errors.note}>
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor="hand-in-note">{linkFirst ? "Note (optional)" : "Solution or note"}</FieldLabel>
              {task.content.practice ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const d = loadDraft(task.id);
                    const p = task.content.practice;
                    if (!d || !p) {
                      setErrors((e) => ({ ...e, note: "Nothing in the practice pad yet. Write your solution there first." }));
                      return;
                    }
                    setNote(handInNote(d.code, d.result, p.tests.length, ContentBounds.submissionNoteMax));
                    setErrors((e) => ({ ...e, note: "" }));
                  }}
                  data-testid="insert-practice"
                >
                  <Code2 data-icon="inline-start" aria-hidden /> Insert my practice code
                </Button>
              ) : null}
            </div>
            <Textarea
              id="hand-in-note"
              rows={linkFirst ? 3 : 7}
              className={cn(!linkFirst && "font-mono text-sm")}
              placeholder={linkFirst ? "What changed, and anything you'd like a second look at." : "Paste your approach or code, with its time and space complexity."}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-invalid={!!errors.note}
            />
            {errors.note ? (
              <FieldError>{errors.note}</FieldError>
            ) : noteLen > ContentBounds.submissionNoteMax - 500 ? (
              <FieldDescription className="tabular-nums">
                {noteLen} / {ContentBounds.submissionNoteMax}
              </FieldDescription>
            ) : null}
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Not yet
          </Button>
          <Button type="submit" form="hand-in" disabled={busy} data-testid="hand-in-submit">
            {busy ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" aria-hidden />} Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Takes the quiz, shows the graded attempt, and the answer key once finished. */
export function QuizPlayer({ task, onGraded, disabled }: { task: Task; onGraded: (t: Task) => void; disabled: boolean }) {
  const { api } = useSession();
  const quiz = task.content.quiz;
  const stats = task.quiz_result;
  const finished = task.status === "done" || (stats ? stats.passed || stats.attempts_left === 0 : false);
  const [answers, setAnswers] = useState<(number | null)[]>(() => (quiz ? quiz.questions.map(() => null) : []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!quiz) return null;
  const unanswered = answers.filter((a) => a === null).length;
  const lastCorrect = stats?.last_correct ?? [];
  const lastAnswers = stats?.last_answers ?? [];

  const submit = async () => {
    if (unanswered > 0) {
      setError(`Answer all ${quiz.questions.length} questions first.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.submitQuiz(task.id, task.version, answers.map((a) => a ?? 0));
      onGraded(res.task);
      const r = res.result;
      if (r.passed) toast.success(`Passed with ${r.score}%`);
      else if (r.attempts_left > 0) toast.warning(`${r.score}%, not quite`, { description: `${r.attempts_left} ${r.attempts_left === 1 ? "attempt" : "attempts"} left. Review the wrong ones and try again.` });
      else toast.info(`Finished with a best score of ${res.task.quiz_result?.best_score ?? r.score}%`);
      setAnswers(quiz.questions.map(() => null));
    } catch (e) {
      setError(e instanceof ApiError && e.code === "version_conflict" ? "This quiz changed on another device. Close and reopen it." : messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Quiz" className="mt-6">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">
          Quiz · {quiz.questions.length} {quiz.questions.length === 1 ? "question" : "questions"} · pass {quiz.pass_percent}%
        </h3>
        {stats ? (
          <span className="text-muted-foreground text-xs" data-testid="quiz-stats">
            Best {stats.best_score}% · {finished ? "finished" : `${stats.attempts_left} ${stats.attempts_left === 1 ? "attempt" : "attempts"} left`}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">{ContentBounds.attempts} attempts</span>
        )}
      </div>
      <ol className="flex flex-col gap-4">
        {quiz.questions.map((q, i) => {
          const wasRight = lastCorrect[i];
          return (
            <li key={i} className="rounded-lg border p-3">
              <fieldset disabled={finished || disabled || busy}>
                <legend className="mb-2 flex items-start gap-2 text-sm font-medium">
                  <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
                  <span className="whitespace-pre-wrap">{q.prompt}</span>
                  {!finished && stats && wasRight !== undefined ? (
                    <span className={cn("ml-auto shrink-0 text-xs", wasRight ? "text-success" : "text-destructive")}>
                      {wasRight ? "Right last time" : "Wrong last time"}
                    </span>
                  ) : null}
                </legend>
                <div className="flex flex-col gap-1.5">
                  {q.options.map((o, oi) => {
                    const id = `q${i}-o${oi}`;
                    const key = finished && q.answer === oi;
                    const mine = finished && lastAnswers[i] === oi;
                    return (
                      <label
                        key={oi}
                        htmlFor={id}
                        className={cn(
                          "hover:bg-muted/60 flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5",
                          key && "border-success bg-success/10",
                          mine && !key && "border-destructive bg-destructive/10",
                          finished && "cursor-default",
                        )}
                      >
                        <input
                          id={id}
                          type="radio"
                          name={`q${i}`}
                          className="accent-primary size-4"
                          checked={answers[i] === oi}
                          onChange={() => setAnswers((a) => a.map((x, j) => (j === i ? oi : x)))}
                        />
                        <span className="flex-1">{o}</span>
                        {mine ? <span className="text-muted-foreground text-xs">Your answer</span> : null}
                        {key ? <Check className="text-success size-4" aria-label="Right answer" /> : mine ? <X className="text-destructive size-4" aria-label="Wrong" /> : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>
      {error ? (
        <p className="text-destructive mt-3 flex items-center gap-1.5 text-sm" role="alert">
          <X className="size-4" aria-hidden /> {error}
        </p>
      ) : null}
      {!finished ? (
        <Button className="mt-4 w-full" size="lg" disabled={busy || disabled} onClick={() => void submit()} data-testid="quiz-submit">
          {busy ? <Spinner data-icon="inline-start" /> : null}
          {unanswered > 0 ? `Answer ${unanswered} more` : "Check my answers"}
        </Button>
      ) : null}
    </section>
  );
}

/** The reviewer's checklist: what they'll look at, then which ones were met. */
export function RubricView({ criteria, submission }: { criteria: string[]; submission: Submission | null }) {
  if (criteria.length === 0) return null;
  const ticks = submission?.rubric ?? null;
  const met = ticks ? ticks.filter(Boolean).length : 0;
  return (
    <section aria-labelledby="rubric-title" className="mt-6" data-testid="rubric">
      <h3 id="rubric-title" className="mb-2 flex items-center gap-2 text-sm font-medium">
        <ListChecks className="text-muted-foreground size-4" aria-hidden />
        {ticks ? `${met} of ${criteria.length} checks met` : "What your reviewer checks"}
      </h3>
      <ul className="flex flex-col gap-1.5">
        {criteria.map((c, i) => {
          const t = ticks?.[i];
          return (
            <li key={i} className="flex items-start gap-2 text-sm">
              {t === undefined ? (
                <span className="bg-muted-foreground/40 mt-2 size-1.5 shrink-0 rounded-full" aria-hidden />
              ) : t ? (
                <Check className="text-success mt-0.5 size-4 shrink-0" aria-label="Met" />
              ) : (
                <X className="text-destructive mt-0.5 size-4 shrink-0" aria-label="Not yet" />
              )}
              <span className={cn(t === false && "text-muted-foreground")}>{c}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
