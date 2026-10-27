"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardCheck, Clock, MessageSquareWarning, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, messageFor } from "@/lib/api/errors";
import { type ReviewItem, type Task, type TaskStatus } from "@/lib/api/schemas";
import { firstName } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { PAGE, PageHeader } from "../app/page-header";
import { stagger } from "../app/loading";
import { EmptyState, ErrorState, ListSkeleton } from "../app/state";
import { TypeBadge } from "../app/task-badges";
import { AdminShell } from "./admin-shell";
import { personaMap, useAllPersonas } from "./catalog-queries";
import { SharedNote } from "../workspace/task-notes";
import { HandIn, NoteDialog, PersonaTag } from "./review";

const ALL = "all";

export function ReviewsScreen() {
  return <AdminShell section="reviews" phone="gate">{() => <Reviews />}</AdminShell>;
}

/** "3h", "2d 4h": how long a hand-in has waited. */
export function waitingLabel(hours: number): string {
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h`;
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return h ? `${d}d ${h}h` : `${d}d`;
}

function Reviews() {
  const { api } = useSession();
  const qc = useQueryClient();
  const personas = useAllPersonas();
  const byId = personaMap(personas.data);
  const [persona, setPersona] = useState(ALL);
  const [noting, setNoting] = useState<{ task: Task; to: TaskStatus; draft?: boolean } | null>(null);
  const key = ["reviews", persona];
  const q = useQuery({ queryKey: key, queryFn: () => api.reviews(persona === ALL ? null : persona), refetchInterval: 60_000 });

  const move = useMutation({
    mutationFn: ({ task, to, note, rubric }: { item: ReviewItem; task: Task; to: TaskStatus; note: string; rubric?: boolean[] | null }) =>
      api.transition(task.id, to, task.version, note, null, rubric ?? null),
    onSuccess: (_t, v) => {
      toast.success(v.to === "done" ? `Approved “${v.task.title}” for ${firstName(v.item.student.name)}` : `Changes requested from ${firstName(v.item.student.name)}`);
      setNoting(null);
    },
    onError: (e) => {
      if (e instanceof ApiError && (e.code === "version_conflict" || e.code === "invalid_transition")) toast.error("The student moved this task meanwhile. We refreshed the queue.");
      else toast.error(messageFor(e));
    },
    onSettled: () => {
      for (const k of ["reviews", "students", "enrollment-tasks", "overview"]) void qc.invalidateQueries({ queryKey: [k] });
    },
  });

  const items = q.data?.items ?? [];
  const pending = move.isPending ? move.variables.task.id : null;
  const noteItem = noting ? items.find((i) => i.task.id === noting.task.id) : undefined;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={cn(PAGE, "gap-6")}>
        <PageHeader title="Reviews" description={<>Every hand-in waiting on you, oldest first. Aim to review within {q.data?.sla_hours ?? 24} hours — students are waiting to move on.</>}>
          <Select value={persona} onValueChange={setPersona}>
            <SelectTrigger className="w-56" aria-label="Filter by persona">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All personas</SelectItem>
              {(personas.data ?? [])
                .filter((p) => !p.archived)
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.title}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </PageHeader>

        {q.isPending ? (
          <ListSkeleton rows={4} className="h-28" />
        ) : q.isError ? (
          <ErrorState message={messageFor(q.error)} onRetry={() => void q.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="Nothing to review">
            You&apos;re all caught up. New hand-ins appear here as students send them.
          </EmptyState>
        ) : (
          <>
            <p className="text-sm" data-testid="review-summary">
              <span className="font-medium tabular-nums">{items.length}</span> waiting
              {q.data.overdue > 0 ? (
                <>
                  {" · "}
                  <span className="text-destructive font-medium tabular-nums">{q.data.overdue} over {q.data.sla_hours}h</span>
                </>
              ) : null}
            </p>
            <ul className="flex flex-col gap-3" aria-label="Hand-ins waiting for review">
              {items.map((item, i) => (
                <li key={item.task.id} className="animate-enter-stagger" style={stagger(i)} data-testid={`review-${item.task.title}`}>
                  <Card className={cn("gap-0 py-0", item.overdue && "ring-destructive/40")}>
                    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge variant={item.overdue ? "destructive" : "secondary"} className="tabular-nums">
                            <Clock aria-hidden /> {waitingLabel(item.waiting_hours)}
                          </Badge>
                          <TypeBadge type={item.task.type} />
                          <PersonaTag persona={byId.get(item.task.persona_id)} />
                        </div>
                        <h2 className="truncate font-medium">{item.task.title}</h2>
                        <p className="text-muted-foreground text-sm">
                          {item.student.name} · @{item.student.github_login}
                        </p>
                        {item.task.submission ? <HandIn submission={item.task.submission} /> : null}
                        {item.task.shared_note ? <SharedNote note={item.task.shared_note} /> : null}
                      </div>
                      <div className="flex shrink-0 gap-2 sm:flex-col">
                        <Button
                          size="sm"
                          onClick={() => (item.task.content.rubric.length > 0 ? setNoting({ task: item.task, to: "done" }) : move.mutate({ item, task: item.task, to: "done", note: "" }))}
                          disabled={pending === item.task.id}
                          data-testid="review-approve"
                        >
                          {pending === item.task.id ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" aria-hidden />} Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setNoting({ task: item.task, to: "changes_requested" })} data-testid="review-changes">
                          <MessageSquareWarning data-icon="inline-start" aria-hidden /> Request changes
                        </Button>
                        {q.data.ai_drafts ? (
                          <Button size="sm" variant="ghost" onClick={() => setNoting({ task: item.task, to: "changes_requested", draft: true })} data-testid="review-draft">
                            <Sparkles data-icon="inline-start" aria-hidden /> Draft with AI
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <NoteDialog
        target={noting}
        busy={move.isPending}
        aiDrafts={q.data?.ai_drafts ?? false}
        autoDraft={noting?.draft ?? false}
        onCancel={() => setNoting(null)}
        onConfirm={(to, note, rubric) => {
          if (noting && noteItem) move.mutate({ item: noteItem, task: noting.task, to, note, rubric });
        }}
      />
    </div>
  );
}
