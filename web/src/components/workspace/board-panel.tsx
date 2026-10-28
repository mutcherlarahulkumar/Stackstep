"use client";

import { AlarmClock, ChevronRight, CalendarClock, Clock, Coffee, Footprints } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { type SubmissionInput } from "@/lib/api/client";
import { type Persona, type Task, type TaskStatus } from "@/lib/api/schemas";
import { groupBoard, STATUS_LABEL } from "@/lib/board";
import { dateTimeLabel, dueLabel, isOverdue, taskTimeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { studentMoves } from "@/lib/validation";

import { SafeMarkdown } from "../ai/markdown";
import { InfoNote } from "../app/info-note";
import { PersonaAvatar } from "../app/persona-avatar";
import { EmptyState, ErrorState } from "../app/state";
import { StatusBadge, TypeBadge } from "../app/task-badges";
import { PracticePad } from "./practice-pad";
import { TaskNotes } from "./task-notes";
import { HandInDialog, QuizPlayer, ResourceList, RubricView, SubmissionCard } from "./task-work";
import { type useWorkspace } from "./use-workspace";
import { BoardSkeleton, stagger } from "../app/loading";

type Workspace = ReturnType<typeof useWorkspace>;

function SectionTitle({ id, count, children }: { id: string; count: number; children: string }) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-sm font-semibold">
      {children}
      <span className="text-muted-foreground font-normal tabular-nums">{count}</span>
    </h2>
  );
}

const ACTION_LABEL = (from: TaskStatus, to: TaskStatus): string => {
  if (from === "todo" && to === "in_progress") return "Start working";
  if (from === "in_progress" && to === "in_review") return "Submit for review";
  if (from === "in_progress" && to === "done") return "Mark as done";
  if (from === "changes_requested" && to === "in_review") return "Resubmit for review";
  if (from === "changes_requested" && to === "in_progress") return "Keep working";
  return STATUS_LABEL[to];
};

function nextStep(t: Task): string {
  if (t.type === "quiz") return t.status === "done" ? "Finished. The answer key is below." : "Answer every question, then check your answers. The best of three attempts counts.";
  if (t.review_mode === "self" && t.status === "todo") return "Start when you begin. You mark this one done yourself.";
  if (t.review_mode === "self" && t.status === "in_progress") return "No review needed. Mark it done once you've finished.";
  if (t.review_mode === "self" && t.status === "done") return "Finished. Nice work.";
  return NEXT_STEP[t.status];
}

const NEXT_STEP: Record<TaskStatus, string> = {
  todo: "Create a branch for this ticket, then start working.",
  in_progress: "Push your branch and open a PR, then submit it for review.",
  in_review: "Reviews usually come back within a day, in this task's chat. Pick up a smaller task while you wait.",
  changes_requested: "Read the review in chat, push fixes to the same branch, then resubmit.",
  done: "Approved. Merge your PR if you haven't yet.",
  cancelled: "This task was cancelled. No action needed.",
};

