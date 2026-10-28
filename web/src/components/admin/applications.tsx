"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CircleAlert, Flag, IndianRupee, Inbox, ReceiptIndianRupee, ShieldAlert, XCircle } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError } from "@/lib/api/errors";
import { APPLICATION_FLAGS, type ApplicationDecision, type ApplicationFlag, type ApplicationRow, type ApplicationStatus, type StaffApplication } from "@/lib/api/schemas";
import { applyErrorMessage, flagLabel, inr, statusLabel } from "@/lib/apply";
import { dateTimeLabel, initials } from "@/lib/format";
import { landed } from "@/lib/landed";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { InfoNote } from "../app/info-note";
import { PageHeader } from "../app/page-header";
import { SlowNote } from "../app/slow-note";
import { EmptyState, ErrorState, ListSkeleton } from "../app/state";
import { ApplicationChat } from "../apply/application-chat";
import { ProofList } from "../apply/proof-list";
import { AdminShell } from "./admin-shell";
import { useFlows } from "./catalog-queries";

export function ApplicationsScreen() {
  return <AdminShell section="applications" phone="gate">{() => <Applications />}</AdminShell>;
}

type Filter = "submitted" | "flagged" | "all";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "submitted", label: "To check" },
  { id: "flagged", label: "Waiting on student" },
  { id: "all", label: "All" },
];

const STATUS_TONE: Record<ApplicationStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-primary/10 text-primary",
  flagged: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  rejected: "bg-destructive/10 text-destructive",
};

export function StatusChip({ status }: { status: ApplicationStatus }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", STATUS_TONE[status])}>{statusLabel(status)}</span>;
}

