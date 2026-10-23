"use client";

import { Copy, Plus, Route } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { messageFor } from "@/lib/api/errors";
import { type Flow, type FlowSummary } from "@/lib/api/schemas";
import { cn } from "@/lib/utils";

import { EmptyState, ErrorState, ListSkeleton } from "../app/state";
import { AdminShell } from "./admin-shell";
import { useFlows } from "./catalog-queries";
import { DuplicateFlowDialog, FlowDetailsDialog } from "./flow-dialogs";

export function FlowsScreen() {
  return (
    <AdminShell section="flows" phone="gate">
      {(me) => <Flows canEdit={me.user.role === "admin"} />}
    </AdminShell>
  );
}

export function FlowStatus({ flow }: { flow: Pick<FlowSummary, "published_version" | "has_draft" | "archived"> }) {
  if (flow.archived) return <Badge variant="secondary">Archived</Badge>;
  if (flow.published_version === null) return <Badge variant="outline">Draft · not published</Badge>;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge className="bg-success/14 text-success-strong" variant="secondary">
        Published v{flow.published_version}
      </Badge>
      {flow.has_draft ? <Badge variant="outline">Unpublished changes</Badge> : null}
    </span>
  );
}

function Flows({ canEdit }: { canEdit: boolean }) {
  const router = useRouter();
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [duplicating, setDuplicating] = useState<Flow | null>(null);
  const q = useFlows(archived);
  const byStream = new Map<string, FlowSummary[]>();
  for (const f of q.data ?? []) byStream.set(f.stream, [...(byStream.get(f.stream) ?? []), f]);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-y-auto p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Flows</h1>
          <p className="text-muted-foreground text-sm">Courses per stream. Each one schedules its tasks day by day for every student on it.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="flows-archived" checked={archived} onCheckedChange={setArchived} />
            <Label htmlFor="flows-archived" className="text-sm">
              Show archived
            </Label>
          </div>
          {canEdit ? (
            <Button onClick={() => setCreating(true)} data-testid="new-flow">
              <Plus data-icon="inline-start" aria-hidden /> New flow
            </Button>
          ) : null}
        </div>
      </div>
      {q.isPending ? (
        <ListSkeleton rows={4} className="h-14" />
      ) : q.isError ? (
        <ErrorState message={messageFor(q.error)} onRetry={() => void q.refetch()} />
      ) : byStream.size === 0 ? (
        <EmptyState icon={Route} title="No flows yet" action={canEdit ? <Button onClick={() => setCreating(true)}>Create the first flow</Button> : undefined}>
          Build a 30- or 60-day course from the task library, publish it, then assign it to students.
        </EmptyState>
      ) : (
        [...byStream.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([stream, flows]) => (
            <section key={stream} className="mb-8" aria-label={`${stream} flows`}>
              <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">{stream}</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Flow</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Tasks</TableHead>
                    <TableHead className="text-right">Active students</TableHead>
                    <TableHead className="w-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flows.map((f) => (
                    <TableRow key={f.id} className={cn(f.archived && "opacity-60")} data-testid={`flow-row-${f.name}`}>
                      <TableCell>
                        <Link href={`/admin/flows/${f.id}`} className="font-medium hover:underline">
                          {f.name}
                        </Link>
                        <p className="text-muted-foreground text-sm">{f.days} days</p>
                      </TableCell>
                      <TableCell>
                        <FlowStatus flow={f} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{f.task_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{f.active_students}</TableCell>
                      <TableCell>
                        {canEdit ? (
                          <Button variant="ghost" size="sm" onClick={() => setDuplicating(f)} data-testid={`duplicate-${f.name}`}>
                            <Copy data-icon="inline-start" aria-hidden /> Duplicate
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          ))
      )}
      <FlowDetailsDialog
        key={creating ? "open" : "closed"}
        open={creating}
        flow={null}
        onClose={() => setCreating(false)}
        onSaved={(id) => {
          setCreating(false);
          toast.success("Flow created. Add its tasks next.");
          router.push(`/admin/flows/${id}`);
        }}
      />
      <DuplicateFlowDialog
        key={duplicating?.id ?? "none"}
        source={duplicating}
        onClose={() => setDuplicating(null)}
        onDone={(d) => {
          setDuplicating(null);
          toast.success(`Created “${d.flow.name}”`, { description: "Review its tasks, then publish." });
          router.push(`/admin/flows/${d.flow.id}`);
        }}
      />
    </div>
  );
}
