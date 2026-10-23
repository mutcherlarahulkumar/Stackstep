"use client";

import { CircleAlert, Search, Send } from "lucide-react";
import { useDeferredValue, useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, messageFor, NetworkError } from "@/lib/api/errors";
import { type Student } from "@/lib/api/schemas";
import { DEFAULT_PERSONA_ID } from "@/lib/inbox";
import { usePersonas } from "@/lib/inbox-queries";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { Bounds, runeLength, validateMessage } from "@/lib/validation";

import { PersonaAvatar } from "../app/persona-avatar";
import { ListSkeleton } from "../app/state";
import { useStudents } from "./students";
import { normalizeLineSafe } from "./util";

type Errors = Partial<Record<"persona_id" | "enrollment_ids" | "body", string>>;

/**
 * One message, as a persona, to many students. Each student gets it in their own chat with
 * that persona, so replies stay one-to-one.
 */
export function BroadcastDialog({
  open,
  onOpenChange,
  preset,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Pre-picked recipients and a draft (e.g. a nudge to inactive students). Remount with a new key to change it. */
  preset?: { title: string; students: Student[]; body: string };
}) {
  const { api } = useSession();
  const personas = usePersonas();
  const [personaPick, setPersonaPick] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, Student>>(() => new Map((preset?.students ?? []).slice(0, Bounds.broadcastMax).map((s) => [s.enrollment.id, s])));
  const [body, setBody] = useState(preset?.body ?? "");
  const [raw, setRaw] = useState("");
  const query = useDeferredValue(normalizeLineSafe(raw));
  const students = useStudents(query);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // Kept across retries of the same message so a resend after a dropped connection never duplicates it.
  const clientId = useRef<string>(crypto.randomUUID());

  const list = personas.data ?? [];
  const personaId = personaPick ?? (list.some((p) => p.id === DEFAULT_PERSONA_ID) ? DEFAULT_PERSONA_ID : (list[0]?.id ?? null));
  const rows = students.data?.pages.flatMap((p) => p.items) ?? [];
  const length = runeLength(body.trim());

  const reset = () => {
    setSelected(new Map());
    setBody("");
    setRaw("");
    setErrors({});
    setFormError(null);
    clientId.current = crypto.randomUUID();
  };

  const toggle = (s: Student) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(s.enrollment.id)) next.delete(s.enrollment.id);
      else if (next.size >= Bounds.broadcastMax) {
        toast.error(`You can message up to ${Bounds.broadcastMax} students at once.`);
        return prev;
      } else next.set(s.enrollment.id, s);
      setErrors((e) => ({ ...e, enrollment_ids: undefined }));
      return next;
    });

  const send = async () => {
    const next: Errors = {
      persona_id: personaId ? undefined : "Pick who the message is from.",
      enrollment_ids: selected.size === 0 ? "Pick at least one student." : undefined,
      body: validateMessage(body) ?? undefined,
    };
    setErrors(next);
    setFormError(null);
    if (Object.values(next).some(Boolean) || !personaId) return;
    setSending(true);
    try {
      const res = await api.broadcast(personaId, clientId.current, [...selected.keys()], body.trim());
      const failed = res.items.length - res.sent;
      if (failed === 0) toast.success(`Sent to ${res.sent} ${res.sent === 1 ? "student" : "students"}`, { description: "Replies land in your inbox." });
      else toast.warning(`Sent to ${res.sent} of ${res.items.length}`, { description: `${failed} couldn't receive it, usually because their internship is paused or ended.` });
      reset();
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === "validation_failed" && Object.keys(e.fields).length) setErrors(e.fields as Errors);
      else setFormError(messageFor(e));
      // A rejected request stored nothing; only a dropped connection might have, so keep the id then.
      if (!(e instanceof NetworkError)) clientId.current = crypto.randomUUID();
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{preset?.title ?? "Message students"}</DialogTitle>
          <DialogDescription>Each student gets it in their chat with the persona you pick. Replies come back to your inbox.</DialogDescription>
        </DialogHeader>
        <form
          id="broadcast-form"
          noValidate
          className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {formError ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden />
              <AlertTitle>Couldn&apos;t send</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={!!errors.persona_id}>
            <FieldLabel htmlFor="broadcast-persona">From</FieldLabel>
            <Select value={personaId ?? ""} onValueChange={setPersonaPick} disabled={list.length === 0}>
              <SelectTrigger id="broadcast-persona" className="w-full">
                <SelectValue placeholder={personas.isPending ? "Loading…" : "Pick a persona"} />
              </SelectTrigger>
              <SelectContent>
                {list.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <PersonaAvatar persona={p} size="sm" /> {p.name} <span className="text-muted-foreground">· {p.title}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.persona_id ? <FieldError>{errors.persona_id}</FieldError> : null}
          </Field>
          <Field data-invalid={!!errors.body}>
            <FieldLabel htmlFor="broadcast-body">Message</FieldLabel>
            <Textarea
              id="broadcast-body"
              rows={4}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setErrors((x) => ({ ...x, body: undefined }));
              }}
              placeholder="e.g. Demo day moved to Friday 4 PM. Push your branches by Thursday."
              aria-invalid={!!errors.body}
            />
            {errors.body ? (
              <FieldError>{errors.body}</FieldError>
            ) : length > Bounds.messageMax - 500 ? (
              <FieldDescription className={cn("tabular-nums", length > Bounds.messageMax && "text-destructive")}>
                {length} / {Bounds.messageMax}
              </FieldDescription>
            ) : null}
          </Field>
          <Field data-invalid={!!errors.enrollment_ids}>
            <div className="flex items-baseline justify-between">
              <FieldLabel>Recipients</FieldLabel>
              <span className="text-muted-foreground text-xs tabular-nums">
                {selected.size} selected
                {selected.size > 0 ? (
                  <Button type="button" variant="link" size="xs" onClick={() => setSelected(new Map())}>
                    Clear
                  </Button>
                ) : null}
              </span>
            </div>
            <InputGroup>
              <InputGroupAddon>
                <Search aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                value={raw}
                maxLength={Bounds.searchMax}
                onChange={(e) => setRaw(e.target.value)}
                placeholder="Search students"
                aria-label="Search students"
                type="search"
              />
            </InputGroup>
            {errors.enrollment_ids ? <FieldError>{errors.enrollment_ids}</FieldError> : null}
            <div className="max-h-56 overflow-y-auto rounded-lg border">
              {students.isPending ? (
                <div className="p-2">
                  <ListSkeleton rows={3} className="h-9" />
                </div>
              ) : rows.length === 0 ? (
                <p className="text-muted-foreground p-4 text-center text-sm">No students match.</p>
              ) : (
                <ul aria-label="Students to message">
                  {rows.map((s) => {
                    const active = s.enrollment.status === "active";
                    const id = `bc-${s.enrollment.id}`;
                    return (
                      <li key={s.enrollment.id} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
                        <Checkbox id={id} checked={selected.has(s.enrollment.id)} disabled={!active} onCheckedChange={() => toggle(s)} />
                        <label htmlFor={id} className={cn("flex min-w-0 flex-1 flex-col text-sm", !active && "opacity-60")}>
                          <span className="truncate font-medium">{s.user.name}</span>
                          <span className="text-muted-foreground truncate text-xs">
                            @{s.user.github_login}
                            {active ? "" : ` · ${s.enrollment.status}`}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              {students.hasNextPage ? (
                <Button type="button" variant="ghost" className="w-full" disabled={students.isFetchingNextPage} onClick={() => void students.fetchNextPage()}>
                  {students.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null} Load more
                </Button>
              ) : null}
            </div>
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="broadcast-form" disabled={sending} data-testid="broadcast-send">
            {sending ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" aria-hidden />}
            {selected.size ? `Send to ${selected.size} ${selected.size === 1 ? "student" : "students"}` : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
