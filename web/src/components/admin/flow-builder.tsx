"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookCopy,
  CircleAlert,
  Copy,
  FileInput,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Rocket,
  Route,
  Save,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, messageFor } from "@/lib/api/errors";
import { type FlowDetail, type Persona, type TaskSpec } from "@/lib/api/schemas";
import { addBlocked, countByDay, errorsByRow, newKey, ordered, rowFromTemplate, rowsFromItems, sameRows, shift, toInput, type DraftRow } from "@/lib/flow-draft";
import { DEFAULT_PERSONA_ID } from "@/lib/inbox";
import { usePersonas } from "@/lib/inbox-queries";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { durationLabel } from "@/lib/validation";

import { PersonaAvatar } from "../app/persona-avatar";
import { EmptyState, ErrorState, ListSkeleton } from "../app/state";
import { TYPE_ICON, TypeBadge } from "../app/task-badges";
import { AdminShell } from "./admin-shell";
import { personaMap, useAllPersonas } from "./catalog-queries";
import { DuplicateFlowDialog, FlowDetailsDialog } from "./flow-dialogs";
import { AssignStudentsDialog, ImportPicker, LibraryPicker } from "./flow-pickers";
import { FlowStatus } from "./flows";
import { cleanSpec, emptySpec, SpecFields, validateSpec, type SpecErrors } from "./task-spec-form";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function FlowBuilderScreen({ id }: { id: string }) {
  return (
    <AdminShell section="flows" phone="gate">
      {(me) => <FlowLoader id={id} canEdit={me.user.role === "admin"} />}
    </AdminShell>
  );
}

function FlowLoader({ id, canEdit }: { id: string; canEdit: boolean }) {
  const { api } = useSession();
  const [day, setDay] = useState(1);
  // Never refetch behind the editor's back: a background refresh would discard unsaved edits.
  const q = useQuery({ queryKey: ["flow", id], queryFn: () => api.flow(id), enabled: UUID.test(id), staleTime: Infinity, refetchOnWindowFocus: false });
  if (!UUID.test(id) || (q.error instanceof ApiError && q.error.code === "not_found")) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={Route}
          title="Flow not found"
          action={
            <Button asChild variant="outline">
              <Link href="/admin/flows">All flows</Link>
            </Button>
          }
        >
          It may have been removed, or the link is wrong.
        </EmptyState>
      </div>
    );
  }
  if (q.isPending) {
    return (
      <div className="p-6">
        <ListSkeleton rows={6} className="h-14" />
      </div>
    );
  }
  if (q.isError) return <ErrorState message={messageFor(q.error)} onRetry={() => void q.refetch()} />;
  const d = q.data;
  return (
    <Builder
      // A save or publish returns a new revision; remounting starts the editor from it.
      key={`${d.draft?.id ?? "none"}:${d.draft?.revision ?? 0}:${d.published?.number ?? 0}:${d.flow.version}`}
      detail={d}
      canEdit={canEdit}
      day={Math.min(day, d.flow.days)}
      onDay={setDay}
    />
  );
}

