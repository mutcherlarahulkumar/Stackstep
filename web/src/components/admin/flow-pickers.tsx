"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Search, TriangleAlert } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { itemErrorMessage, messageFor } from "@/lib/api/errors";
import { type AssignResult, type Flow, type FlowItem, type Persona, type Student, type TaskTemplate } from "@/lib/api/schemas";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { Bounds, durationLabel } from "@/lib/validation";

import { PersonaAvatar } from "../app/persona-avatar";
import { ListSkeleton } from "../app/state";
import { TypeBadge } from "../app/task-badges";
import { useFlows, useTemplates } from "./catalog-queries";
import { useStudents } from "./students";
import { normalizeLineSafe } from "./util";

/** Pick library tasks to add to a day. */
export function LibraryPicker({
  open,
  day,
  room,
  personas,
  onClose,
  onAdd,
}: {
  open: boolean;
  day: number;
  /** How many more tasks fit on this day. */
  room: number;
  personas: ReadonlyMap<string, Persona>;
  onClose: () => void;
  onAdd: (picked: TaskTemplate[]) => void;
}) {
  const [raw, setRaw] = useState("");
  const q = useDeferredValue(normalizeLineSafe(raw));
  const templates = useTemplates({ q });
  const [picked, setPicked] = useState<Map<string, TaskTemplate>>(new Map());
  const items = templates.data?.pages.flatMap((p) => p.items) ?? [];
  const toggle = (t: TaskTemplate) =>
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(t.id)) next.delete(t.id);
      else if (next.size < room) next.set(t.id, t);
      else toast.error(`Day ${day} has room for ${room} more ${room === 1 ? "task" : "tasks"}.`);
      return next;
    });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[88dvh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add from library to day {day}</DialogTitle>
          <DialogDescription>Each pick is copied into this flow with its default time. You can tweak the copy without touching the library.</DialogDescription>
        </DialogHeader>
        <InputGroup>
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput value={raw} maxLength={Bounds.searchMax} onChange={(e) => setRaw(e.target.value)} placeholder="Search the library" aria-label="Search the library" type="search" autoFocus />
        </InputGroup>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
          {templates.isPending ? (
            <div className="p-2">
              <ListSkeleton rows={4} className="h-12" />
            </div>
          ) : templates.isError ? (
            <p className="text-destructive p-4 text-sm">{messageFor(templates.error)}</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">{q ? "Nothing matches." : "The library is empty. Add tasks in Task library first."}</p>
          ) : (
            <ul aria-label="Library tasks">
              {items.map((t) => {
                const p = personas.get(t.persona_id);
                const id = `lib-${t.id}`;
                return (
                  <li key={t.id} className="flex items-start gap-3 border-b px-3 py-2.5 last:border-b-0">
                    <Checkbox id={id} className="mt-1" checked={picked.has(t.id)} onCheckedChange={() => toggle(t)} />
                    <label htmlFor={id} className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-sm font-medium">{t.title}</span>
                      <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                        <TypeBadge type={t.type} />
                        {p ? (
                          <span className="inline-flex items-center gap-1">
                            <PersonaAvatar persona={p} size="sm" className="size-4" /> {p.name}
                          </span>
                        ) : null}
                        <span>
                          {t.release_time} · {durationLabel(t.due_minutes)}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {templates.hasNextPage ? (
            <Button variant="ghost" className="w-full" disabled={templates.isFetchingNextPage} onClick={() => void templates.fetchNextPage()}>
              {templates.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null} Load more
            </Button>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={picked.size === 0}
            onClick={() => {
              onAdd([...picked.values()]);
              setPicked(new Map());
            }}
            data-testid="library-add"
          >
            Add {picked.size || ""} to day {day}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Copy tasks from another flow into this draft, keeping their days. */
export function ImportPicker({
  open,
  flow,
  personas,
  onClose,
  onImport,
}: {
  open: boolean;
  flow: Flow;
  personas: ReadonlyMap<string, Persona>;
  onClose: () => void;
  onImport: (items: FlowItem[]) => void;
}) {
  const { api } = useSession();
  const flows = useFlows(false);
  const others = (flows.data ?? []).filter((f) => f.id !== flow.id && f.task_count > 0);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const source = useQuery({ queryKey: ["flow", sourceId], queryFn: () => api.flow(sourceId ?? ""), enabled: sourceId !== null });
  const version = source.data ? (source.data.draft ?? source.data.published) : null;
  const items = [...(version?.items ?? [])].sort((a, b) => a.day - b.day || a.position - b.position);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const fits = (it: FlowItem) => it.day <= flow.days;
  const allIds = items.filter(fits).map((i) => i.id);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[88dvh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import from another flow</DialogTitle>
          <DialogDescription>Copies keep their day, time and persona. The other flow is unchanged.</DialogDescription>
        </DialogHeader>
        <Select
          value={sourceId ?? ""}
          onValueChange={(v) => {
            setSourceId(v);
            setPicked(new Set());
          }}
        >
          <SelectTrigger className="w-full" aria-label="Flow to import from">
            <SelectValue placeholder={flows.isPending ? "Loading flows…" : others.length ? "Pick a flow" : "No other flows with tasks"} />
          </SelectTrigger>
          <SelectContent>
            {others.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name} <span className="text-muted-foreground">· {f.task_count} tasks</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
          {sourceId === null ? (
            <p className="text-muted-foreground p-6 text-center text-sm">Pick a flow to see its tasks.</p>
          ) : source.isPending ? (
            <div className="p-2">
              <ListSkeleton rows={4} className="h-10" />
            </div>
          ) : source.isError ? (
            <p className="text-destructive p-4 text-sm">{messageFor(source.error)}</p>
          ) : (
            <>
              <div className="bg-muted/50 flex items-center gap-3 border-b px-3 py-2 text-sm">
                <Checkbox
                  id="imp-all"
                  checked={allIds.length > 0 && allIds.every((i) => picked.has(i)) ? true : picked.size > 0 ? "indeterminate" : false}
                  onCheckedChange={(c) => setPicked(c === true ? new Set(allIds) : new Set())}
                />
                <label htmlFor="imp-all" className="font-medium">
                  All {allIds.length} tasks
                </label>
              </div>
              <ul aria-label="Tasks to import">
                {items.map((it) => {
                  const ok = fits(it);
                  const p = personas.get(it.persona_id);
                  const id = `imp-${it.id}`;
                  return (
                    <li key={it.id} className={cn("flex items-center gap-3 border-b px-3 py-2 last:border-b-0", !ok && "opacity-50")}>
                      <Checkbox
                        id={id}
                        disabled={!ok}
                        checked={picked.has(it.id)}
                        onCheckedChange={(c) =>
                          setPicked((prev) => {
                            const next = new Set(prev);
                            if (c === true) next.add(it.id);
                            else next.delete(it.id);
                            return next;
                          })
                        }
                      />
                      <label htmlFor={id} className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                        <Badge variant="outline" className="shrink-0 tabular-nums">
                          Day {it.day}
                        </Badge>
                        <span className="min-w-0 flex-1 truncate">{it.title}</span>
                        {p ? <PersonaAvatar persona={p} size="sm" /> : null}
                      </label>
                      {!ok ? <span className="text-muted-foreground text-xs">past day {flow.days}</span> : null}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={picked.size === 0} onClick={() => onImport(items.filter((i) => picked.has(i.id)))} data-testid="import-add">
            Import {picked.size || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Assign the published flow to many students and show what happened to each. */
export function AssignStudentsDialog({ open, flow, onClose }: { open: boolean; flow: Flow; onClose: () => void }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const [raw, setRaw] = useState("");
  const query = useDeferredValue(normalizeLineSafe(raw));
  const students = useStudents(query);
  const rows = students.data?.pages.flatMap((p) => p.items) ?? [];
  const [picked, setPicked] = useState<Map<string, Student>>(new Map());
  const [results, setResults] = useState<AssignResult[] | null>(null);
  const assign = useMutation({
    mutationFn: () => api.assignFlowToMany(flow.id, [...picked.keys()]),
    onSuccess: (r) => {
      setResults(r);
      const ok = r.filter((x) => !x.error).length;
      if (ok) toast.success(`Assigned to ${ok} ${ok === 1 ? "student" : "students"}`);
      void qc.invalidateQueries({ queryKey: ["flows"] });
      void qc.invalidateQueries({ queryKey: ["students"] });
      void qc.invalidateQueries({ queryKey: ["enrollment-tasks"] });
    },
    onError: (e) => toast.error(messageFor(e)),
  });
  const close = () => {
    setPicked(new Map());
    setResults(null);
    onClose();
  };
  const nameOf = (id: string) => picked.get(id)?.user.name ?? "Student";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="flex max-h-[88dvh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assign “{flow.name}”</DialogTitle>
          <DialogDescription>
            Generates every task of the published version for each student, from today on. Days already over are skipped. A student on another flow
            switches, and its tasks that haven&apos;t shown up yet are cancelled.
          </DialogDescription>
        </DialogHeader>
        {results ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.enrollment_id}>
                    <TableCell className="font-medium">{nameOf(r.enrollment_id)}</TableCell>
                    <TableCell className="text-sm">
                      {r.error ? (
                        <span className="text-destructive flex items-center gap-1.5">
                          <TriangleAlert className="size-4" aria-hidden /> {itemErrorMessage(r.error)}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <CircleCheck className="text-success size-4" aria-hidden />
                          {r.generated} scheduled{r.skipped ? ` · ${r.skipped} past days skipped` : ""}
                          {r.cancelled ? ` · ${r.cancelled} from the old flow cancelled` : ""}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <>
            <InputGroup>
              <InputGroupAddon>
                <Search aria-hidden />
              </InputGroupAddon>
              <InputGroupInput value={raw} maxLength={Bounds.searchMax} onChange={(e) => setRaw(e.target.value)} placeholder="Search students" aria-label="Search students" type="search" />
            </InputGroup>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
              {students.isPending ? (
                <div className="p-2">
                  <ListSkeleton rows={4} className="h-10" />
                </div>
              ) : rows.length === 0 ? (
                <p className="text-muted-foreground p-6 text-center text-sm">No students match.</p>
              ) : (
                <ul aria-label="Students">
                  {rows.map((s) => {
                    const fitsProgram = s.enrollment.program.days === flow.days;
                    const active = s.enrollment.status === "active";
                    const ok = fitsProgram && active;
                    const id = `as-${s.enrollment.id}`;
                    return (
                      <li key={s.enrollment.id} className={cn("flex items-center gap-3 border-b px-3 py-2 last:border-b-0", !ok && "opacity-55")}>
                        <Checkbox
                          id={id}
                          disabled={!ok}
                          checked={picked.has(s.enrollment.id)}
                          onCheckedChange={() =>
                            setPicked((prev) => {
                              const next = new Map(prev);
                              if (next.has(s.enrollment.id)) next.delete(s.enrollment.id);
                              else if (next.size < Bounds.bulkAssignMax) next.set(s.enrollment.id, s);
                              return next;
                            })
                          }
                        />
                        <label htmlFor={id} className="flex min-w-0 flex-1 flex-col text-sm">
                          <span className="truncate font-medium">{s.user.name}</span>
                          <span className="text-muted-foreground truncate text-xs">
                            @{s.user.github_login} · {s.enrollment.program.days} days · day {s.enrollment.day_number}
                            {!active ? ` · ${s.enrollment.status}` : !fitsProgram ? ` · needs a ${s.enrollment.program.days}-day flow` : ""}
                          </span>
                        </label>
                        {s.enrollment.flow ? (
                          <Badge variant={s.enrollment.flow.flow_id === flow.id ? "secondary" : "outline"} className="max-w-44 truncate">
                            {s.enrollment.flow.flow_id === flow.id ? `On v${s.enrollment.flow.version}` : `On ${s.enrollment.flow.name}`}
                          </Badge>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              {students.hasNextPage ? (
                <Button variant="ghost" className="w-full" disabled={students.isFetchingNextPage} onClick={() => void students.fetchNextPage()}>
                  {students.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null} Load more
                </Button>
              ) : null}
            </div>
          </>
        )}
        <DialogFooter>
          {results ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button disabled={picked.size === 0 || assign.isPending} onClick={() => assign.mutate()} data-testid="assign-flow-submit">
                {assign.isPending ? <Spinner data-icon="inline-start" /> : null}
                Assign to {picked.size || ""} {picked.size === 1 ? "student" : "students"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
