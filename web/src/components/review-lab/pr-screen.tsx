"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  FileCode2,
  FileDiff,
  GitCommitHorizontal,
  GitPullRequest,
  MessageSquare,
  MessageSquarePlus,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, messageFor } from "@/lib/api/errors";
import {
  LAB_VERDICTS,
  type LabExercise,
  type LabFile,
  type LabIssue,
  type LabLine,
  type LabReview,
  type LabVerdict,
  type Me,
  type Task,
} from "@/lib/api/schemas";
import { dateTimeLabel } from "@/lib/format";
import {
  byLine,
  checkReview,
  DIFFICULTY_LABEL,
  inIssue,
  issuesByLine,
  LAB,
  lineKey,
  scoreLine,
  SEVERITY_LABEL,
  totals,
  usefulComments,
  VERDICT_LABEL,
  type Draft,
} from "@/lib/review-lab";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { newId } from "@/lib/uuid";

import { AppHeader } from "../app/app-header";
import { DocumentMarkdown } from "../app/document-markdown";
import { RequireSession } from "../app/guard";
import { EmptyState, ErrorState, ListSkeleton } from "../app/state";
import { labKey } from "./library-screen";

export function PullRequestScreen({
  exerciseKey,
  taskId,
}: {
  exerciseKey: string;
  taskId: string | null;
}) {
  return (
    <RequireSession audience="student">
      {(me) => (
        <PullRequest me={me} exerciseKey={exerciseKey} taskId={taskId} />
      )}
    </RequireSession>
  );
}

type Tab = "conversation" | "commits" | "files";

function PullRequest({
  me,
  exerciseKey,
  taskId,
}: {
  me: Me;
  exerciseKey: string;
  taskId: string | null;
}) {
  const { api } = useSession();
  const q = useQuery({
    queryKey: [...labKey, exerciseKey],
    queryFn: () => api.reviewLabExercise(exerciseKey),
  });
  const taskQ = useQuery({
    queryKey: ["lab-task", taskId],
    queryFn: async () =>
      (await api.myTasks()).find((t) => t.id === taskId) ?? null,
    enabled: taskId !== null,
  });
  const back = taskId
    ? `/workspace?task=${encodeURIComponent(taskId)}`
    : "/review-lab";
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader user={me.user}>
        <span className="bg-border hidden h-5 w-px sm:block" aria-hidden />
        <Button asChild variant="ghost" size="sm">
          <Link href={back}>
            <ArrowLeft data-icon="inline-start" aria-hidden />{" "}
            {taskId ? "Your task" : "Review lab"}
          </Link>
        </Button>
      </AppHeader>
      <main
        id="main"
        className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 sm:px-6"
      >
        {q.isPending || (taskId && taskQ.isPending) ? (
          <ListSkeleton rows={5} className="h-16" />
        ) : q.isError ? (
          <ErrorState
            message={messageFor(q.error)}
            onRetry={() => void q.refetch()}
          />
        ) : taskId &&
          (taskQ.isError ||
            taskQ.data === null ||
            taskQ.data?.content.review_lab?.exercise !== exerciseKey) ? (
          <EmptyState
            icon={GitPullRequest}
            title="This task isn't on your board"
          >
            Open the review from your task instead, or practice it from the
            review lab.
          </EmptyState>
        ) : (
          <Review key={q.data.key} ex={q.data} task={taskQ.data ?? null} />
        )}
      </main>
    </div>
  );
}