function Applications() {
  const { api } = useSession();
  const [filter, setFilter] = useState<Filter>("submitted");
  const [picked, setPicked] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["applications", filter],
    queryFn: () => api.applications(filter === "all" ? null : filter),
    refetchInterval: 30_000,
    refetchOnMount: "always",
  });
  const items = q.data?.items ?? [];
  const selected = picked ?? items[0]?.application.id ?? null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-6 pt-5 pb-4">
        <PageHeader title="Applications" description="Students who applied and paid by UPI. Match each screenshot with your bank or UPI app, then approve, flag an issue, or close it.">
          <ToggleGroup type="single" variant="outline" value={filter} onValueChange={(v) => (v === "submitted" || v === "flagged" || v === "all" ? (setFilter(v), setPicked(null)) : null)}>
            {FILTERS.map((f) => (
              <ToggleGroupItem key={f.id} value={f.id} data-testid={`applications-filter-${f.id}`}>
                {f.label}
                {f.id === "submitted" && q.data?.waiting ? <span className="bg-primary text-primary-foreground ml-1 rounded-full px-1.5 text-[11px] tabular-nums">{q.data.waiting}</span> : null}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </PageHeader>
        <InfoNote id="applications" title="How to check a payment" className="mt-4">
          To check lists students who uploaded a payment screenshot. Match the amount and transaction ID with your bank or UPI app, then Approve to enroll them, Flag an issue to tell them exactly what to fix (they see it with the right options), or Close to end it. Waiting on student lists the ones you flagged. Fees are never refunded.
        </InfoNote>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,360px)_1fr]">
        <aside className="min-h-0 overflow-y-auto border-r" aria-label="Applications">
          {q.isPending ? (
            <div className="p-4">
              <ListSkeleton rows={5} className="h-16" />
            </div>
          ) : q.isError ? (
            <ErrorState message={applyErrorMessage(q.error)} onRetry={() => void q.refetch()} />
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={Inbox} title={filter === "submitted" ? "Nothing to check" : "No applications here"}>
                {filter === "submitted" ? "New payments show up here as soon as a student uploads a screenshot." : "Try another filter."}
              </EmptyState>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((r) => (
                <Row key={r.application.id} row={r} active={r.application.id === selected} onPick={() => setPicked(r.application.id)} />
              ))}
            </ul>
          )}
        </aside>
        <section className="min-h-0 overflow-y-auto" aria-label="Application">
          {selected ? (
            <Detail key={selected} id={selected} />
          ) : q.isSuccess ? (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState icon={ReceiptIndianRupee} title="Nothing selected">
                Pick an application on the left to see the student&apos;s details, their payment screenshots and the chat.
              </EmptyState>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Row({ row, active, onPick }: { row: ApplicationRow; active: boolean; onPick: () => void }) {
  const a = row.application;
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-current={active ? "true" : undefined}
        className={cn("hover:bg-muted/60 focus-visible:ring-ring flex w-full items-start gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset", active && "bg-muted")}
        data-testid={`application-row-${row.applicant.github_login}`}
      >
        <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold">{initials(a.details.full_name, row.applicant.github_login)}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{a.details.full_name}</span>
            {row.unread ? <span className="bg-primary size-2 shrink-0 rounded-full" aria-label="Unread" /> : null}
          </span>
          <span className="text-muted-foreground truncate text-xs">
            {row.cohort_name} · {inr(a.fee_inr)}
          </span>
          <span className="flex items-center gap-2 pt-0.5">
            <StatusChip status={a.status} />
            {a.flag ? <span className="text-muted-foreground truncate text-[11px]">{flagLabel(a.flag)}</span> : null}
          </span>
        </span>
        <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">{a.updated_at.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
      </button>
    </li>
  );
}

function Detail({ id }: { id: string }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["application", id], queryFn: () => api.application(id), refetchInterval: 15_000 });
  const [deciding, setDeciding] = useState<ApplicationDecision | null>(null);
  if (q.isPending)
    return (
      <div className="p-6">
        <ListSkeleton rows={3} className="h-28" />
      </div>
    );
  if (q.isError) return <ErrorState message={applyErrorMessage(q.error)} onRetry={() => void q.refetch()} />;
  const v = q.data;
  const a = v.application;
  if (!a) return null;
  const open = a.status === "submitted" || a.status === "flagged" || a.status === "draft";
  const claimed = v.proofs.reduce((s, p) => s + p.amount_inr, 0);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["applications"] });
    void qc.invalidateQueries({ queryKey: ["application", id] });
  };
  const d = a.details;
  return (
    <div className="flex flex-col gap-6 p-6" data-testid="application-detail">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">{d.full_name}</h2>
          <p className="text-muted-foreground text-sm">
            @{v.applicant.github_login}
            {v.applicant.email ? ` · ${v.applicant.email}` : ""} · applied {dateTimeLabel(a.created_at)}
          </p>
          <div className="flex items-center gap-2 pt-1">
            <StatusChip status={a.status} />
            {a.flag ? <Badge variant="outline">{flagLabel(a.flag)}</Badge> : null}
          </div>
        </div>
        {open ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDeciding("approve")} disabled={a.status === "draft"} data-testid="decide-approve">
              <BadgeCheck data-icon="inline-start" aria-hidden /> Approve
            </Button>
            <Button variant="outline" onClick={() => setDeciding("flag")} disabled={a.status === "draft"} data-testid="decide-flag">
              <Flag data-icon="inline-start" aria-hidden /> Flag an issue
            </Button>
            <Button variant="ghost" className="text-destructive" onClick={() => setDeciding("reject")} data-testid="decide-reject">
              <XCircle data-icon="inline-start" aria-hidden /> Close
            </Button>
          </div>
        ) : null}
      </header>

      {a.status === "draft" ? (
        <Alert>
          <IndianRupee aria-hidden />
          <AlertTitle>Not paid yet</AlertTitle>
          <AlertDescription>The student saved their details but hasn&apos;t uploaded a payment.</AlertDescription>
        </Alert>
      ) : null}
      {v.proofs.some((p) => p.duplicate) ? (
        <Alert variant="destructive">
          <ShieldAlert aria-hidden />
          <AlertTitle>A screenshot or UTR here was used on another application</AlertTitle>
          <AlertDescription>Check it in your bank or UPI app before approving. Flag it as &quot;Screenshot used before&quot; if it isn&apos;t a new payment.</AlertDescription>
        </Alert>
      ) : null}

      <dl className="grid grid-cols-2 gap-4 rounded-xl border p-4 text-sm lg:grid-cols-4">
        <Item label="Cohort" value={v.cohort?.name ?? "Not set"} />
        <Item label="Fee" value={inr(a.fee_inr)} />
        <Item label="Confirmed so far" value={inr(a.paid_inr)} />
        <Item label="Student says they paid" value={inr(claimed)} strong={claimed < a.fee_inr && a.status === "submitted"} />
        <Item label="Phone" value={d.phone} />
        <Item label="Date of birth" value={d.date_of_birth} />
        <Item label="College" value={d.college} />
        <Item label="Course · branch · year" value={`${d.course} · ${d.branch} · ${d.grad_year}`} />
      </dl>

      <ProofList proofs={v.proofs} load={(p) => api.applicationProofImage(id, p)} staff />
      <ApplicationChat
        messages={v.messages}
        viewer="staff"
        otherName={d.full_name.split(/\s+/)[0] ?? d.full_name}
        onSend={async (cid, body) => {
          // Only the chat changes: append the message to this application's cache.
          const m = await api.sendStaffApplicationMessage(id, cid, body);
          qc.setQueryData<StaffApplication>(["application", id], (cur) => (cur && !cur.messages.some((x) => x.id === m.id) ? { ...cur, messages: [...cur.messages, m] } : cur));
          return m;
        }}
      />
      {deciding ? <DecideDialog key={deciding} view={v} action={deciding} claimed={claimed} onClose={() => setDeciding(null)} onDone={refresh} /> : null}
    </div>
  );
}

