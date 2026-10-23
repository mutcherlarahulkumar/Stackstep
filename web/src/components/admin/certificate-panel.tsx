"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, FileBadge, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, messageFor } from "@/lib/api/errors";
import { type Certificate, type Progress, type Student } from "@/lib/api/schemas";
import { certificatePath, formatCode, verifyPath } from "@/lib/certificate";
import { firstName } from "@/lib/format";
import { useSession } from "@/lib/session";
import { normalizeLine, runeLength } from "@/lib/validation";

const REASON_MAX = 300;

/** Progress toward the certificate, and issuing or revoking it. */
export function CertificatePanel({ student }: { student: Student }) {
  const { api, state } = useSession();
  const isAdmin = state.status === "signed_in" && state.me.user.role === "admin";
  const key = ["staff-progress", student.enrollment.id];
  const q = useQuery({ queryKey: key, queryFn: () => api.staffProgress(student.enrollment.id) });
  const [issuing, setIssuing] = useState(false);
  const [revoking, setRevoking] = useState<Certificate | null>(null);

  if (q.isPending) return <Skeleton className="h-8 w-56" />;
  if (q.isError) return <p className="text-destructive text-sm">{messageFor(q.error)}</p>;
  const p = q.data;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="certificate-panel">
      <span className="bg-muted inline-flex items-center gap-1.5 rounded-full px-3 py-1 tabular-nums" title={`Bar: ${p.bar_percent}% of released tasks`}>
        {p.completion_percent}% done
        <span className="text-muted-foreground">
          · {p.done}/{p.released}
          {p.overdue > 0 ? `, ${p.overdue} overdue` : ""}
        </span>
      </span>
      {p.certificate ? (
        <>
          <Button asChild size="sm" variant="outline" data-testid="view-certificate">
            <Link href={verifyPath(p.certificate.code)} target="_blank">
              <BadgeCheck data-icon="inline-start" className="text-success" aria-hidden /> {formatCode(p.certificate.code)}
            </Link>
          </Button>
          {isAdmin ? (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRevoking(p.certificate)} data-testid="open-revoke">
              Revoke
            </Button>
          ) : null}
        </>
      ) : (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIssuing(true)}
            disabled={student.enrollment.status === "cancelled" || p.done === 0}
            aria-describedby={p.done === 0 ? "issue-hint" : undefined}
            data-testid="open-issue"
          >
            <FileBadge data-icon="inline-start" aria-hidden /> Issue certificate
          </Button>
          {p.done === 0 ? (
            <span id="issue-hint" className="text-muted-foreground text-xs">
              Available once they finish a task
            </span>
          ) : null}
        </>
      )}
      <IssueDialog open={issuing} student={student} progress={p} onClose={() => setIssuing(false)} />
      <RevokeDialog key={revoking?.code ?? "none"} cert={revoking} student={student} onClose={() => setRevoking(null)} />
    </div>
  );
}

function IssueDialog({ open, student, progress: p, onClose }: { open: boolean; student: Student; progress: Progress; onClose: () => void }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const name = firstName(student.user.name);
  const issue = useMutation({
    mutationFn: () => api.issueCertificate(student.enrollment.id),
    onSuccess: (c) => {
      toast.success(`Certificate ${formatCode(c.code)} issued. ${name} was told in chat.`);
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "invalid_transition") toast.error("This internship already has a certificate. Revoke it first to issue a new one.");
      else toast.error(messageFor(e));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["staff-progress", student.enrollment.id] }),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue a certificate to {student.user.name}?</DialogTitle>
          <DialogDescription>
            It records today&apos;s numbers — {p.done} of {p.released} tasks and {p.points} points — and gets a public verification link. The team lead congratulates{" "}
            {name} in chat.
          </DialogDescription>
        </DialogHeader>
        {p.meets_bar ? (
          <Alert>
            <BadgeCheck className="text-success" aria-hidden />
            <AlertTitle>Past the bar</AlertTitle>
            <AlertDescription>
              {p.completion_percent}% of released tasks are done (bar: {p.bar_percent}%).
            </AlertDescription>
          </Alert>
        ) : (
          <Alert data-testid="below-bar" className="border-warning/50 bg-warning/10">
            <TriangleAlert className="text-warning" aria-hidden />
            <AlertTitle>Below the suggested bar</AlertTitle>
            <AlertDescription>
              Only {p.completion_percent}% of released tasks are done; we suggest {p.bar_percent}%. You can still issue it if you&apos;ve checked their work.
            </AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Not yet
          </Button>
          <Button onClick={() => issue.mutate()} disabled={issue.isPending} data-testid="confirm-issue">
            {issue.isPending ? <Spinner data-icon="inline-start" /> : null}
            Issue certificate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevokeDialog({ cert, student, onClose }: { cert: Certificate | null; student: Student; onClose: () => void }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const revoke = useMutation({
    mutationFn: (c: Certificate) => api.revokeCertificate(c.code, normalizeLine(reason)),
    onSuccess: () => {
      toast.success("Certificate revoked. The verify page now says so.");
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "validation_failed") setError(e.fields.reason ?? messageFor(e));
      else if (e instanceof ApiError && e.code === "invalid_transition") toast.error("This certificate is already revoked.");
      else toast.error(messageFor(e));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["staff-progress", student.enrollment.id] }),
  });
  const submit = () => {
    const r = normalizeLine(reason);
    const err = !r ? "Say why it's being revoked. The verify page shows this." : runeLength(r) > REASON_MAX ? `Keep the reason under ${REASON_MAX} characters.` : null;
    setError(err);
    if (!err && cert) revoke.mutate(cert);
  };
  return (
    <Dialog open={cert !== null} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke certificate {cert ? formatCode(cert.code) : ""}?</DialogTitle>
          <DialogDescription>
            Anyone checking it will see it was revoked, with your reason. This can&apos;t be undone, but you can issue a new certificate afterwards.{" "}
            {cert ? (
              <Link href={certificatePath(cert.code)} target="_blank" className="underline underline-offset-4">
                See the certificate
              </Link>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <form
          id="revoke-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="revoke-reason">Reason (shown publicly)</FieldLabel>
            <Textarea id="revoke-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={!!error} />
            {error ? (
              <FieldError>{error}</FieldError>
            ) : (
              <span className="text-muted-foreground text-xs tabular-nums">
                {runeLength(normalizeLine(reason))} / {REASON_MAX}
              </span>
            )}
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Keep it
          </Button>
          <Button type="submit" form="revoke-form" variant="destructive" disabled={revoke.isPending} data-testid="confirm-revoke">
            {revoke.isPending ? <Spinner data-icon="inline-start" /> : null}
            Revoke
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