/** The whole pull request: header, tabs, comments in progress and the graded result. */
function Review({
  ex,
  task: initialTask,
}: {
  ex: LabExercise;
  task: Task | null;
}) {
  const { api } = useSession();
  const qc = useQueryClient();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("files");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [composing, setComposing] = useState<string | null>(null);
  const [task, setTask] = useState<Task | null>(initialTask);
  // A graded review on screen: just submitted, or the last one when asked for.
  const [graded, setGraded] = useState<LabReview | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const t = totals(ex);
  const triesLeft = task
    ? (task.lab_result?.attempts_left ?? LAB.taskTries)
    : null;
  const finished = !!task && (task.status === "done" || triesLeft === 0);

  const submit = async (
    verdict: LabVerdict,
    summary: string,
  ): Promise<string | null> => {
    const problem = checkReview(drafts, summary);
    if (problem) return problem;
    try {
      const out = await api.submitLabReview(
        ex.key,
        {
          verdict,
          summary,
          comments: drafts.map(({ path, line, side, body }) => ({
            path,
            line,
            side,
            body,
          })),
        },
        task ? { id: task.id, expectedVersion: task.version } : null,
      );
      setGraded(out.review);
      if (out.task) setTask(out.task);
      setDrafts([]);
      setComposing(null);
      void qc.invalidateQueries({ queryKey: labKey });
      void qc.invalidateQueries({ queryKey: ["achievements"] });
      top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return null;
    } catch (e) {
      if (e instanceof ApiError && e.code === "version_conflict")
        return "This task changed on another device. Go back to it and open the review again.";
      return messageFor(e);
    }
  };

  return (
    <div ref={top} className="flex flex-col gap-4 scroll-mt-20">
      <header className="flex flex-col gap-2 border-b pb-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline">{DIFFICULTY_LABEL[ex.difficulty]}</Badge>
          <Badge variant="secondary">{ex.language}</Badge>
          {task ? (
            <Badge variant="outline" data-testid="lab-task-badge">
              Task · {triesLeft} {triesLeft === 1 ? "try" : "tries"} left · pass{" "}
              {task.content.review_lab?.pass_percent ?? LAB.defaultPass}%
            </Badge>
          ) : (
            <Badge variant="outline">Practice · unlimited tries</Badge>
          )}
        </div>
        <h1 className="text-2xl leading-tight font-semibold text-balance sm:text-3xl">
          {ex.title}{" "}
          <span className="text-muted-foreground font-light">#{ex.number}</span>
        </h1>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-sm font-medium text-white">
            <GitPullRequest className="size-4" aria-hidden /> Open
          </span>
          <span className="text-muted-foreground">
            <span className="text-foreground font-semibold">{ex.author}</span>{" "}
            wants to merge {ex.commits.length}{" "}
            {ex.commits.length === 1 ? "commit" : "commits"} into{" "}
            <BranchName name={ex.base} /> from <BranchName name={ex.branch} />
          </span>
        </p>
      </header>

      {graded ? (
        <ResultCard
          review={graded}
          task={task}
          onAgain={() => {
            setGraded(null);
            setTab("files");
          }}
          onBack={
            task
              ? () =>
                  router.push(`/workspace?task=${encodeURIComponent(task.id)}`)
              : null
          }
          canRetry={!finished}
        />
      ) : ex.last_review ? (
        <Alert data-testid="lab-last-review">
          <RotateCcw aria-hidden />
          <AlertTitle>
            Your last review scored {ex.last_review.score}%
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            {scoreLine(ex.last_review)}
            {ex.last_review.task_id === null ||
            ex.last_review.task_id === task?.id ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setGraded(ex.last_review)}
                data-testid="lab-show-last"
              >
                See what you missed
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs
        value={tab}
        onValueChange={(v) =>
          setTab(v === "conversation" || v === "commits" ? v : "files")
        }
        className="gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-2">
          <div className="-mx-4 max-w-[calc(100%+2rem)] overflow-x-auto px-4 sm:mx-0 sm:max-w-full sm:px-0">
            <TabsList
              variant="line"
              className="h-10 w-max"
              aria-label="Pull request"
            >
              <TabsTrigger value="conversation" className="px-3">
                <MessageSquare aria-hidden /> Conversation
              </TabsTrigger>
              <TabsTrigger value="commits" className="px-3">
                <GitCommitHorizontal aria-hidden /> Commits{" "}
                <Count n={ex.commits.length} />
              </TabsTrigger>
              <TabsTrigger
                value="files"
                className="px-3"
                data-testid="tab-files"
              >
                <FileDiff aria-hidden /> Files changed <Count n={t.files} />
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-xs sm:inline">
              <span className="text-emerald-700 dark:text-emerald-400">
                +{t.additions}
              </span>{" "}
              <span className="text-rose-700 dark:text-rose-400">
                −{t.deletions}
              </span>
            </span>
            {graded ? null : finished ? (
              <Badge variant="secondary">Review finished</Badge>
            ) : (
              <FinishReview pending={drafts.length} onSubmit={submit} />
            )}
          </div>
        </div>

        <TabsContent value="conversation">
          <ConversationTab ex={ex} graded={graded} />
        </TabsContent>
        <TabsContent value="commits">
          <ol
            className="bg-card divide-y rounded-xl border"
            aria-label="Commits"
          >
            {ex.commits.map((c) => (
              <li
                key={c.sha}
                className="flex items-center gap-3 px-4 py-3 text-sm"
              >
                <GitCommitHorizontal
                  className="text-muted-foreground size-4 shrink-0"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {c.message}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {ex.author}
                </span>
                <code className="bg-muted shrink-0 rounded px-1.5 py-0.5 font-mono text-xs">
                  {c.sha}
                </code>
              </li>
            ))}
          </ol>
        </TabsContent>
        <TabsContent value="files">
          <FilesTab
            ex={ex}
            drafts={drafts}
            graded={graded}
            readOnly={graded !== null || finished}
            composing={composing}
            onCompose={setComposing}
            onAdd={(d) => {
              if (drafts.length >= LAB.maxComments) {
                toast.error(
                  `You can leave at most ${LAB.maxComments} comments.`,
                );
                return;
              }
              setDrafts((ds) => [...ds, d]);
              setComposing(null);
            }}
            onDelete={(id) => setDrafts((ds) => ds.filter((d) => d.id !== id))}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Count({ n }: { n: number }) {
  return (
    <span className="bg-muted text-muted-foreground rounded-full px-1.5 text-xs tabular-nums">
      {n}
    </span>
  );
}

function BranchName({ name }: { name: string }) {
  return (
    <code className="rounded-md bg-sky-500/10 px-1.5 py-0.5 font-mono text-xs text-sky-700 dark:text-sky-300">
      {name}
    </code>
  );
}

function ConversationTab({
  ex,
  graded,
}: {
  ex: LabExercise;
  graded: LabReview | null;
}) {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <article className="overflow-hidden rounded-xl border">
        <header className="bg-muted/60 flex items-center gap-2 border-b px-4 py-2 text-sm">
          <span
            className="bg-primary/15 text-primary grid size-6 place-items-center rounded-full text-xs font-semibold"
            aria-hidden
          >
            {ex.author.slice(0, 1).toUpperCase()}
          </span>
          <span className="font-semibold">{ex.author}</span>
          <span className="text-muted-foreground">
            opened this pull request
          </span>
        </header>
        <div className="p-4">
          <DocumentMarkdown>{ex.body}</DocumentMarkdown>
        </div>
      </article>
      <ol
        className="border-muted ml-4 flex flex-col gap-3 border-l-2 pl-5"
        aria-label="Timeline"
      >
        {ex.commits.map((c) => (
          <li key={c.sha} className="relative text-sm">
            <span
              className="bg-background absolute top-0.5 -left-[1.95rem] grid size-5 place-items-center rounded-full border"
              aria-hidden
            >
              <GitCommitHorizontal className="text-muted-foreground size-3" />
            </span>
            {c.message}{" "}
            <code className="text-muted-foreground font-mono text-xs">
              {c.sha}
            </code>
          </li>
        ))}
        {graded ? (
          <li className="relative text-sm">
            <span
              className="bg-background absolute top-0.5 -left-[1.95rem] grid size-5 place-items-center rounded-full border"
              aria-hidden
            >
              <MessageSquare className="text-muted-foreground size-3" />
            </span>
            <span className="font-semibold">You</span>{" "}
            {graded.verdict === "approve"
              ? "approved these changes"
              : graded.verdict === "request_changes"
                ? "requested changes"
                : "reviewed"}{" "}
            <span className="text-muted-foreground">
              · {dateTimeLabel(graded.created_at)}
            </span>
            {graded.summary ? (
              <p className="bg-card mt-2 rounded-lg border p-3 whitespace-pre-wrap">
                {graded.summary}
              </p>
            ) : null}
          </li>
        ) : null}
      </ol>
    </div>
  );
}

/** The green "Review changes" button and its box, like a code host's. */
function FinishReview({
  pending,
  onSubmit,
}: {
  pending: number;
  onSubmit: (v: LabVerdict, summary: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [verdict, setVerdict] = useState<LabVerdict>("comment");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    setError(null);
    const err = await onSubmit(verdict, summary);
    setBusy(false);
    if (err) setError(err);
    else {
      setOpen(false);
      setSummary("");
      setVerdict("comment");
    }
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          className="bg-emerald-600 text-white hover:bg-emerald-700"
          data-testid="review-changes"
        >
          Review changes{" "}
          {pending > 0 ? (
            <span className="rounded-full bg-white/25 px-1.5 text-xs tabular-nums">
              {pending}
            </span>
          ) : null}
          <ChevronDown data-icon="inline-end" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(26rem,calc(100vw-2rem))]"
        data-testid="review-box"
      >
        <h2 className="mb-2 text-sm font-semibold">Finish your review</h2>
        <Label htmlFor="review-summary" className="sr-only">
          Summary
        </Label>
        <Textarea
          id="review-summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Leave a comment"
          rows={4}
          maxLength={LAB.summaryMax}
        />
        <RadioGroup
          value={verdict}
          onValueChange={(v) =>
            setVerdict(LAB_VERDICTS.find((x) => x === v) ?? "comment")
          }
          className="mt-3 gap-3"
          aria-label="Your verdict"
        >
          {LAB_VERDICTS.map((v) => (
            <div key={v} className="flex items-start gap-2">
              <RadioGroupItem
                value={v}
                id={`verdict-${v}`}
                className="mt-0.5"
                data-testid={`verdict-${v}`}
              />
              <Label
                htmlFor={`verdict-${v}`}
                className="flex flex-col items-start gap-0.5 font-normal"
              >
                <span className="font-medium">{VERDICT_LABEL[v].title}</span>
                <span className="text-muted-foreground text-xs">
                  {VERDICT_LABEL[v].hint}
                </span>
              </Label>
            </div>
          ))}
        </RadioGroup>
        {error ? (
          <p className="text-destructive mt-3 text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">
            {pending} pending {pending === 1 ? "comment" : "comments"}
          </span>
          <Button
            size="sm"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={busy}
            onClick={() => void send()}
            data-testid="submit-review"
          >
            {busy ? <Spinner data-icon="inline-start" /> : null} Submit review
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ResultCard({
  review,
  task,
  onAgain,
  onBack,
  canRetry,
}: {
  review: LabReview;
  task: Task | null;
  onAgain: () => void;
  onBack: (() => void) | null;
  canRetry: boolean;
}) {
  const done = task?.status === "done";
  return (
    <section
      aria-labelledby="lab-score"
      className={cn(
        "animate-enter flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center",
        review.passed
          ? "border-emerald-600/40 bg-emerald-500/5"
          : "border-amber-600/40 bg-amber-500/5",
      )}
      data-testid="lab-result"
    >
      <div
        className={cn(
          "grid size-20 shrink-0 place-items-center rounded-full border-4 text-2xl font-bold tabular-nums",
          review.passed
            ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
            : "border-amber-600 text-amber-700 dark:text-amber-400",
        )}
      >
        {review.score}%
      </div>
      <div className="min-w-0 flex-1">
        <h2 id="lab-score" className="text-lg font-semibold">
          {review.passed ? "Passed. Nice catch!" : "Not passed yet"}
        </h2>
        <p className="text-muted-foreground text-sm">{scoreLine(review)}</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Every planted problem is now shown in the files, with what was wrong
          and how to fix it.
          {task
            ? done
              ? ` The task is done with your best score, ${task.lab_result?.best_score ?? review.score}%.`
              : ""
            : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {canRetry ? (
          <Button variant="outline" onClick={onAgain} data-testid="lab-again">
            <RotateCcw data-icon="inline-start" aria-hidden />{" "}
            {task ? "Try again" : "Review again"}
          </Button>
        ) : null}
        {onBack ? (
          <Button onClick={onBack}>
            <ArrowLeft data-icon="inline-start" aria-hidden /> Back to the task
          </Button>
        ) : (
          <Button asChild variant="ghost">
            <Link href="/review-lab">More pull requests</Link>
          </Button>
        )}
      </div>
    </section>
  );
}

type FilesProps = {
  ex: LabExercise;
  drafts: Draft[];
  graded: LabReview | null;
  readOnly: boolean;
  composing: string | null;
  onCompose: (k: string | null) => void;
  onAdd: (d: Draft) => void;
  onDelete: (id: string) => void;
};

const anchor = (path: string) => `file-${path.replace(/[^a-zA-Z0-9]+/g, "-")}`;

function FilesTab(props: FilesProps) {
  const { ex, graded } = props;
  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="Files" className="hidden lg:block">
        <ul className="sticky top-20 flex flex-col gap-0.5 text-sm">
          {ex.file_diffs.map((f) => {
            const missed = graded
              ? graded.issues.filter((i) => i.path === f.path && !i.found)
                  .length
              : 0;
            return (
              <li key={f.path}>
                <a
                  href={`#${anchor(f.path)}`}
                  className="hover:bg-muted flex items-center gap-2 rounded-md px-2 py-1.5"
                >
                  <FileCode2
                    className="text-muted-foreground size-4 shrink-0"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">
                    {f.path.split("/").pop()}
                  </span>
                  {missed > 0 ? (
                    <span className="text-xs font-medium text-rose-700 dark:text-rose-400">
                      {missed} missed
                    </span>
                  ) : null}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex min-w-0 flex-col gap-4">
        {!props.readOnly ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <MessageSquarePlus className="size-4" aria-hidden /> Click a line
            number (or the + beside a line) to comment on it. Finish with Review
            changes.
          </p>
        ) : null}
        {ex.file_diffs.map((f) => (
          <FileDiffView key={f.path} file={f} {...props} />
        ))}
      </div>
    </div>
  );
}

function FileDiffView({
  file,
  drafts,
  graded,
  readOnly,
  composing,
  onCompose,
  onAdd,
  onDelete,
}: FilesProps & { file: LabFile }) {
  const [open, setOpen] = useState(true);
  const draftsAt = useMemo(
    () => byLine(drafts.filter((d) => d.path === file.path)),
    [drafts, file.path],
  );
  const reviewed = useMemo(
    () =>
      byLine(
        (graded?.comments ?? [])
          .map((c, i) => ({ ...c, index: i }))
          .filter((c) => c.path === file.path),
      ),
    [graded, file.path],
  );
  const reveals = useMemo(
    () =>
      graded
        ? issuesByLine(graded.issues.filter((i) => i.path === file.path))
        : new Map<string, LabIssue[]>(),
    [graded, file.path],
  );
  const useful = useMemo(
    () => (graded ? usefulComments(graded) : new Set<number>()),
    [graded],
  );
  return (
    <section
      id={anchor(file.path)}
      className="scroll-mt-20 overflow-hidden rounded-xl border"
      aria-label={file.path}
      data-testid="lab-file"
    >
      <header className="bg-muted/60 flex items-center gap-2 border-b px-3 py-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? `Collapse ${file.path}` : `Expand ${file.path}`}
        >
          <ChevronDown
            className={cn("transition-transform", !open && "-rotate-90")}
            aria-hidden
          />
        </Button>
        <code className="min-w-0 flex-1 truncate font-mono text-xs font-semibold">
          {file.path}
        </code>
        {file.status === "added" ? (
          <Badge variant="outline">New file</Badge>
        ) : null}
        <span className="font-mono text-xs">
          <span className="text-emerald-700 dark:text-emerald-400">
            +{file.additions}
          </span>{" "}
          <span className="text-rose-700 dark:text-rose-400">
            −{file.deletions}
          </span>
        </span>
      </header>
      {open ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-xs leading-5">
            <tbody>
              {file.lines.map((l, i) => {
                if (l.kind === "hunk") {
                  return (
                    <tr
                      key={i}
                      className="bg-sky-500/10 text-sky-800 dark:text-sky-300"
                    >
                      <td colSpan={3} className="px-3 py-1 select-none">
                        {l.text}
                      </td>
                    </tr>
                  );
                }
                const side: "new" | "old" = l.kind === "del" ? "old" : "new";
                const n = side === "new" ? l.new : l.old;
                const k = n === null ? null : lineKey(file.path, side, n);
                const issue =
                  graded && side === "new"
                    ? inIssue(graded.issues, file.path, l.new)
                    : null;
                const here = k ? (draftsAt.get(k) ?? []) : [];
                const reviewedHere = k ? (reviewed.get(k) ?? []) : [];
                const revealed = k ? (reveals.get(k) ?? []) : [];
                return (
                  <Fragment key={i}>
                    <DiffRow
                      line={l}
                      issue={issue}
                      canComment={!readOnly && k !== null}
                      onComment={() => onCompose(k)}
                      lineNo={n}
                    />
                    {here.length > 0 ||
                    composing === k ||
                    reviewedHere.length > 0 ||
                    revealed.length > 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="bg-background border-y px-3 py-3 font-sans"
                        >
                          <div className="flex max-w-3xl flex-col gap-2">
                            {here.map((d) => (
                              <PendingComment
                                key={d.id}
                                draft={d}
                                onDelete={() => onDelete(d.id)}
                              />
                            ))}
                            {reviewedHere.map((c) => (
                              <GradedComment
                                key={c.index}
                                body={c.body}
                                useful={useful.has(c.index)}
                              />
                            ))}
                            {revealed.map((is) => (
                              <IssueReveal key={is.id} issue={is} />
                            ))}
                            {composing === k && n !== null ? (
                              <CommentForm
                                line={n}
                                onCancel={() => onCompose(null)}
                                onAdd={(body) =>
                                  onAdd({
                                    id: newId(),
                                    path: file.path,
                                    line: n,
                                    side,
                                    body,
                                  })
                                }
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

const ROW_TONE: Record<Exclude<LabLine["kind"], "hunk">, string> = {
  add: "bg-emerald-500/10",
  del: "bg-rose-500/10",
  context: "",
};

const NUM_TONE: Record<Exclude<LabLine["kind"], "hunk">, string> = {
  add: "bg-emerald-500/15",
  del: "bg-rose-500/15",
  context: "",
};

function DiffRow({
  line,
  issue,
  canComment,
  onComment,
  lineNo,
}: {
  line: LabLine;
  issue: LabIssue | null;
  canComment: boolean;
  onComment: () => void;
  lineNo: number | null;
}) {
  const kind = line.kind === "hunk" ? "context" : line.kind;
  const marker = kind === "add" ? "+" : kind === "del" ? "−" : " ";
  // Removed lines are commented on by their old number, everything else by the new one.
  const commentOld = kind === "del";
  const numberCell = (n: number | null, commentable: boolean) => (
    <td
      className={cn(
        "text-muted-foreground w-10 min-w-10 p-0 text-right align-top",
        NUM_TONE[kind],
      )}
    >
      {commentable && canComment && lineNo !== null ? (
        <button
          type="button"
          onClick={onComment}
          className="hover:text-primary focus-visible:ring-ring/60 w-full px-2 text-right outline-none focus-visible:ring-2"
          aria-label={`Comment on line ${lineNo}${commentOld ? " (removed)" : ""}`}
          data-testid={
            commentOld ? `comment-old-line-${lineNo}` : `comment-line-${lineNo}`
          }
        >
          {n ?? ""}
        </button>
      ) : (
        <span className="block px-2 select-none">{n ?? ""}</span>
      )}
    </td>
  );
  return (
    <tr
      className={cn(
        "group/line",
        ROW_TONE[kind],
        issue &&
          (issue.found
            ? "shadow-[inset_3px_0_0] shadow-emerald-600"
            : "shadow-[inset_3px_0_0] shadow-rose-600"),
      )}
    >
      {numberCell(line.old, commentOld)}
      {numberCell(line.new, !commentOld)}
      <td className="relative w-full pr-4 pl-6 align-top whitespace-pre">
        {canComment ? (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={onComment}
            className="bg-primary text-primary-foreground absolute top-0.5 left-0.5 hidden size-4 place-items-center rounded group-hover/line:grid"
          >
            <Plus className="size-3" />
          </button>
        ) : null}
        <span className="text-muted-foreground mr-2 select-none" aria-hidden>
          {marker}
        </span>
        <span className="sr-only">
          {kind === "add" ? "Added: " : kind === "del" ? "Removed: " : ""}
        </span>
        {line.text}
      </td>
    </tr>
  );
}

function CommentForm({
  line,
  onAdd,
  onCancel,
}: {
  line: number;
  onAdd: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    const b = body.trim();
    if (!b) return setError("Write the comment.");
    if ([...b].length > LAB.commentMax)
      return setError(`Comments can be at most ${LAB.commentMax} characters.`);
    onAdd(b);
  };
  return (
    <div className="bg-card rounded-lg border p-3" data-testid="comment-form">
      <Label htmlFor={`comment-${line}`} className="mb-2 text-xs">
        Comment on line {line}
      </Label>
      <Textarea
        id={`comment-${line}`}
        autoFocus
        value={body}
        rows={3}
        onChange={(e) => {
          setBody(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="What's wrong here, why it matters and how to fix it"
        aria-invalid={!!error}
      />
      {error ? (
        <p className="text-destructive mt-1 text-xs" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={add} data-testid="add-comment">
          Add review comment
        </Button>
      </div>
    </div>
  );
}

function PendingComment({
  draft,
  onDelete,
}: {
  draft: Draft;
  onDelete: () => void;
}) {
  return (
    <div
      className="bg-card rounded-lg border p-3 text-sm"
      data-testid="pending-comment"
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="font-semibold">You</span>
        <Badge
          variant="outline"
          className="border-amber-600/40 text-amber-700 dark:text-amber-400"
        >
          Pending
        </Badge>
        <Button
          size="icon-sm"
          variant="ghost"
          className="ml-auto"
          onClick={onDelete}
          aria-label="Delete this comment"
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
      <p className="whitespace-pre-wrap">{draft.body}</p>
    </div>
  );
}

function GradedComment({ body, useful }: { body: string; useful: boolean }) {
  return (
    <div className="bg-card rounded-lg border p-3 text-sm">
      <div className="mb-1 flex items-center gap-2">
        <span className="font-semibold">You</span>
        {useful ? (
          <Badge
            variant="outline"
            className="border-emerald-600/40 text-emerald-700 dark:text-emerald-400"
          >
            <Check aria-hidden /> Found a problem
          </Badge>
        ) : (
          <Badge variant="outline">
            <X aria-hidden /> Not a planted problem
          </Badge>
        )}
      </div>
      <p className="whitespace-pre-wrap">{body}</p>
    </div>
  );
}

function IssueReveal({ issue }: { issue: LabIssue }) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-sm",
        issue.found
          ? "border-emerald-600/40 bg-emerald-500/5"
          : "border-rose-600/40 bg-rose-500/5",
      )}
      data-testid={issue.found ? "issue-found" : "issue-missed"}
    >
      <p className="flex flex-wrap items-center gap-2 font-semibold">
        {issue.found ? (
          <CircleCheck className="size-4 text-emerald-600" aria-hidden />
        ) : (
          <CircleAlert className="size-4 text-rose-600" aria-hidden />
        )}
        {issue.found ? "You found it" : "Missed"} · {issue.title}
        <Badge variant="secondary">{SEVERITY_LABEL[issue.severity]}</Badge>
        <span className="text-muted-foreground text-xs font-normal">
          {issue.from === issue.to
            ? `Line ${issue.from}`
            : `Lines ${issue.from} to ${issue.to}`}
        </span>
      </p>
      <p className="text-muted-foreground mt-1">{issue.explanation}</p>
    </div>
  );
}
