"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, CircleAlert, Pencil, Plus, UserRoundCog } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type PersonaInput } from "@/lib/api/client";
import { messageFor } from "@/lib/api/errors";
import { PERSONA_COLORS, type Persona, type PersonaColor } from "@/lib/api/schemas";
import { personasKey } from "@/lib/inbox-queries";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { Bounds, normalizeLine, validateLine } from "@/lib/validation";

import { InfoNote } from "../app/info-note";
import { PAGE, PageHeader } from "../app/page-header";
import { PERSONA_BG, PersonaAvatar } from "../app/persona-avatar";
import { EmptyState, ErrorState, ListSkeleton } from "../app/state";
import { AdminShell } from "./admin-shell";
import { splitError } from "./form-errors";

const ALL_KEY = ["personas", "all"] as const;

export function PersonasScreen() {
  return (
    <AdminShell section="personas" phone="gate">
      {(me) => <Personas canEdit={me.user.role === "admin"} />}
    </AdminShell>
  );
}

function Personas({ canEdit }: { canEdit: boolean }) {
  const { api } = useSession();
  const [editing, setEditing] = useState<Persona | "new" | null>(null);
  const q = useQuery({ queryKey: ALL_KEY, queryFn: () => api.personas(true) });
  return (
          <div className={cn(PAGE, "min-h-0 flex-1 overflow-y-auto")}>
            <PageHeader title="Personas" description={<>The managers students chat with. Each task is posted by one, so a student&apos;s chat feels like a real team.</>} className="mb-6">
              {canEdit ? (
                <Button onClick={() => setEditing("new")} data-testid="new-persona">
                  <Plus data-icon="inline-start" aria-hidden /> New persona
                </Button>
              ) : null}
            </PageHeader>
            <InfoNote id="personas" title="What personas are">
              Personas are the team members students chat with, such as the team lead or product manager. Each task is posted by one of them. Mentors reply as the persona, and personas with automatic replies answer everyday questions on their own, always labelled as automatic.
            </InfoNote>
            {q.isPending ? (
              <ListSkeleton rows={4} className="h-12" />
            ) : q.isError ? (
              <ErrorState message={messageFor(q.error)} onRetry={() => void q.refetch()} />
            ) : q.data.length === 0 ? (
              <EmptyState icon={UserRoundCog} title="No personas yet">
                Add the managers who post tasks, such as an engineering manager for DSA, a delivery manager for features, a content lead for blogs.
              </EmptyState>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Persona</TableHead>
                    <TableHead>Replies</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {q.data.map((p) => (
                    <TableRow key={p.id} data-testid={`persona-row-${p.name}`} className={cn(p.archived && "opacity-60")}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <PersonaAvatar persona={p} />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{p.name}</p>
                            <p className="text-muted-foreground truncate text-sm">{p.title}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {p.auto_reply ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Bot className="size-4" aria-hidden /> Auto-acknowledges, then admins
                          </span>
                        ) : (
                          "Admins reply"
                        )}
                      </TableCell>
                      <TableCell>{p.archived ? <Badge variant="secondary">Archived</Badge> : <Badge variant="outline">Active</Badge>}</TableCell>
                      <TableCell>
                        {canEdit ? (
                          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}>
                            <Pencil aria-hidden />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <PersonaDialog key={editing === null ? "closed" : editing === "new" ? "new" : editing.id} editing={editing} onClose={() => setEditing(null)} />
          </div>
  );
}

type Errors = Partial<Record<"name" | "title" | "color", string>>;

function PersonaDialog({ editing, onClose }: { editing: Persona | "new" | null; onClose: () => void }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const current = editing && editing !== "new" ? editing : null;
  const [name, setName] = useState(current?.name ?? "");
  const [title, setTitle] = useState(current?.title ?? "");
  const [color, setColor] = useState<PersonaColor>(current?.color ?? "blue");
  const [autoReply, setAutoReply] = useState(current?.auto_reply ?? false);
  const [archived, setArchived] = useState(current?.archived ?? false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (input: PersonaInput) => (current ? api.updatePersona(current.id, { ...input, archived }, current.version) : api.createPersona(input)),
    onSuccess: (p) => {
      toast.success(current ? `Saved ${p.name}` : `Added ${p.name}`);
      void qc.invalidateQueries({ queryKey: personasKey });
      void qc.invalidateQueries({ queryKey: ALL_KEY });
      onClose();
    },
    onError: (e) => {
      const { fields, form } = splitError(e);
      setErrors(fields as Errors);
      setFormError(form);
    },
  });

  const submit = () => {
    const next: Errors = {
      name: validateLine(name, "Name", Bounds.personaNameMin, Bounds.personaNameMax) ?? undefined,
      title: validateLine(title, "Title", Bounds.personaNameMin, Bounds.personaNameMax) ?? undefined,
    };
    setErrors(next);
    setFormError(null);
    if (Object.values(next).some(Boolean)) return;
    save.mutate({ name: normalizeLine(name), title: normalizeLine(title), color, auto_reply: autoReply });
  };

  return (
    <Dialog open={editing !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{current ? `Edit ${current.name}` : "New persona"}</DialogTitle>
          <DialogDescription>Students see this name, title and color on every message and task from this persona.</DialogDescription>
        </DialogHeader>
        <form
          id="persona-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <FieldGroup>
            {formError ? (
              <Alert variant="destructive">
                <CircleAlert aria-hidden />
                <AlertTitle>Couldn&apos;t save</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex items-center gap-3">
              <PersonaAvatar persona={{ name: normalizeLine(name) || "?", color }} size="lg" />
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">{normalizeLine(name) || "Name"}</p>
                <p className="text-muted-foreground truncate">{normalizeLine(title) || "Title"}</p>
              </div>
            </div>
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="persona-name">Name</FieldLabel>
              <Input id="persona-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya Sharma" aria-invalid={!!errors.name} autoComplete="off" />
              {errors.name ? <FieldError>{errors.name}</FieldError> : null}
            </Field>
            <Field data-invalid={!!errors.title}>
              <FieldLabel htmlFor="persona-title">Title</FieldLabel>
              <Input id="persona-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Engineering Manager" aria-invalid={!!errors.title} autoComplete="off" />
              {errors.title ? <FieldError>{errors.title}</FieldError> : null}
            </Field>
            <Field data-invalid={!!errors.color}>
              <FieldLabel id="persona-color">Color</FieldLabel>
              <div role="radiogroup" aria-labelledby="persona-color" className="flex flex-wrap gap-2">
                {PERSONA_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={color === c}
                    aria-label={c}
                    onClick={() => setColor(c)}
                    className={cn(
                      "focus-visible:ring-ring size-8 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                      PERSONA_BG[c],
                      color === c && "ring-foreground ring-2 ring-offset-2 ring-offset-background",
                    )}
                  />
                ))}
              </div>
              {errors.color ? <FieldError>{errors.color}</FieldError> : null}
            </Field>
            <Field orientation="horizontal">
              <Switch id="persona-auto" checked={autoReply} onCheckedChange={setAutoReply} />
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="persona-auto">Auto-acknowledge student messages</Label>
                <FieldDescription>Sends a short “got it” reply. Admins still answer for real.</FieldDescription>
              </div>
            </Field>
            {current ? (
              <Field orientation="horizontal">
                <Switch id="persona-archived" checked={archived} onCheckedChange={setArchived} />
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor="persona-archived">Archived</Label>
                  <FieldDescription>Hidden from pickers. Existing chats and tasks keep it.</FieldDescription>
                </div>
              </Field>
            ) : null}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="persona-form" disabled={save.isPending} data-testid="persona-save">
            {save.isPending ? <Spinner data-icon="inline-start" /> : null} {current ? "Save" : "Add persona"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
