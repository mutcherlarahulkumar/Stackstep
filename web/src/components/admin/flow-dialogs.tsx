"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type FlowInput } from "@/lib/api/client";
import { type Flow, type FlowDetail } from "@/lib/api/schemas";
import { useSession } from "@/lib/session";
import { Bounds, normalizeLine, validateDescription, validateLine } from "@/lib/validation";

import { choiceItem } from "../app/choice";
import { splitError } from "./form-errors";

type Errors = Partial<Record<"name" | "stream" | "days" | "description", string>>;

function check(name: string, stream: string, description: string): Errors {
  return {
    name: validateLine(name, "Name", Bounds.flowNameMin, Bounds.flowNameMax) ?? undefined,
    stream: validateLine(stream, "Stream", Bounds.streamMin, Bounds.streamMax) ?? undefined,
    description: validateDescription(description) ?? undefined,
  };
}

function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden />
      <AlertTitle>Couldn&apos;t save</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/** Create a flow, or edit its details (name, stream, length, description, archived). */
export function FlowDetailsDialog({
  open,
  flow,
  onClose,
  onSaved,
}: {
  open: boolean;
  flow: Flow | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { api } = useSession();
  const qc = useQueryClient();
  const [name, setName] = useState(flow?.name ?? "");
  const [stream, setStream] = useState(flow?.stream ?? "");
  const [days, setDays] = useState<30 | 60>(flow?.days ?? 30);
  const [description, setDescription] = useState(flow?.description ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (input: FlowInput): Promise<string> =>
      flow ? (await api.updateFlow(flow.id, { ...input, archived: flow.archived }, flow.version)).id : (await api.createFlow(input)).flow.id,
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: ["flows"] });
      void qc.invalidateQueries({ queryKey: ["flow", id] });
      onSaved(id);
    },
    onError: (e) => {
      const { fields, form } = splitError(e);
      setErrors(fields as Errors);
      setFormError(form);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{flow ? "Flow details" : "New flow"}</DialogTitle>
          <DialogDescription>A flow is a course for one stream. Students on it get every task scheduled automatically.</DialogDescription>
        </DialogHeader>
        <form
          id="flow-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const next = check(name, stream, description);
            setErrors(next);
            setFormError(null);
            if (!Object.values(next).some(Boolean)) save.mutate({ name: normalizeLine(name), stream: normalizeLine(stream), days, description: description.trim() });
          }}
        >
          <FieldGroup>
            <FormAlert message={formError} />
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="flow-name">Name</FieldLabel>
              <Input id="flow-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Angular Frontend · 30 days" aria-invalid={!!errors.name} autoComplete="off" />
              {errors.name ? <FieldError>{errors.name}</FieldError> : null}
            </Field>
            <Field data-invalid={!!errors.stream}>
              <FieldLabel htmlFor="flow-stream">Stream</FieldLabel>
              <Input id="flow-stream" value={stream} onChange={(e) => setStream(e.target.value)} placeholder="e.g. Angular" aria-invalid={!!errors.stream} autoComplete="off" />
              {errors.stream ? <FieldError>{errors.stream}</FieldError> : <FieldDescription>Used to group flows and to match students to one.</FieldDescription>}
            </Field>
            <Field data-invalid={!!errors.days}>
              <FieldLabel>Length</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                value={String(days)}
                onValueChange={(v) => {
                  if (v === "30" || v === "60") setDays(v === "30" ? 30 : 60);
                }}
                className="justify-start"
                disabled={!!flow}
              >
                <ToggleGroupItem value="30" className={choiceItem}>
                  30 days
                </ToggleGroupItem>
                <ToggleGroupItem value="60" className={choiceItem}>
                  60 days
                </ToggleGroupItem>
              </ToggleGroup>
              {errors.days ? (
                <FieldError>{errors.days}</FieldError>
              ) : (
                <FieldDescription>{flow ? "Fixed once created. Duplicate the flow to make a different length." : "Must match the program the students are on."}</FieldDescription>
              )}
            </Field>
            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor="flow-description">Description</FieldLabel>
              <Textarea id="flow-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional. Who it's for and what they build." aria-invalid={!!errors.description} />
              {errors.description ? <FieldError>{errors.description}</FieldError> : null}
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="flow-form" disabled={save.isPending} data-testid="flow-save">
            {save.isPending ? <Spinner data-icon="inline-start" /> : null} {flow ? "Save" : "Create flow"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Copy a flow's latest items into a new flow with its own name and stream. */
export function DuplicateFlowDialog({ source, onClose, onDone }: { source: Flow | null; onClose: () => void; onDone: (d: FlowDetail) => void }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const [name, setName] = useState(source ? `${source.name} (copy)`.slice(0, Bounds.flowNameMax) : "");
  const [stream, setStream] = useState(source?.stream ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const dup = useMutation({
    mutationFn: () => api.duplicateFlow(source?.id ?? "", normalizeLine(name), normalizeLine(stream)),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ["flows"] });
      onDone(d);
    },
    onError: (e) => {
      const { fields, form } = splitError(e);
      setErrors(fields as Errors);
      setFormError(form);
    },
  });
  return (
    <Dialog open={source !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate “{source?.name}”</DialogTitle>
          <DialogDescription>
            Copies every task into a new draft, e.g. turn a React flow into an Angular one, then swap the stack-specific tasks. The original is unchanged.
          </DialogDescription>
        </DialogHeader>
        <form
          id="dup-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const next = check(name, stream, "");
            setErrors(next);
            setFormError(null);
            if (!Object.values(next).some(Boolean)) dup.mutate();
          }}
        >
          <FieldGroup>
            <FormAlert message={formError} />
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="dup-name">New name</FieldLabel>
              <Input id="dup-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} autoComplete="off" />
              {errors.name ? <FieldError>{errors.name}</FieldError> : null}
            </Field>
            <Field data-invalid={!!errors.stream}>
              <FieldLabel htmlFor="dup-stream">Stream</FieldLabel>
              <Input id="dup-stream" value={stream} onChange={(e) => setStream(e.target.value)} placeholder="e.g. Angular" aria-invalid={!!errors.stream} autoComplete="off" />
              {errors.stream ? <FieldError>{errors.stream}</FieldError> : null}
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="dup-form" disabled={dup.isPending} data-testid="dup-save">
            {dup.isPending ? <Spinner data-icon="inline-start" /> : null} Duplicate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