function Builder({ detail, canEdit, day, onDay }: { detail: FlowDetail; canEdit: boolean; day: number; onDay: (d: number) => void }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const router = useRouter();
  const { flow, draft, published } = detail;
  const [base] = useState(() => rowsFromItems((draft ?? published)?.items ?? []));
  const [rows, setRows] = useState<DraftRow[]>(base);
  const [rowErrors, setRowErrors] = useState<Map<string, Record<string, string>>>(new Map());
  const [editing, setEditing] = useState<DraftRow | "new" | null>(null);
  const [dialog, setDialog] = useState<"library" | "import" | "assign" | "details" | "duplicate" | "publish" | null>(null);
  const [saving, setSaving] = useState(false);
  const all = useAllPersonas();
  const active = usePersonas();
  const byId = personaMap(all.data);
  const activeList = active.data ?? [];
  const dirty = !sameRows(rows, base);
  const counts = countByDay(rows);
  const dayRows = ordered(rows).filter((r) => r.day === day);
  const blocked = addBlocked(rows, day);
  const readOnly = !canEdit || flow.archived;
  const hasErrors = rowErrors.size > 0;

  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async (): Promise<FlowDetail | null> => {
    setSaving(true);
    try {
      const next = await api.saveDraft(flow.id, draft?.revision ?? 0, toInput(rows));
      setRowErrors(new Map());
      qc.setQueryData(["flow", flow.id], next);
      void qc.invalidateQueries({ queryKey: ["flows"] });
      return next;
    } catch (e) {
      if (e instanceof ApiError && e.code === "validation_failed") {
        const byRow = errorsByRow(rows, e.fields);
        setRowErrors(byRow);
        const first = ordered(rows).find((r) => byRow.has(r.key));
        if (first) onDay(first.day);
        toast.error(e.fields.items ?? "Some tasks need fixing. They're marked in red.");
      } else if (e instanceof ApiError && e.code === "version_conflict") {
        toast.error("Someone else saved this flow meanwhile.", {
          description: "Reload to get their version. Your unsaved edits will be lost.",
          action: { label: "Reload", onClick: () => void qc.refetchQueries({ queryKey: ["flow", flow.id] }) },
          duration: 15_000,
        });
      } else toast.error(messageFor(e));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const publish = useMutation({
    mutationFn: async () => {
      const saved = dirty ? await save() : detail;
      if (!saved?.draft) throw new Error("not saved");
      return api.publishFlow(flow.id, saved.draft.revision);
    },
    onSuccess: (next) => {
      qc.setQueryData(["flow", flow.id], next);
      void qc.invalidateQueries({ queryKey: ["flows"] });
      toast.success(`Published v${next.published?.number ?? ""}`, { description: "New assignments get this version. Students already on the flow keep theirs." });
    },
    onError: (e) => {
      if (e instanceof Error && e.message === "not saved") return; // save() already explained why
      toast.error(messageFor(e));
    },
  });

  const update = (fn: (rs: DraftRow[]) => DraftRow[]) => {
    setRows((rs) => fn(rs));
  };
  const clearRowError = (key: string) =>
    setRowErrors((m) => {
      if (!m.has(key)) return m;
      const next = new Map(m);
      next.delete(key);
      return next;
    });

  const fallbackPersona = activeList.some((p) => p.id === DEFAULT_PERSONA_ID) ? DEFAULT_PERSONA_ID : (activeList[0]?.id ?? DEFAULT_PERSONA_ID);
  const canPublish = !readOnly && rows.length > 0 && (dirty || draft !== null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b px-6 py-3">
        <Button asChild variant="ghost" size="icon" aria-label="All flows">
          <Link href="/admin/flows">
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-semibold">{flow.name}</h1>
            <FlowStatus flow={{ published_version: published?.number ?? null, has_draft: draft !== null || dirty, archived: flow.archived }} />
          </div>
          <p className="text-muted-foreground text-sm">
            {flow.stream} · {flow.days} days · {rows.length} {rows.length === 1 ? "task" : "tasks"}
            {dirty ? <span className="text-warning font-medium"> · Unsaved changes</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={published === null} onClick={() => setDialog("assign")} data-testid="open-assign-flow">
            <Users data-icon="inline-start" aria-hidden /> Assign students
          </Button>
          {!readOnly ? (
            <>
              <Button variant="outline" disabled={!dirty || saving} onClick={() => void save().then((d) => d && toast.success("Draft saved"))} data-testid="save-draft">
                {saving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden />} Save draft
              </Button>
              <Button disabled={!canPublish || publish.isPending} onClick={() => setDialog("publish")} data-testid="publish-flow">
                {publish.isPending ? <Spinner data-icon="inline-start" /> : <Rocket data-icon="inline-start" aria-hidden />} Publish
              </Button>
            </>
          ) : null}
          {canEdit ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More flow actions">
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setDialog("details")}>
                  <Pencil aria-hidden /> Edit details
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDialog("duplicate")}>
                  <Copy aria-hidden /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() =>
                    void api
                      .updateFlow(flow.id, { name: flow.name, stream: flow.stream, description: flow.description, days: flow.days, archived: !flow.archived }, flow.version)
                      .then(() => {
                        toast.success(flow.archived ? "Flow restored" : "Flow archived");
                        void qc.invalidateQueries({ queryKey: ["flows"] });
                        void qc.refetchQueries({ queryKey: ["flow", flow.id] });
                      })
                      .catch((e: unknown) => toast.error(messageFor(e)))
                  }
                >
                  {flow.archived ? "Restore flow" : "Archive flow"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      {readOnly ? (
        <div className="px-6 pt-4">
          <Alert>
            <Lock aria-hidden />
            <AlertTitle>{flow.archived ? "This flow is archived" : "View only"}</AlertTitle>
            <AlertDescription>
              {flow.archived ? "Restore it from the menu to edit or assign it." : "Only platform admins edit flows. You can assign the published version to your students."}
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Days" className="w-56 shrink-0 overflow-y-auto border-r p-2">
          {Array.from({ length: flow.days }, (_, i) => i + 1).map((d) => {
            const n = counts.get(d) ?? 0;
            const types = ordered(rows).filter((r) => r.day === d);
            const bad = types.some((r) => rowErrors.has(r.key));
            return (
              <div key={d}>
                {d % 7 === 1 ? <p className="text-muted-foreground px-2 pt-3 pb-1 text-[11px] font-semibold tracking-wide uppercase">Week {Math.ceil(d / 7)}</p> : null}
                <button
                  type="button"
                  onClick={() => onDay(d)}
                  aria-current={d === day ? "true" : undefined}
                  data-testid={`day-${d}`}
                  className={cn(
                    "hover:bg-muted/70 focus-visible:ring-ring flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-2",
                    d === day && "bg-muted font-medium",
                    bad && "text-destructive",
                  )}
                >
                  <span className="w-12 shrink-0 tabular-nums">Day {d}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden" aria-hidden>
                    {types.slice(0, 5).map((r) => {
                      const Icon = TYPE_ICON[r.type];
                      return <Icon key={r.key} className="text-muted-foreground size-3.5 shrink-0" />;
                    })}
                  </span>
                  {bad ? <CircleAlert className="size-3.5" aria-label="Has errors" /> : n > 0 ? <span className="text-muted-foreground text-xs tabular-nums">{n}</span> : null}
                </button>
              </div>
            );
          })}
        </nav>

        <section aria-label={`Day ${day}`} className="min-w-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-3xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Day {day}</h2>
                <p className="text-muted-foreground text-sm">
                  {dayRows.length === 0 ? "Nothing scheduled." : `${dayRows.length} of 10 tasks.`} Times are in each student&apos;s time zone.
                </p>
              </div>
              {!readOnly ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" disabled={!!blocked} title={blocked ?? undefined} onClick={() => setDialog("library")} data-testid="add-from-library">
                    <BookCopy data-icon="inline-start" aria-hidden /> From library
                  </Button>
                  <Button variant="outline" size="sm" disabled={!!blocked} title={blocked ?? undefined} onClick={() => setEditing("new")} data-testid="add-new-task">
                    <Plus data-icon="inline-start" aria-hidden /> New task
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDialog("import")} data-testid="import-from-flow">
                    <FileInput data-icon="inline-start" aria-hidden /> Import from flow
                  </Button>
                </div>
              ) : null}
            </div>
            {hasErrors ? (
              <Alert variant="destructive" className="mb-4">
                <CircleAlert aria-hidden />
                <AlertTitle>Some tasks need fixing</AlertTitle>
                <AlertDescription>Days with problems are marked in red. Open a task to see what to change.</AlertDescription>
              </Alert>
            ) : null}
            {dayRows.length === 0 ? (
              <EmptyState icon={Route} title={`Nothing on day ${day}`}>
                {readOnly ? "No tasks are scheduled for this day." : "Add tasks from the library, write a new one, or import a day's tasks from another flow."}
              </EmptyState>
            ) : (
              <ol className="flex flex-col gap-2">
                {dayRows.map((r, i) => (
                  <li key={r.key}>
                    <ItemCard
                      row={r}
                      persona={byId.get(r.persona_id)}
                      error={rowErrors.has(r.key)}
                      readOnly={readOnly}
                      first={i === 0}
                      last={i === dayRows.length - 1}
                      onOpen={() => setEditing(r)}
                      onMove={(dir) => update((rs) => shift(rs, r.key, dir))}
                      onRemove={() => {
                        update((rs) => rs.filter((x) => x.key !== r.key));
                        clearRowError(r.key);
                      }}
                    />
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>

      <ItemSheet
        key={editing === null ? "closed" : editing === "new" ? `new-${day}` : editing.key}
        editing={editing}
        day={day}
        days={flow.days}
        readOnly={readOnly}
        rows={rows}
        personas={activeList}
        serverErrors={editing && editing !== "new" ? (rowErrors.get(editing.key) ?? {}) : {}}
        fallbackPersona={fallbackPersona}
        onClose={() => setEditing(null)}
        onSave={(row) => {
          update((rs) => (rs.some((x) => x.key === row.key) ? rs.map((x) => (x.key === row.key ? row : x)) : [...rs, row]));
          clearRowError(row.key);
          onDay(row.day);
          setEditing(null);
        }}
      />
      <LibraryPicker
        key={dialog === "library" ? `lib-${day}` : "lib-closed"}
        open={dialog === "library"}
        day={day}
        room={Math.max(0, 10 - (counts.get(day) ?? 0))}
        personas={byId}
        onClose={() => setDialog(null)}
        onAdd={(picked) => {
          const blockedAll = addBlocked(rows, day, picked.length);
          if (blockedAll) {
            toast.error(blockedAll);
            return;
          }
          update((rs) => [...rs, ...picked.map((t) => rowFromTemplate(t, day))]);
          setDialog(null);
          toast.success(`Added ${picked.length} to day ${day}`);
        }}
      />
      <ImportPicker
        key={dialog === "import" ? "imp-open" : "imp-closed"}
        open={dialog === "import"}
        flow={flow}
        personas={byId}
        onClose={() => setDialog(null)}
        onImport={(items) => {
          const imported = rowsFromItems(items);
          const merged = [...rows, ...imported];
          const full = [...countByDay(merged).entries()].find(([, n]) => n > 10);
          if (merged.length > 600 || full) {
            toast.error(full ? `Day ${full[0]} would have ${full[1]} tasks; the limit is 10.` : "A flow can hold at most 600 tasks.");
            return;
          }
          setRows(merged);
          setDialog(null);
          toast.success(`Imported ${items.length} ${items.length === 1 ? "task" : "tasks"}`, { description: "Save the draft to keep them." });
        }}
      />
      <AssignStudentsDialog open={dialog === "assign"} flow={flow} onClose={() => setDialog(null)} />
      <FlowDetailsDialog
        key={dialog === "details" ? "details-open" : "details-closed"}
        open={dialog === "details"}
        flow={flow}
        onClose={() => setDialog(null)}
        onSaved={() => {
          setDialog(null);
          toast.success("Details saved");
        }}
      />
      <DuplicateFlowDialog
        key={dialog === "duplicate" ? "dup-open" : "dup-closed"}
        source={dialog === "duplicate" ? flow : null}
        onClose={() => setDialog(null)}
        onDone={(d) => {
          setDialog(null);
          toast.success(`Created “${d.flow.name}”`);
          router.push(`/admin/flows/${d.flow.id}`);
        }}
      />
      <AlertDialog open={dialog === "publish"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish {published ? `v${published.number + 1}` : "this flow"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {dirty ? "Your changes are saved first. " : ""}New assignments get this version. Students already on {published ? `v${published.number}` : "the flow"} keep
              their schedule.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDialog(null);
                publish.mutate();
              }}
              data-testid="publish-confirm"
            >
              Publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ItemCard({
  row,
  persona,
  error,
  readOnly,
  first,
  last,
  onOpen,
  onMove,
  onRemove,
}: {
  row: DraftRow;
  persona: Persona | undefined;
  error: boolean;
  readOnly: boolean;
  first: boolean;
  last: boolean;
  onOpen: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <Card size="sm" className={cn("transition-shadow", error && "ring-destructive ring-2")} data-testid={`item-${row.title}`}>
      <CardContent className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <button type="button" onClick={onOpen} className="truncate text-left font-medium hover:underline">
            {row.title || "Untitled task"}
          </button>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <TypeBadge type={row.type} />
            {persona ? (
              <span className="inline-flex items-center gap-1.5">
                <PersonaAvatar persona={persona} size="sm" className="size-4" /> {persona.name}
              </span>
            ) : null}
            <span className="tabular-nums">
              {row.release_time} · {durationLabel(row.due_minutes)} to finish
            </span>
            <span>{row.review_mode === "self" ? "Student marks done" : "Admin reviews"}</span>
            {error ? <span className="text-destructive font-medium">Needs fixing</span> : null}
          </div>
        </div>
        {!readOnly ? (
          <div className="flex shrink-0 items-center">
            <Button variant="ghost" size="icon-sm" disabled={first} onClick={() => onMove(-1)} aria-label={`Move “${row.title}” up`}>
              <ArrowUp aria-hidden />
            </Button>
            <Button variant="ghost" size="icon-sm" disabled={last} onClick={() => onMove(1)} aria-label={`Move “${row.title}” down`}>
              <ArrowDown aria-hidden />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove “${row.title}”`}>
              <Trash2 aria-hidden />
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ItemSheet({
  editing,
  day,
  days,
  readOnly,
  rows,
  personas,
  serverErrors,
  fallbackPersona,
  onClose,
  onSave,
}: {
  editing: DraftRow | "new" | null;
  day: number;
  days: number;
  readOnly: boolean;
  rows: readonly DraftRow[];
  personas: readonly Persona[];
  serverErrors: Record<string, string>;
  fallbackPersona: string;
  onClose: () => void;
  onSave: (row: DraftRow) => void;
}) {
  const { api } = useSession();
  const qc = useQueryClient();
  const current = editing && editing !== "new" ? editing : null;
  const [spec, setSpec] = useState<TaskSpec>(current ?? emptySpec(fallbackPersona));
  const [rowDay, setRowDay] = useState(current?.day ?? day);
  const [errors, setErrors] = useState<SpecErrors & { day?: string }>(serverErrors);
  const [templateId, setTemplateId] = useState<string | null>(current?.template_id ?? null);
  const toLibrary = useMutation({
    mutationFn: () => api.createTemplate(cleanSpec(spec)),
    onSuccess: (t) => {
      setTemplateId(t.id);
      void qc.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Saved to the library", { description: "Other flows can reuse it now." });
    },
    onError: (e) => toast.error(messageFor(e)),
  });

  const submit = () => {
    const next: SpecErrors & { day?: string } = validateSpec(spec, (id) => personas.some((p) => p.id === id));
    const others = rows.filter((r) => r.key !== current?.key);
    const dayFull = addBlocked(others, rowDay);
    if (dayFull) next.day = dayFull;
    setErrors(next);
    if (Object.keys(next).length) return;
    onSave({ ...cleanSpec(spec), key: current?.key ?? newKey(), day: rowDay, template_id: templateId });
  };

  return (
    <Sheet open={editing !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{readOnly ? "Task" : current ? "Edit task" : `New task on day ${day}`}</SheetTitle>
          <SheetDescription>
            {templateId ? "A copy of a library task. Changes here stay in this flow." : "Only in this flow. Save it to the library to reuse it elsewhere."}
          </SheetDescription>
        </SheetHeader>
        <form
          id="item-form"
          noValidate
          className="flex flex-col gap-5 px-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!readOnly) submit();
          }}
        >
          <fieldset disabled={readOnly} className="flex flex-col gap-5">
            <Field data-invalid={!!errors.day}>
              <FieldLabel htmlFor="item-day">Day</FieldLabel>
              <Select value={String(rowDay)} onValueChange={(v) => setRowDay(Number(v))}>
                <SelectTrigger id="item-day" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      Day {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.day ? <FieldError>{errors.day}</FieldError> : null}
            </Field>
            <SpecFields value={spec} onChange={setSpec} errors={errors} personas={personas} idPrefix="item" />
          </fieldset>
        </form>
        {!readOnly ? (
          <SheetFooter className="flex-row flex-wrap gap-2">
            <Button type="submit" form="item-form" data-testid="item-save">
              {current ? "Apply" : "Add to day"}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {!templateId ? (
              <Button
                variant="ghost"
                className="ml-auto"
                disabled={toLibrary.isPending}
                onClick={() => {
                  const e = validateSpec(spec, (id) => personas.some((p) => p.id === id));
                  setErrors(e);
                  if (Object.keys(e).length === 0) toLibrary.mutate();
                }}
              >
                {toLibrary.isPending ? <Spinner data-icon="inline-start" /> : <BookCopy data-icon="inline-start" aria-hidden />} Save to library
              </Button>
            ) : null}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
