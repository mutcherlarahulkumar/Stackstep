"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, BadgeCheck, Check, ClipboardList, Coins, Ellipsis, FileBadge, FileX, MessageSquareWarning, Plus, Route, Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, messageFor } from "@/lib/api/errors";
import { type Certificate, type Persona, type Student, type Task, type TaskStatus } from "@/lib/api/schemas";
import { formatCode, verifyPath } from "@/lib/certificate";
import { dateTimeLabel, dueLabel, firstName } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Bounds, runeLength, staffMoves, validateNote } from "@/lib/validation";

import { TableSkeleton } from "../app/loading";
import { EmptyState, ErrorState } from "../app/state";
import { PersonaAvatar } from "../app/persona-avatar";
import { StatusBadge, TypeBadge } from "../app/task-badges";
import { SharedNote } from "../workspace/task-notes";
import { AssignTaskForm } from "./assign-task-form";
import { CertificateDialogs, CertificatePanel, useCertificateState } from "./certificate-panel";
import { InternshipStatus } from "./internship-status";
import { AdjustCredits, WalletPanel } from "./wallet-panel";
import { personaMap, useAllPersonas, useFlows } from "./catalog-queries";

/** Less frequent actions: credits and the certificate. */
function MoreActions({ student }: { student: Student }) {
  const { state } = useSession();
  const isAdmin = state.status === "signed_in" && state.me.user.role === "admin";
  const cert = useCertificateState(student);
  const [adjust, setAdjust] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [revoking, setRevoking] = useState<Certificate | null>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More actions" data-testid="student-more">
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem onSelect={() => setAdjust(true)} data-testid="open-credits">
            <Coins aria-hidden /> Adjust credits
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {cert.certificate ? (
            <>
              <DropdownMenuItem asChild>
                <Link href={verifyPath(cert.certificate.code)} target="_blank">
                  <BadgeCheck aria-hidden /> View certificate {formatCode(cert.certificate.code)}
                </Link>
              </DropdownMenuItem>
              {isAdmin ? (
                <DropdownMenuItem variant="destructive" onSelect={() => setRevoking(cert.certificate)} data-testid="open-revoke">
                  <FileX aria-hidden /> Revoke certificate…
                </DropdownMenuItem>
              ) : null}
            </>
          ) : (
            <DropdownMenuItem disabled={!cert.canIssue} onSelect={() => setIssuing(true)} data-testid="open-issue">
              <FileBadge aria-hidden />
              <span className="flex flex-col">
                Issue certificate…
                {cert.issueHint ? <span className="text-muted-foreground text-xs">{cert.issueHint}</span> : null}
              </span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AdjustCredits open={adjust} student={student} onClose={() => setAdjust(false)} />
      <CertificateDialogs
        student={student}
        issuing={issuing}
        revoking={revoking}
        onClose={() => {
          setIssuing(false);
          setRevoking(null);
        }}
      />
    </>
  );
}

const ORDER: Record<TaskStatus, number> = { in_review: 0, changes_requested: 1, in_progress: 2, todo: 3, done: 4, cancelled: 5 };

/** Whether AI review drafts are on (the review queue reports it). */
export function useAIDrafts(): boolean {
  const { api } = useSession();
  const q = useQuery({ queryKey: ["reviews", "flags"], queryFn: () => api.reviews(null), staleTime: 5 * 60_000 });
  return q.data?.ai_drafts ?? false;
}

export function StudentDetail({ student }: { student: Student }) {
  const aiDrafts = useAIDrafts();
  const { api } = useSession();
  const qc = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  const personas = personaMap(useAllPersonas().data);
  const [reviewing, setReviewing] = useState<{ task: Task; to: TaskStatus } | null>(null);
  const key = ["enrollment-tasks", student.enrollment.id];
  const tasks = useQuery({ queryKey: key, queryFn: () => api.enrollmentTasks(student.enrollment.id) });

  const move = useMutation({
    mutationFn: ({ task, to, note, rubric }: { task: Task; to: TaskStatus; note: string; rubric?: boolean[] | null }) =>
      api.transition(task.id, to, task.version, note, null, rubric ?? null),
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
      <div className="flex flex-col gap-4 border-b px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{student.user.name}</h2>
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
              <span>@{student.user.github_login}</span>
              <span aria-hidden>·</span>
              <span>{student.enrollment.program.slug}</span>
              <span aria-hidden>·</span>
              <span>
                Day {student.enrollment.day_number} of {student.enrollment.program.days}
              </span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <Route className="size-3.5" aria-hidden />
                {enrollment.flow ? (
                  <span>
                    <span className="text-foreground font-medium">{enrollment.flow.name}</span> v{enrollment.flow.version}
                  </span>
                ) : (
                  "No flow yet"
                )}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <InternshipStatus key={enrollment.status} student={student} enrollment={enrollment} />
            <Button variant="outline" onClick={() => setFlowOpen(true)} disabled={student.enrollment.status !== "active"} data-testid="open-assign-flow">
              <Route data-icon="inline-start" aria-hidden /> {enrollment.flow ? "Change flow" : "Assign flow"}
            </Button>
            <Button onClick={() => setAssignOpen(true)} disabled={student.enrollment.status !== "active"} data-testid="open-assign">
              <Plus data-icon="inline-start" aria-hidden /> Assign task
            </Button>
            <MoreActions student={student} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <CertificatePanel student={student} />
          <WalletPanel student={student} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {tasks.isPending ? (
          <TableSkeleton rows={5} cols={4} />
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
                      {t.shared_note ? <SharedNote note={t.shared_note} /> : null}
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
                        <ReviewButton key={to} to={to} onClick={() => (to === "done" && t.content.rubric.length === 0 ? move.mutate({ task: t, to, note: "" }) : setReviewing({ task: t, to }))} busy={move.isPending && move.variables.task.id === t.id} />
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
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader className="bg-popover sticky top-0 z-10 border-b">
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
        aiDrafts={aiDrafts}
        onCancel={() => setReviewing(null)}
        onConfirm={(to, note, rubric) => {
          if (reviewing) move.mutate({ task: reviewing.task, to, note, rubric });
        }}
      />
    </div>
  );
}

/** The latest hand-in, compact: the link, then the note behind a disclosure. */
export function HandIn({ submission }: { submission: NonNullable<Task["submission"]> }) {
  return (
    <div className="flex flex-col gap-1 text-xs" data-testid="hand-in">
      {submission.checks.length > 0 ? (
        <ul className="flex flex-col gap-1" aria-label="Things to check">
          {submission.checks.map((c) => (
            <li key={c.code} className="text-foreground bg-warning/12 flex items-start gap-1.5 rounded-md px-2 py-1" data-testid={`check-${c.code}`}>
              <TriangleAlert className="text-warning mt-px size-3.5 shrink-0" aria-hidden />
              <span>{c.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {submission.url ? (
        <a href={submission.url} target="_blank" rel="noopener noreferrer" className="text-primary truncate font-medium underline-offset-4 hover:underline">
          {submission.url.replace(/^https?:\/\//, "")}
        </a>
      ) : null}
      {submission.rubric ? (
        <span className="text-muted-foreground" data-testid="rubric-summary">
          Rubric: {submission.rubric.filter(Boolean).length} of {submission.rubric.length} met
        </span>
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

export function PersonaTag({ persona }: { persona: Persona | undefined }) {
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

/** Review a hand-in (approve or request changes, with the rubric) or cancel a task. */
export function NoteDialog({
  target,
  busy,
  aiDrafts = false,
  autoDraft = false,
  onCancel,
  onConfirm,
}: {
  target: { task: Task; to: TaskStatus } | null;
  busy: boolean;
  /** Offer "Draft with AI" (the review queue says whether drafts are on). */
  aiDrafts?: boolean;
  /** Start drafting as soon as the dialog opens. */
  autoDraft?: boolean;
  onCancel: () => void;
  onConfirm: (to: TaskStatus, note: string, rubric: boolean[] | null) => void;
}) {
  return target ? (
    <ReviewForm key={`${target.task.id}-${target.to}`} target={target} busy={busy} aiDrafts={aiDrafts} autoDraft={autoDraft} onCancel={onCancel} onConfirm={onConfirm} />
  ) : null;
}

/** Copy for a failed draft; the admin can always review by hand. */
function draftError(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case "not_configured":
        return "AI drafts are off on this server. Review it yourself below.";
      case "ai_unavailable":
        return "The AI couldn't draft this one. Try again, or review it yourself.";
      case "invalid_state":
        return "This hand-in isn't waiting for review any more.";
      default:
        return messageFor(e);
    }
  }
  return messageFor(e);
}

function ReviewForm({
  target,
  busy,
  aiDrafts,
  autoDraft,
  onCancel,
  onConfirm,
}: {
  target: { task: Task; to: TaskStatus };
  busy: boolean;
  aiDrafts: boolean;
  autoDraft: boolean;
  onCancel: () => void;
  onConfirm: (to: TaskStatus, note: string, rubric: boolean[] | null) => void;
}) {
  const { api } = useSession();
  const criteria = target.task.content.rubric;
  const reviewing = target.to === "done" || target.to === "changes_requested";
  const [to, setTo] = useState<TaskStatus>(target.to);
  const withRubric = reviewing && criteria.length > 0;
  const [note, setNote] = useState("");
  const [ticks, setTicks] = useState<boolean[]>(() => criteria.map(() => target.to === "done"));
  const [error, setError] = useState<string | null>(null);
  const changes = to === "changes_requested";
  const approve = to === "done";
  const met = ticks.filter(Boolean).length;
  const canDraft = aiDrafts && reviewing && target.task.status === "in_review";

  const draft = useMutation({
    mutationFn: () => api.reviewDraft(target.task.id),
    onSuccess: (d) => {
      setTo(d.decision === "approve" ? "done" : "changes_requested");
      setNote(d.note);
      if (d.rubric && d.rubric.length === criteria.length) setTicks(d.rubric);
      setError(null);
    },
  });
  const started = useRef(false);
  useEffect(() => {
    if (autoDraft && canDraft && !started.current) {
      started.current = true;
      draft.mutate();
    }
  }, [autoDraft, canDraft, draft]);

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onCancel())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{reviewing ? `Review “${target.task.title}”` : "Cancel this task?"}</DialogTitle>
          <DialogDescription>
            {approve
              ? "Tick what was met. The student sees the checklist and your note."
              : changes
                ? "Your note goes to the student in chat. Be specific about what to change."
                : `“${target.task.title}” leaves the student's board. This can't be undone.`}
          </DialogDescription>
        </DialogHeader>
        {canDraft ? (
          <div className="flex flex-col gap-2" data-testid="ai-draft">
            {draft.isPending ? (
              <p className="text-muted-foreground flex items-center gap-2 text-sm" role="status">
                <Spinner /> Drafting… reading the task{(target.task.submission?.url ?? "").includes("github.com") ? " and the PR" : ""}
              </p>
            ) : draft.isError ? (
              <Alert variant="destructive">
                <TriangleAlert aria-hidden />
                <AlertDescription>{draftError(draft.error)}</AlertDescription>
              </Alert>
            ) : draft.data ? (
              <Alert data-testid="ai-draft-summary">
                <Sparkles aria-hidden />
                <AlertTitle>AI draft · check it before you send</AlertTitle>
                <AlertDescription>
                  <p>{draft.data.summary}</p>
                  <p className="text-xs">{draft.data.read_pr ? "Based on the task and the PR's diff." : "Based on the task and hand-in only (the PR couldn't be read)."}</p>
                </AlertDescription>
              </Alert>
            ) : null}
            {!draft.isPending ? (
              <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => draft.mutate()} data-testid="ai-draft-button">
                <Sparkles data-icon="inline-start" aria-hidden /> {draft.data || draft.isError ? "Draft again" : "Draft with AI"}
              </Button>
            ) : null}
          </div>
        ) : null}
        <form
          id="note-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const err = validateNote(note, to);
            setError(err);
            if (!err) onConfirm(to, note.trim(), withRubric ? ticks : null);
          }}
        >
          {reviewing ? (
            <ToggleGroup
              type="single"
              variant="outline"
              value={to}
              onValueChange={(v) => {
                if (v === "done" || v === "changes_requested") setTo(v);
              }}
              aria-label="Decision"
              className="self-start"
            >
              <ToggleGroupItem value="done" data-testid="decision-approve">
                <Check aria-hidden /> Approve
              </ToggleGroupItem>
              <ToggleGroupItem value="changes_requested" data-testid="decision-changes">
                <MessageSquareWarning aria-hidden /> Request changes
              </ToggleGroupItem>
            </ToggleGroup>
          ) : null}
          {withRubric ? (
            <fieldset className="flex flex-col gap-2 rounded-lg border p-3" data-testid="rubric-review">
              <legend className="px-1 text-sm font-medium">
                Rubric · {met} of {criteria.length} met
              </legend>
              {criteria.map((c, i) => (
                <label key={i} className="flex items-start gap-2.5 text-sm">
                  <Checkbox className="mt-0.5" checked={ticks[i] ?? false} onCheckedChange={(v) => setTicks((t) => t.map((x, j) => (j === i ? v === true : x)))} aria-label={c} />
                  <span>{c}</span>
                </label>
              ))}
            </fieldset>
          ) : null}
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="review-note">{changes ? "What needs to change" : approve ? "Note (optional)" : "Reason (optional)"}</FieldLabel>
            <Textarea id="review-note" rows={changes || draft.data ? 6 : 3} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={!!error} />
            {error ? <FieldError>{error}</FieldError> : <span className="text-muted-foreground text-xs tabular-nums">{runeLength(note.trim())} / {Bounds.noteMax}</span>}
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Back
          </Button>
          <Button type="submit" form="note-form" variant={to === "cancelled" ? "destructive" : "default"} disabled={busy || draft.isPending} data-testid="review-confirm">
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {approve ? "Approve" : changes ? "Send to student" : "Cancel task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