export function BoardPanel({
  ws,
  personas,
  openTaskId,
  onOpenTask,
}: {
  ws: Workspace;
  personas: ReadonlyMap<string, Persona>;
  openTaskId: string | null;
  onOpenTask: (id: string | null) => void;
}) {
  const tasks = ws.state.tasks;
  if (tasks.status === "loading") {
    return (
      <div className="p-4">
        <BoardSkeleton />
      </div>
    );
  }
  if (tasks.status === "error") return <ErrorState message={tasks.message} onRetry={ws.reload} />;

  const groups = groupBoard(tasks.data);
  const open = openTaskId ? tasks.data.find((t) => t.id === openTaskId) : undefined;
  // One list of what to do now: feedback to act on first, then the rest by due time.
  const todo = [...groups.changes, ...groups.today];
  const card = (t: Task, i: number) => (
    <li key={t.id} className="animate-enter-stagger" style={stagger(i)}>
      <TaskCard task={t} persona={personas.get(t.persona_id)} onOpen={() => onOpenTask(t.id)} />
    </li>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4 sm:px-6">
        <InfoNote id="student-board" title="Your tasks">
          Your team posts tasks here day by day. Open one to read the brief, do the work in your own GitHub repository and hand in the
          pull request link. It then waits for review, and your team lead approves it or asks for changes in chat.
        </InfoNote>
        <section aria-labelledby="board-todo" className="flex flex-col gap-3">
          <SectionTitle id="board-todo" count={todo.length}>
            To do
          </SectionTitle>
          {todo.length === 0 ? (
            <EmptyState icon={Coffee} title="Nothing to do right now">
              New tickets arrive in your chats. Ask your team lead what to pick up next.
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-3" aria-label="To do tasks">
              {todo.map(card)}
            </ul>
          )}
        </section>
        {groups.in_review.length > 0 ? (
          <section aria-labelledby="board-review" className="flex flex-col gap-3">
            <SectionTitle id="board-review" count={groups.in_review.length}>
              Waiting for review
            </SectionTitle>
            <ul className="flex flex-col gap-3" aria-label="Waiting for review tasks">
              {groups.in_review.map(card)}
            </ul>
          </section>
        ) : null}
        {groups.done.length > 0 ? (
          <details className="group flex flex-col gap-3" data-testid="board-done">
            <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer list-none items-center gap-2 text-sm font-medium select-none [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
              Done
              <span className="tabular-nums">{groups.done.length}</span>
            </summary>
            <ul className="mt-3 flex flex-col gap-3" aria-label="Done tasks">
              {groups.done.map(card)}
            </ul>
          </details>
        ) : null}
      </div>
      <TaskSheet
        task={open ?? null}
        persona={open ? personas.get(open.persona_id) : undefined}
        missing={openTaskId !== null && !open}
        onClose={() => onOpenTask(null)}
        onGraded={ws.apply}
        onMove={async (task, to, submission) => {
          const err = await ws.move(task, to, submission);
          if (err) {
            toast.error(err);
            return err;
          }
          toast.success(to === "in_review" ? "Sent for review" : to === "done" ? "Nice work. Marked as done." : `Moved to ${STATUS_LABEL[to]}`);
          return null;
        }}
      />
    </div>
  );
}

function TaskCard({ task, persona, onOpen }: { task: Task; persona: Persona | undefined; onOpen: () => void }) {
  const now = new Date();
  const overdue = task.status !== "in_review" && task.status !== "done" && isOverdue(task.due_at, now);
  return (
    <Card size="sm" className="hover:ring-primary/40 relative transition-shadow focus-within:ring-2">
      <CardContent className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <TypeBadge type={task.type} />
          <StatusBadge status={task.status} />
        </div>
        <button type="button" onClick={onOpen} className="text-left font-medium leading-snug outline-none after:absolute after:inset-0 after:rounded-[inherit]">
          {task.title}
        </button>
        <div className="flex items-center justify-between gap-2">
          <p className={cn("flex items-center gap-1.5 text-sm", overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
            {overdue ? <AlarmClock className="size-3.5" aria-hidden /> : <Clock className="size-3.5" aria-hidden />}
            {taskTimeLabel(task, now)}
          </p>
          {persona ? (
            <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
              <PersonaAvatar persona={persona} size="sm" />
              <span className="truncate">
                <span className="sr-only">From </span>
                {persona.name}
              </span>
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function TaskSheet({
  task,
  persona,
  missing,
  onClose,
  onMove,
  onGraded,
}: {
  task: Task | null;
  persona: Persona | undefined;
  missing: boolean;
  onClose: () => void;
  onMove: (task: Task, to: TaskStatus, submission?: SubmissionInput | null) => Promise<string | null>;
  onGraded: (t: Task) => void;
}) {
  const [pending, setPending] = useState<TaskStatus | null>(null);
  const [handIn, setHandIn] = useState(false);

  const run = async (to: TaskStatus, submission: SubmissionInput | null = null): Promise<string | null> => {
    if (!task) return null;
    setPending(to);
    const err = await onMove(task, to, submission);
    setPending(null);
    return err;
  };
  // Quizzes move only through grading.
  const moves = task && task.type !== "quiz" ? studentMoves(task.status, task.review_mode) : [];

  return (
    <Sheet open={task !== null || missing} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
        {task ? (
          <>
            <SheetHeader className="gap-3 border-b">
              <div className="flex gap-2">
                <TypeBadge type={task.type} />
                <StatusBadge status={task.status} />
              </div>
              <SheetTitle className="text-xl leading-snug">{task.title}</SheetTitle>
              <SheetDescription className="flex items-center gap-1.5">
                <CalendarClock className="size-4" aria-hidden />
                {task.status === "done" || task.status === "cancelled" ? taskTimeLabel(task, new Date()) : `${dueLabel(task.due_at, new Date())} · ${dateTimeLabel(task.due_at)}`}
              </SheetDescription>
              {persona ? (
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  <PersonaAvatar persona={persona} size="sm" /> From {persona.name} · {persona.title}
                </p>
              ) : null}
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-4">
              <Alert>
                <Footprints aria-hidden />
                <AlertTitle>Next step</AlertTitle>
                <AlertDescription>{nextStep(task)}</AlertDescription>
              </Alert>
              <h3 className="mt-6 mb-2 text-sm font-medium">Brief</h3>
              {task.brief ? (
                <div className="text-sm" data-testid="task-brief">
                  <SafeMarkdown>{task.brief}</SafeMarkdown>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No brief for this one. Ask {persona?.name ?? "your lead"} in chat if anything is unclear.</p>
              )}
              <ResourceList resources={task.content.resources} />
              <RubricView criteria={task.content.rubric} submission={task.submission} />
              {task.submission ? <SubmissionCard submission={task.submission} title="Your hand-in" /> : null}
              {task.type === "quiz" ? <QuizPlayer key={task.version} task={task} onGraded={onGraded} disabled={false} /> : null}
              {task.type === "dsa" && task.content.practice ? <PracticePad taskId={task.id} practice={task.content.practice} /> : null}
              <TaskNotes taskId={task.id} />
            </div>
            {moves.length > 0 ? (
              <SheetFooter className="border-t">
                {moves.map((to, i) => (
                  <Button
                    key={to}
                    size="lg"
                    variant={i === 0 ? "default" : "outline"}
                    disabled={pending !== null}
                    onClick={() => (to === "in_review" ? setHandIn(true) : void run(to))}
                    data-testid={`move-${to}`}
                  >
                    {pending === to ? <Spinner data-icon="inline-start" /> : null}
                    {ACTION_LABEL(task.status, to)}
                  </Button>
                ))}
              </SheetFooter>
            ) : null}
          </>
        ) : (
          <SheetHeader>
            <SheetTitle>Task removed</SheetTitle>
            <SheetDescription>This task is no longer on your board.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
      {task && handIn ? (
        <HandInDialog
          task={task}
          open={handIn}
          onClose={() => setHandIn(false)}
          onSubmit={async (sub) => {
            const err = await run("in_review", sub);
            if (!err) setHandIn(false);
            return err;
          }}
        />
      ) : null}
    </Sheet>
  );
}
