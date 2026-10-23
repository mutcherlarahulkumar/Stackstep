"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, ClipboardList, MessageSquareWarning, Plus, Route } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, messageFor } from "@/lib/api/errors";
import { type Persona, type Student, type Task, type TaskStatus } from "@/lib/api/schemas";
import { dateTimeLabel, dueLabel, firstName } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Bounds, runeLength, staffMoves, validateNote } from "@/lib/validation";

import { EmptyState, ErrorState, ListSkeleton } from "../app/state";
import { PersonaAvatar } from "../app/persona-avatar";
import { StatusBadge, TypeBadge } from "../app/task-badges";
import { AssignTaskForm } from "./assign-task-form";
import { WalletPanel } from "./wallet-panel";
import { personaMap, useAllPersonas, useFlows } from "./catalog-queries";

const ORDER: Record<TaskStatus, number> = { in_review: 0, changes_requested: 1, in_progress: 2, todo: 3, done: 4, cancelled: 5 };

export function StudentDetail({ student }: { student: Student }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  const personas = personaMap(useAllPersonas().data);
  const [reviewing, setReviewing] = useState<{ task: Task; to: TaskStatus } | null>(null);
  const key = ["enrollment-tasks", student.enrollment.id];
  const tasks = useQuery({ queryKey: key, queryFn: () => api.enrollmentTasks(student.enrollment.id) });

  const move = useMutation({
    mutationFn: ({ task, to, note }: { task: Task; to: TaskStatus; note: string }) => api.transition(task.id, to, task.version, note),
    onSuccess: (_t, v) => {
      toast.success(v.to === "done" ? "Approved" : v.to === "changes_requested" ? "Changes requested" : "Task cancelled");
      setReviewing(null);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "version_conflict") toast.error("The student moved this task meanwhile. We refreshed the list.");
      else toast.error(messageFor(e));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["students"] });
    },
  });

  // The enrollment from this fetch is fresher than the list row (e.g. right after assigning a flow).
  const enrollment = tasks.data?.enrollment ?? student.enrollment;
  const sorted = [...(tasks.data?.items ?? [])].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.due_at.getTime() - b.due_at.getTime());
  const now = new Date();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{student.user.name}</h2>
          <p className="text-muted-foreground text-sm">
            @{student.user.github_login} · {student.enrollment.program.slug} · Day {student.enrollment.day_number} of {student.enrollment.program.days}
          </p>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
            <Route className="size-4" aria-hidden />
            {enrollment.flow ? (
              <span>
                On <span className="text-foreground font-medium">{enrollment.flow.name}</span> · v{enrollment.flow.version}
              </span>
            ) : (
              <span>No flow yet</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={() => setFlowOpen(true)} disabled={student.enrollment.status !== "active"} data-testid="open-assign-flow">
            <Route data-icon="inline-start" aria-hidden /> {enrollment.flow ? "Change flow" : "Assign flow"}
          </Button>
          <Button onClick={() => setAssignOpen(true)} disabled={student.enrollment.status !== "active"} data-testid="open-assign">
            <Plus data-icon="inline-start" aria-hidden /> Assign task
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
        <WalletPanel student={student} />
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs" title="Reviews are done by hand for now">
          AI review suggestions <Badge variant="outline">Coming soon</Badge>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {tasks.isPending ? (
          <ListSkeleton rows={5} className="h-11" />
        ) : tasks.isError ? (
          <ErrorState message={messageFor(tasks.error)} onRetry={() => void tasks.refetch()} />
        ) : sorted.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No tasks yet" action={<Button onClick={() => setAssignOpen(true)}>Assign the first task</Button>}>
            {firstName(student.user.name)}&apos;s board is empty.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((t) => (
                <TableRow key={t.id} data-testid={`task-row-${t.title}`}>
                  <TableCell className="max-w-80">
                    <div className="flex flex-col gap-1">
                      <span className="truncate font-medium">{t.title}</span>
                      <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                        <TypeBadge type={t.type} />
                        <PersonaTag persona={personas.get(t.persona_id)} />
                        {t.review_mode === "self" ? <span>Self-check</span> : null}
                        {t.from_flow ? <span>From flow</span> : null}
                        {t.quiz_result ? <span data-testid="quiz-score">Quiz {t.quiz_result.best_score}%</span> : null}
                      </span>
                      {t.submission ? <HandIn submission={t.submission} /> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={t.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {t.status === "done" || t.status === "cancelled"
                      ? `Was due ${dateTimeLabel(t.due_at)}`
                      : t.scheduled_for > now
                        ? `Shows ${dateTimeLabel(t.scheduled_for)}`
                        : dueLabel(t.due_at, now)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      {staffMoves(t.status).map((to) => (
                        <ReviewButton key={to} to={to} onClick={() => (to === "done" ? move.mutate({ task: t, to, note: "" }) : setReviewing({ task: t, to }))} busy={move.isPending && move.variables.task.id === t.id} />
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Sheet open={assignOpen} onOpenChange={setAssignOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Assign a task</SheetTitle>
            <SheetDescription>To {student.user.name}. It appears on their board and the persona you pick announces it in chat.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <AssignTaskForm
              student={student}
              onAssigned={(t) => {
                toast.success(`Assigned “${t.title}”`);
                setAssignOpen(false);
                void qc.invalidateQueries({ queryKey: key });
                void qc.invalidateQueries({ queryKey: ["students"] });
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <AssignFlowDialog
        key={flowOpen ? "open" : "closed"}
        open={flowOpen}
        student={student}
        currentFlowId={enrollment.flow?.flow_id ?? null}
        onClose={() => setFlowOpen(false)}
        onDone={() => {
          setFlowOpen(false);
          void qc.invalidateQueries({ queryKey: key });
          void qc.invalidateQueries({ queryKey: ["students"] });
        }}
      />

      <NoteDialog
        target={reviewing}
        busy={move.isPending}
        onCancel={() => setReviewing(null)}
        onConfirm={(note) => {
          if (reviewing) move.mutate({ task: reviewing.task, to: reviewing.to, note });
        }}
      />
    </div>
  );
}

/** The latest hand-in, compact: the link, then the note behind a disclosure. */
function HandIn({ submission }: { submission: NonNullable<Task["submission"]> }) {
  return (
    <div className="flex flex-col gap-1 text-xs" data-testid="hand-in">
      {submission.url ? (
        <a href={submission.url} target="_blank" rel="noopener noreferrer" className="text-primary truncate font-medium underline-offset-4 hover:underline">
          {submission.url.replace(/^https?:\/\//, "")}
        </a>
      ) : null}
      {submission.note ? (
        <details className="text-muted-foreground">
          <summary className="cursor-pointer select-none">
            Note{submission.attempt > 1 ? ` · attempt ${submission.attempt}` : ""}
          </summary>
          <p className="text-foreground mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap">{submission.note}</p>
        </details>
      ) : submission.attempt > 1 ? (
        <span className="text-muted-foreground">Attempt {submission.attempt}</span>
      ) : null}
    </div>
  );
}

function PersonaTag({ persona }: { persona: Persona | undefined }) {
  if (!persona) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <PersonaAvatar persona={persona} size="sm" className="size-4" />
      {persona.name}
    </span>
  );
}

/** Puts one student on a published flow (or switches them to another). */
function AssignFlowDialog({
  open,
  student,
  currentFlowId,
  onClose,
  onDone,
}: {
  open: boolean;
  student: Student;
  currentFlowId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { api } = useSession();
  const flows = useFlows(false);
  const usable = (flows.data ?? []).filter((f) => f.published_version !== null && f.days === student.enrollment.program.days);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const assign = useMutation({
    mutationFn: (id: string) => api.assignFlow(student.enrollment.id, id),
    onSuccess: (r) => {
      if (r.error) {
        setError(r.error.message);
        return;
      }
      toast.success(`Scheduled ${r.generated} ${r.generated === 1 ? "task" : "tasks"}`, {
        description: [r.skipped ? `${r.skipped} on past days skipped` : "", r.cancelled ? `${r.cancelled} from the old flow cancelled` : ""].filter(Boolean).join(" · ") || undefined,
      });
      onDone();
    },
    onError: (e) => setError(messageFor(e)),
  });
  const switching = currentFlowId !== null && flowId !== null && flowId !== currentFlowId;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{currentFlowId ? "Change flow" : "Assign a flow"}</DialogTitle>
          <DialogDescription>
            Every task of the published version is scheduled for {firstName(student.user.name)} from today on. Days already over are skipped.
          </DialogDescription>
        </DialogHeader>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="assign-flow">Flow</FieldLabel>
          <Select
            value={flowId ?? ""}
            onValueChange={(v) => {
              setFlowId(v);
              setError(null);
            }}
          >
            <SelectTrigger id="assign-flow" className="w-full">
              <SelectValue placeholder={flows.isPending ? "Loading…" : usable.length ? "Pick a flow" : `No published ${student.enrollment.program.days}-day flows`} />
            </SelectTrigger>
            <SelectContent>
              {usable.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name} <span className="text-muted-foreground">· v{f.published_version}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error ? (
            <FieldError>{error}</FieldError>
          ) : switching ? (
            <FieldDescription>Tasks from the current flow that haven&apos;t shown up yet are cancelled. Released ones stay.</FieldDescription>
          ) : null}
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!flowId || assign.isPending} onClick={() => flowId && assign.mutate(flowId)} data-testid="assign-flow-confirm">
            {assign.isPending ? <Spinner data-icon="inline-start" /> : null} {switching ? "Switch flow" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewButton({ to, onClick, busy }: { to: TaskStatus; onClick: () => void; busy: boolean }) {
  switch (to) {
    case "done":
      return (
        <Button size="sm" onClick={onClick} disabled={busy}>
          {busy ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" aria-hidden />} Approve
        </Button>
      );
    case "changes_requested":
      return (
        <Button size="sm" variant="outline" onClick={onClick} disabled={busy}>
          <MessageSquareWarning data-icon="inline-start" aria-hidden /> Request changes
        </Button>
      );
    case "cancelled":
      return (
        <Button size="sm" variant="ghost" onClick={onClick} disabled={busy} aria-label="Cancel task">
          <Ban aria-hidden />
        </Button>
      );
    case "todo":
    case "in_progress":
    case "in_review":
      return null;
  }
}

function NoteDialog({
  target,
  busy,
  onCancel,
  onConfirm,
}: {
  target: { task: Task; to: TaskStatus } | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const changes = target?.to === "changes_requested";
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(o) => {
        if (!o) {
          setNote("");
          setError(null);
          onCancel();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{changes ? "Request changes" : "Cancel this task?"}</DialogTitle>
          <DialogDescription>
            {changes
              ? "Your note goes to the student in chat. Be specific about what to change."
              : `“${target?.task.title ?? ""}” leaves the student's board. This can't be undone.`}
          </DialogDescription>
        </DialogHeader>
        <form
          id="note-form"
          onSubmit={(e) => {
            e.preventDefault();
            const err = target ? validateNote(note, target.to) : null;
            setError(err);
            if (!err) onConfirm(note.trim());
          }}
        >
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="review-note">{changes ? "What needs to change" : "Reason (optional)"}</FieldLabel>
            <Textarea id="review-note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={!!error} />
            {error ? <FieldError>{error}</FieldError> : <span className="text-muted-foreground text-xs tabular-nums">{runeLength(note.trim())} / {Bounds.noteMax}</span>}
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Back
          </Button>
          <Button type="submit" form="note-form" variant={changes ? "default" : "destructive"} disabled={busy}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {changes ? "Send to student" : "Cancel task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
