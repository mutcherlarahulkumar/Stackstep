"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookCopy, CircleAlert, Plus, Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { messageFor } from "@/lib/api/errors";
import { TASK_TYPES, type Persona, type TaskSpec, type TaskTemplate, type TaskType } from "@/lib/api/schemas";
import { TYPE_LABEL } from "@/lib/board";
import { DEFAULT_PERSONA_ID } from "@/lib/inbox";
import { usePersonas } from "@/lib/inbox-queries";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { Bounds, durationLabel } from "@/lib/validation";

import { PersonaAvatar } from "../app/persona-avatar";
import { EmptyState, ErrorState, ListSkeleton } from "../app/state";
import { TypeBadge } from "../app/task-badges";
import { AdminShell } from "./admin-shell";
import { personaMap, useAllPersonas, useTemplates } from "./catalog-queries";
import { splitError } from "./form-errors";
import { normalizeLineSafe } from "./util";
import { cleanSpec, emptySpec, SpecFields, validateSpec, type SpecErrors } from "./task-spec-form";

export function LibraryScreen() {
  return (
    <AdminShell section="library" phone="gate">
      {(me) => <Library canEdit={me.user.role === "admin"} />}
    </AdminShell>
  );
}

const ANY = "any";

function Library({ canEdit }: { canEdit: boolean }) {
  const [raw, setRaw] = useState("");
  const q = useDeferredValue(normalizeLineSafe(raw));
  const [type, setType] = useState<TaskType | null>(null);
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<TaskTemplate | "new" | null>(null);
  const templates = useTemplates({ q, type, personaId, includeArchived: archived });
  const all = useAllPersonas();
  const byId = personaMap(all.data);
  const items = templates.data?.pages.flatMap((p) => p.items) ?? [];
  const filtered = q !== "" || type !== null || personaId !== null;

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-y-auto p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Task library</h1>
          <p className="text-muted-foreground text-sm">Reusable tasks. Add them to any flow; flows keep their own copy, so editing here never changes a published flow.</p>
        </div>
        {canEdit ? (
          <Button onClick={() => setEditing("new")} data-testid="new-template">
            <Plus data-icon="inline-start" aria-hidden /> New task
          </Button>
        ) : null}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <InputGroup className="w-72">
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput value={raw} maxLength={Bounds.searchMax} onChange={(e) => setRaw(e.target.value)} placeholder="Search titles" aria-label="Search tasks" type="search" />
        </InputGroup>
        <Select value={type ?? ANY} onValueChange={(v) => setType(TASK_TYPES.find((t) => t === v) ?? null)}>
          <SelectTrigger className="w-44" aria-label="Filter by type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All types</SelectItem>
            {TASK_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {TYPE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={personaId ?? ANY} onValueChange={(v) => setPersonaId(v === ANY ? null : v)}>
          <SelectTrigger className="w-52" aria-label="Filter by persona">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Everyone</SelectItem>
            {(all.data ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <PersonaAvatar persona={p} size="sm" /> {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Switch id="lib-archived" checked={archived} onCheckedChange={setArchived} />
          <Label htmlFor="lib-archived" className="text-sm">
            Show archived
          </Label>
        </div>
      </div>
      {templates.isPending ? (
        <ListSkeleton rows={6} className="h-12" />
      ) : templates.isError ? (
        <ErrorState message={messageFor(templates.error)} onRetry={() => void templates.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={BookCopy}
          title={filtered ? "Nothing matches" : "The library is empty"}
          action={!filtered && canEdit ? <Button onClick={() => setEditing("new")}>Add the first task</Button> : undefined}
        >
          {filtered ? "Try another search or clear the filters." : "Add tasks once, then reuse them across React, Angular, Go and every other flow."}
        </EmptyState>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Posted by</TableHead>
                <TableHead>Review</TableHead>
                <TableHead>Timing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((t) => {
                const p = byId.get(t.persona_id);
                return (
                  <TableRow
                    key={t.id}
                    className={cn(canEdit && "cursor-pointer", t.archived && "opacity-60")}
                    onClick={canEdit ? () => setEditing(t) : undefined}
                    data-testid={`template-row-${t.title}`}
                  >
                    <TableCell className="max-w-96">
                      <div className="flex flex-col gap-1">
                        {canEdit ? (
                          <button type="button" className="truncate text-left font-medium hover:underline" onClick={() => setEditing(t)}>
                            {t.title}
                          </button>
                        ) : (
                          <span className="truncate font-medium">{t.title}</span>
                        )}
                        <span className="flex items-center gap-1.5">
                          <TypeBadge type={t.type} />
                          {t.archived ? <Badge variant="secondary">Archived</Badge> : null}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {p ? (
                        <span className="flex items-center gap-2 text-sm">
                          <PersonaAvatar persona={p} size="sm" /> {p.name}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{t.review_mode === "self" ? "Student marks done" : "Admin reviews"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {t.release_time} · {durationLabel(t.due_minutes)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {templates.hasNextPage ? (
            <Button variant="ghost" className="mt-2" disabled={templates.isFetchingNextPage} onClick={() => void templates.fetchNextPage()}>
              {templates.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null} Load more
            </Button>
          ) : null}
        </>
      )}
      <TemplateDialog key={editing === null ? "closed" : editing === "new" ? "new" : editing.id} editing={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

const specOf = (t: TaskTemplate): TaskSpec => ({
  type: t.type,
  title: t.title,
  brief: t.brief,
  persona_id: t.persona_id,
  review_mode: t.review_mode,
  release_time: t.release_time,
  due_minutes: t.due_minutes,
});

/** Create or edit a library task. Also used from the flow builder ("Save to library"). */
export function TemplateDialog({ editing, onClose, onSaved }: { editing: TaskTemplate | "new" | null; onClose: () => void; onSaved?: (t: TaskTemplate) => void }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const personas = usePersonas();
  const active: Persona[] = personas.data ?? [];
  const current = editing && editing !== "new" ? editing : null;
  const fallback = active.some((p) => p.id === DEFAULT_PERSONA_ID) ? DEFAULT_PERSONA_ID : (active[0]?.id ?? DEFAULT_PERSONA_ID);
  const [spec, setSpec] = useState<TaskSpec>(current ? specOf(current) : emptySpec(fallback));
  const [archived, setArchived] = useState(current?.archived ?? false);
  const [errors, setErrors] = useState<SpecErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (s: TaskSpec) => (current ? api.updateTemplate(current.id, { ...s, archived }, current.version) : api.createTemplate(s)),
    onSuccess: (t) => {
      toast.success(current ? "Saved" : `Added “${t.title}” to the library`);
      void qc.invalidateQueries({ queryKey: ["templates"] });
      onSaved?.(t);
      onClose();
    },
    onError: (e) => {
      const { fields, form } = splitError(e);
      setErrors(fields as SpecErrors);
      setFormError(form);
    },
  });

  return (
    <Dialog open={editing !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{current ? "Edit library task" : "New library task"}</DialogTitle>
          <DialogDescription>Flows that already use this task keep their own copy.</DialogDescription>
        </DialogHeader>
        <form
          id="template-form"
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            const next = validateSpec(spec, (id) => active.some((p) => p.id === id));
            setErrors(next);
            setFormError(null);
            if (Object.keys(next).length === 0) save.mutate(cleanSpec(spec));
          }}
        >
          {formError ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden />
              <AlertTitle>Couldn&apos;t save</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
          <SpecFields value={spec} onChange={setSpec} errors={errors} personas={active} idPrefix="tpl" />
          {current ? (
            <Field orientation="horizontal">
              <Switch id="tpl-archived" checked={archived} onCheckedChange={setArchived} />
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="tpl-archived">Archived</Label>
                <FieldDescription>Hidden when building flows. Flows that use it are unaffected.</FieldDescription>
              </div>
            </Field>
          ) : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="template-form" disabled={save.isPending} data-testid="template-save">
            {save.isPending ? <Spinner data-icon="inline-start" /> : null} {current ? "Save" : "Add to library"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
