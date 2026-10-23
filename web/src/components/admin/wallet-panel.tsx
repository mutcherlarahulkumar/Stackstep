"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, MessagesSquare, Sparkles, Trophy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, messageFor } from "@/lib/api/errors";
import { type CreditReason, type Student } from "@/lib/api/schemas";
import { dateTimeLabel, firstName } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { normalizeLine } from "@/lib/validation";

import { AITurns } from "../ai/ai-helper";
import { ErrorState, ListSkeleton } from "../app/state";

export const REASON_LABEL: Record<CreditReason, string> = {
  welcome: "Starting credits",
  task_done: "Finished a task",
  admin_grant: "Given by an admin",
  admin_revoke: "Removed by an admin",
  ai_question: "AI question",
  ai_refund: "AI refund",
};

/** A student's points, credits and AI use, with manual credit changes. */
export function WalletPanel({ student }: { student: Student }) {
  const { api } = useSession();
  const key = ["staff-wallet", student.enrollment.id];
  const w = useQuery({ queryKey: key, queryFn: () => api.staffWallet(student.enrollment.id) });
  const [adjust, setAdjust] = useState(false);
  const [history, setHistory] = useState(false);
  const [ai, setAI] = useState(false);
  if (w.isPending) return <ListSkeleton rows={1} className="h-12" />;
  if (w.isError) return <p className="text-destructive text-sm">{messageFor(w.error)}</p>;
  const d = w.data;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="wallet-panel">
      <span className="bg-muted inline-flex items-center gap-1.5 rounded-full px-3 py-1 tabular-nums">
        <Trophy className="text-warning size-4" aria-hidden /> {d.points.total} points
        <span className="text-muted-foreground">
          · {d.points.finished} done, {d.points.on_time} on time
        </span>
      </span>
      <button type="button" onClick={() => setHistory(true)} className="bg-muted hover:bg-muted/70 inline-flex items-center gap-1.5 rounded-full px-3 py-1 tabular-nums">
        <Coins className="text-primary size-4" aria-hidden /> {d.credits.balance} credits
      </button>
      <button type="button" onClick={() => setAI(true)} className="bg-muted hover:bg-muted/70 inline-flex items-center gap-1.5 rounded-full px-3 py-1 tabular-nums">
        <Sparkles className="size-4 text-fuchsia-600" aria-hidden /> {d.ai.used_today}/{d.ai.daily_limit} AI today
      </button>
      <Button size="sm" variant="outline" onClick={() => setAdjust(true)} data-testid="open-credits">
        Adjust credits
      </Button>
      <AdjustDialog key={adjust ? "open" : "closed"} open={adjust} student={student} balance={d.credits.balance} onClose={() => setAdjust(false)} />
      <Sheet open={history} onOpenChange={setHistory}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Credits</SheetTitle>
            <SheetDescription>
              {firstName(student.user.name)} has {d.credits.balance}. Newest first.
            </SheetDescription>
          </SheetHeader>
          <ul className="flex flex-col divide-y px-4 pb-6">
            {d.credits.history.map((h) => (
              <li key={h.id} className="flex items-start gap-3 py-2.5 text-sm">
                <span className={cn("w-10 shrink-0 text-right font-medium tabular-nums", h.delta > 0 ? "text-success" : "text-destructive")}>
                  {h.delta > 0 ? `+${h.delta}` : h.delta}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block">{REASON_LABEL[h.reason]}</span>
                  {h.note ? <span className="text-muted-foreground block truncate text-xs">{h.note}</span> : null}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">{dateTimeLabel(h.created_at)}</span>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
      <AIConversationsSheet open={ai} onOpenChange={setAI} student={student} />
    </div>
  );
}

function AdjustDialog({ open, student, balance, onClose }: { open: boolean; student: Student; balance: number; onClose: () => void }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const [delta, setDelta] = useState("5");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const save = useMutation({
    mutationFn: () => api.grantCredits(student.enrollment.id, Number(delta), normalizeLine(note)),
    onSuccess: (w) => {
      qc.setQueryData(["staff-wallet", student.enrollment.id], w);
      toast.success(`${firstName(student.user.name)} now has ${w.credits.balance} credits`);
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "validation_failed") setErrors(e.fields);
      else toast.error(messageFor(e));
    },
  });
  const submit = () => {
    const n = Number(delta);
    const e: Record<string, string | undefined> = {};
    if (!Number.isInteger(n) || n === 0 || n > 100 || n < -100) e.delta = "Change credits by 1 to 100 (or -1 to -100).";
    else if (balance + n < 0) e.delta = `They only have ${balance} credits.`;
    if (!normalizeLine(note)) e.note = "Say why, so the student understands the change.";
    else if (normalizeLine(note).length > 300) e.note = "Keep the reason under 300 characters.";
    setErrors(e);
    if (!Object.values(e).some(Boolean)) save.mutate();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust credits</DialogTitle>
          <DialogDescription>
            {student.user.name} has {balance}. Credits pay for AI helper questions. The reason shows in their history.
          </DialogDescription>
        </DialogHeader>
        <form
          id="credits-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <FieldGroup>
            <Field data-invalid={!!errors.delta}>
              <FieldLabel htmlFor="credits-delta">Change</FieldLabel>
              <Input id="credits-delta" type="number" min={-100} max={100} step={1} className="w-28" value={delta} onChange={(e) => setDelta(e.target.value)} aria-invalid={!!errors.delta} />
              {errors.delta ? <FieldError>{errors.delta}</FieldError> : <FieldDescription>Use a negative number to remove credits.</FieldDescription>}
            </Field>
            <Field data-invalid={!!errors.note}>
              <FieldLabel htmlFor="credits-note">Reason</FieldLabel>
              <Input id="credits-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Great code review for a teammate" aria-invalid={!!errors.note} />
              {errors.note ? <FieldError>{errors.note}</FieldError> : null}
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="credits-form" disabled={save.isPending} data-testid="credits-save">
            {save.isPending ? <Spinner data-icon="inline-start" /> : null} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AIConversationsSheet({ open, onOpenChange, student }: { open: boolean; onOpenChange: (o: boolean) => void; student: Student }) {
  const { api } = useSession();
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["staff-ai", student.enrollment.id], queryFn: () => api.staffAIConversations(student.enrollment.id), enabled: open });
  const conv = useQuery({
    queryKey: ["staff-ai", student.enrollment.id, openId],
    queryFn: () => api.staffAIConversation(student.enrollment.id, openId ?? ""),
    enabled: open && openId !== null,
  });
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setOpenId(null);
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            AI helper use <Badge variant="outline">Read only</Badge>
          </SheetTitle>
          <SheetDescription>Check that {firstName(student.user.name)} explains problems well and uses hints to learn, not to copy.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {openId ? (
            <>
              <Button variant="ghost" size="sm" className="-ml-2 mb-3" onClick={() => setOpenId(null)}>
                All conversations
              </Button>
              {conv.isPending ? <ListSkeleton rows={3} className="h-20" /> : conv.isError ? <ErrorState message={messageFor(conv.error)} onRetry={() => void conv.refetch()} /> : <AITurns messages={conv.data.messages} />}
            </>
          ) : list.isPending ? (
            <ListSkeleton rows={3} className="h-12" />
          ) : list.isError ? (
            <ErrorState message={messageFor(list.error)} onRetry={() => void list.refetch()} />
          ) : list.data.length === 0 ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <MessagesSquare className="size-4" aria-hidden /> No AI questions yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {list.data.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setOpenId(c.id)} className="hover:bg-muted/70 flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">{c.title}</span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {c.follow_ups} follow-ups · {dateTimeLabel(c.updated_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
