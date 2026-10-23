"use client";

import { AlarmClock, CalendarClock, CircleCheck, Clock, Coffee, Footprints, GitPullRequest, Trophy, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type Task, type TaskStatus } from "@/lib/api/schemas";
import { COLUMN_LABEL, COLUMNS, columnOf, groupBoard, STATUS_LABEL, type Column } from "@/lib/board";
import { dateTimeLabel, dueLabel, isOverdue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { studentMoves } from "@/lib/validation";

import { choiceItem } from "../app/choice";
import { EmptyState, ErrorState, ListSkeleton } from "../app/state";
import { StatusBadge, TypeBadge } from "../app/task-badges";
import { type useWorkspace } from "./use-workspace";

type Workspace = ReturnType<typeof useWorkspace>;

const EMPTY: Record<Column, { icon: LucideIcon; title: string; body: string }> = {
  today: { icon: Coffee, title: "Nothing due today", body: "Your lead drops new tickets in chat. Ask what to pick up next." },
  in_review: { icon: GitPullRequest, title: "Nothing in review", body: "When you open a PR, move its card here so your lead knows to look." },
  changes: { icon: CircleCheck, title: "No changes requested", body: "Review feedback lands here. Clean so far." },
  done: { icon: Trophy, title: "Nothing finished yet", body: "Approved work collects here. Your first one is close." },
};

const ACTION_LABEL = (from: TaskStatus, to: TaskStatus): string => {
  if (from === "todo" && to === "in_progress") return "Start working";
  if (from === "in_progress" && to === "in_review") return "Submit for review";
  if (from === "changes_requested" && to === "in_review") return "Resubmit for review";
  if (from === "changes_requested" && to === "in_progress") return "Keep working";
  return STATUS_LABEL[to];
};

const NEXT_STEP: Record<TaskStatus, string> = {
  todo: "Create a branch for this ticket, then start working.",
  in_progress: "Push your branch and open a PR, then submit it for review.",
  in_review: "Your lead is reviewing. Pick up a smaller task while you wait.",
  changes_requested: "Read the review in chat, push fixes to the same branch, then resubmit.",
  done: "Approved. Merge your PR if you haven't yet.",
  cancelled: "This task was cancelled. No action needed.",
};

export function BoardPanel({ ws, openTaskId, onOpenTask }: { ws: Workspace; openTaskId: string | null; onOpenTask: (id: string | null) => void }) {
  const [column, setColumn] = useState<Column>("today");
  const tasks = ws.state.tasks;
  if (tasks.status === "loading") {
    return (
      <div className="p-4">
        <ListSkeleton />
      </div>
    );
  }
  if (tasks.status === "error") return <ErrorState message={tasks.message} onRetry={ws.reload} />;

  const groups = groupBoard(tasks.data);
  const open = openTaskId ? tasks.data.find((t) => t.id === openTaskId) : undefined;
  const empty = EMPTY[column];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pt-4 sm:px-6">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={column}
          onValueChange={(v) => {
            if (v) setColumn(v as Column);
          }}
          aria-label="Board column"
          className="w-full flex-wrap justify-start"
        >
          {COLUMNS.map((c) => (
            <ToggleGroupItem key={c} value={c} aria-label={`${COLUMN_LABEL[c]}, ${groups[c].length} tasks`} className={cn("gap-1.5", choiceItem)}>
              {COLUMN_LABEL[c]}
              <span className="text-muted-foreground tabular-nums">{groups[c].length}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:px-6">
        {groups[column].length === 0 ? (
          <EmptyState icon={empty.icon} title={empty.title}>
            {empty.body}
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3" aria-label={`${COLUMN_LABEL[column]} tasks`}>
            {groups[column].map((t) => (
              <li key={t.id}>
                <TaskCard task={t} onOpen={() => onOpenTask(t.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <TaskSheet
        task={open ?? null}
        missing={openTaskId !== null && !open}
        onClose={() => onOpenTask(null)}
        onMove={async (task, to) => {
          const err = await ws.move(task, to);
          if (err) toast.error(err);
          else {
            toast.success(to === "in_review" ? "Sent for review" : `Moved to ${STATUS_LABEL[to]}`);
            setColumn(columnOf(to));
          }
        }}
      />
    </div>
  );
}

function TaskCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
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
        <p className={cn("flex items-center gap-1.5 text-sm", overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
          {overdue ? <AlarmClock className="size-3.5" aria-hidden /> : <Clock className="size-3.5" aria-hidden />}
          {dueLabel(task.due_at, now)}
        </p>
      </CardContent>
    </Card>
  );
}

function TaskSheet({
  task,
  missing,
  onClose,
  onMove,
}: {
  task: Task | null;
  missing: boolean;
  onClose: () => void;
  onMove: (task: Task, to: TaskStatus) => Promise<void>;
}) {
  const [pending, setPending] = useState<TaskStatus | null>(null);
  const [confirm, setConfirm] = useState<TaskStatus | null>(null);

  const run = async (to: TaskStatus) => {
    if (!task) return;
    setPending(to);
    await onMove(task, to);
    setPending(null);
  };

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
                {dueLabel(task.due_at, new Date())} · {dateTimeLabel(task.due_at)}
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-4">
              <Alert>
                <Footprints aria-hidden />
                <AlertTitle>Next step</AlertTitle>
                <AlertDescription>{NEXT_STEP[task.status]}</AlertDescription>
              </Alert>
              <h3 className="mt-6 mb-2 text-sm font-medium">Brief</h3>
              {task.brief ? (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{task.brief}</p>
              ) : (
                <p className="text-muted-foreground text-sm">No brief for this one. Ask your lead in chat if anything is unclear.</p>
              )}
            </div>
            {studentMoves(task.status).length > 0 ? (
              <SheetFooter className="border-t">
                {studentMoves(task.status).map((to, i) => (
                  <Button
                    key={to}
                    size="lg"
                    variant={i === 0 ? "default" : "outline"}
                    disabled={pending !== null}
                    onClick={() => (to === "in_review" ? setConfirm(to) : void run(to))}
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
      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit for review?</AlertDialogTitle>
            <AlertDialogDescription>Make sure your PR is open and its description says what changed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const to = confirm;
                setConfirm(null);
                if (to) void run(to);
              }}
            >
              Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