function Item({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={cn("truncate tabular-nums", strong && "text-amber-700 dark:text-amber-400 font-semibold")}>{value}</dd>
    </div>
  );
}

const NO_FLOW = "none";

function DecideDialog({ view, action, claimed, onClose, onDone }: { view: StaffApplication; action: ApplicationDecision; claimed: number; onClose: () => void; onDone: () => void }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const id = useId();
  const flows = useFlows();
  const a = view.application;
  const fee = a?.fee_inr ?? 0;
  const [mode, setMode] = useState<ApplicationDecision>(action);
  const [paid, setPaid] = useState(String(Math.max(a?.paid_inr ?? 0, claimed)));
  const [flag, setFlag] = useState<ApplicationFlag>(claimed > 0 && claimed < fee ? "partial_payment" : "unclear_proof");
  const [note, setNote] = useState("");
  const [flowId, setFlowId] = useState(NO_FLOW);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const days = view.cohort?.program.days ?? null;
  const flowChoices = (flows.data ?? []).filter((f) => !f.archived && f.published_version !== null && (days === null || f.days === days));
  const decide = useMutation({
    mutationFn: () => {
      if (!a) throw new Error("no application");
      return landed(
        () =>
          api.decideApplication(a.id, {
            action: mode,
            flag: mode === "flag" ? flag : null,
            note: note.trim(),
            paid_inr: mode === "reject" ? null : Number(paid),
            flow_id: mode === "approve" && flowId !== NO_FLOW ? flowId : null,
            expected_version: a.version,
          }),
        // Decided if the application moved on while the answer was lost.
        async () => {
          const v = await api.application(a.id);
          return v.application && v.application.version > a.version ? v : null;
        },
      );
    },
    onSuccess: (v) => {
      qc.setQueryData(["application", v.application?.id], v);
      toast.success(mode === "approve" ? `${view.application?.details.full_name ?? "Student"} is enrolled` : mode === "flag" ? "Flagged. The student was told what to do" : "Application closed");
      onDone();
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "validation_failed" && Object.keys(e.fields).length) {
        setErrors(e.fields);
        return;
      }
      setFormError(applyErrorMessage(e));
      if (e instanceof ApiError && (e.code === "version_conflict" || e.code === "invalid_transition")) onDone();
    },
  });
  const submit = () => {
    const e: Record<string, string> = {};
    const n = Number(paid);
    if (mode !== "reject" && (!Number.isInteger(n) || n < 0)) e.paid_inr = "Enter the amount you received, in rupees.";
    if (mode === "approve" && Number.isInteger(n) && n < fee) e.paid_inr = `That's short of the ${inr(fee)} fee. Flag it as a partial payment instead.`;
    if (mode === "flag" && flag === "other" && note.trim().length < 5) e.note = "Tell the student what's wrong.";
    if (mode === "reject" && note.trim().length < 5) e.note = "Tell the student why (at least 5 characters).";
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length === 0) decide.mutate();
  };
  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Decide on {a?.details.full_name}</DialogTitle>
          <DialogDescription>
            {view.cohort?.name} · fee {inr(fee)} · they say they paid {inr(claimed)}
          </DialogDescription>
        </DialogHeader>
        <form
          id={`${id}-f`}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <FieldGroup>
            <ToggleGroup type="single" variant="outline" value={mode} onValueChange={(v) => (v === "approve" || v === "flag" || v === "reject" ? setMode(v) : null)} className="w-full">
              <ToggleGroupItem value="approve" className="flex-1" data-testid="decide-mode-approve">
                Approve
              </ToggleGroupItem>
              <ToggleGroupItem value="flag" className="flex-1" data-testid="decide-mode-flag">
                Flag an issue
              </ToggleGroupItem>
              <ToggleGroupItem value="reject" className="flex-1" data-testid="decide-mode-reject">
                Close
              </ToggleGroupItem>
            </ToggleGroup>
            {formError ? (
              <Alert variant="destructive">
                <CircleAlert aria-hidden />
                <AlertTitle>Couldn&apos;t save</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}
            {mode === "flag" ? (
              <Field>
                <FieldLabel htmlFor={`${id}-flag`}>What&apos;s wrong</FieldLabel>
                <Select value={flag} onValueChange={(v) => setFlag(APPLICATION_FLAGS.find((f) => f === v) ?? "other")}>
                  <SelectTrigger id={`${id}-flag`} className="w-full" data-testid="decide-flag-reason">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APPLICATION_FLAGS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {flagLabel(f)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>The student sees a plain explanation and only the options that fix it.</FieldDescription>
              </Field>
            ) : null}
            {mode !== "reject" ? (
              <Field data-invalid={!!errors.paid_inr}>
                <FieldLabel htmlFor={`${id}-paid`}>Amount you received in total (₹)</FieldLabel>
                <Input id={`${id}-paid`} value={paid} onChange={(e) => setPaid(e.target.value)} inputMode="numeric" aria-invalid={!!errors.paid_inr} data-testid="decide-paid" />
                {errors.paid_inr ? <FieldError>{errors.paid_inr}</FieldError> : <FieldDescription>Check your bank or UPI app, not the screenshot.</FieldDescription>}
              </Field>
            ) : null}
            {mode === "approve" ? (
              <Field>
                <FieldLabel htmlFor={`${id}-flow`}>Flow (optional)</FieldLabel>
                <Select value={flowId} onValueChange={setFlowId}>
                  <SelectTrigger id={`${id}-flow`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_FLOW}>No flow yet, assign tasks by hand</SelectItem>
                    {flowChoices.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name} · {f.days} days
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>Approving enrolls the student in {view.cohort?.name ?? "the cohort"} and opens their workspace.</FieldDescription>
              </Field>
            ) : (
              <Field data-invalid={!!errors.note}>
                <FieldLabel htmlFor={`${id}-note`}>{mode === "reject" ? "Reason (the student sees it)" : "Note to the student (optional)"}</FieldLabel>
                <Textarea id={`${id}-note`} value={note} onChange={(e) => setNote(e.target.value)} rows={3} aria-invalid={!!errors.note} data-testid="decide-note" />
                {errors.note ? <FieldError>{errors.note}</FieldError> : null}
              </Field>
            )}
            {mode === "reject" ? (
              <Alert>
                <ShieldAlert aria-hidden />
                <AlertTitle>No refunds</AlertTitle>
                <AlertDescription>The student is told fees are non-refundable under any circumstances. They can start a new application.</AlertDescription>
              </Alert>
            ) : null}
            <SlowNote busy={decide.isPending} />
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={`${id}-f`} variant={mode === "reject" ? "destructive" : "default"} disabled={decide.isPending} data-testid="decide-submit">
            {decide.isPending ? <Spinner data-icon="inline-start" /> : null}
            {mode === "approve" ? "Approve and enroll" : mode === "flag" ? "Send to student" : "Close application"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
