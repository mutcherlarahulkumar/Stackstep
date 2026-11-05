"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Plus, Users } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, messageFor } from "@/lib/api/errors";
import { type Cohort, type CohortKind, type Me } from "@/lib/api/schemas";
import { applyErrorMessage, inr } from "@/lib/apply";
import { TIMEZONES, todayISO } from "@/lib/people";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { DatePicker } from "../app/date-picker";
import { InfoNote } from "../app/info-note";
import { PAGE, PageHeader } from "../app/page-header";
import { EmptyState, ErrorState, ListSkeleton } from "../app/state";
import { AdminShell } from "./admin-shell";
import { splitError } from "./form-errors";
import { useCohorts, useColleges, usePrograms } from "./people-enroll";

export function CohortsScreen() {
  return <AdminShell section="cohorts" phone="gate">{(me) => <Cohorts me={me} />}</AdminShell>;
}

function Cohorts({ me }: { me: Me }) {
  const isAdmin = me.user.role === "admin";
  const cohorts = useCohorts();
  const [adding, setAdding] = useState(false);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={cn(PAGE, "gap-6")}>
        <PageHeader title="Cohorts" description="Batches of students who start together.">
          {isAdmin ? (
            <Button onClick={() => setAdding(true)} data-testid="open-new-cohort">
              <Plus data-icon="inline-start" aria-hidden /> Add cohort
            </Button>
          ) : null}
        </PageHeader>
        <InfoNote id="cohorts" title="What a cohort is">
          A cohort is one batch of students on one program (30 or 60 days) with a start date and a seat limit. It can belong to a college or be
          an independent group. Give it a fee and switch on &quot;Taking applications&quot; to let students apply and pay for it from the
          application form. Students you enroll by hand (Setup, then People) don&apos;t pay through Stackstep.
        </InfoNote>
        {cohorts.isPending ? (
          <ListSkeleton rows={3} className="h-12" />
        ) : cohorts.isError ? (
          <ErrorState message={messageFor(cohorts.error)} onRetry={() => void cohorts.refetch()} />
        ) : cohorts.data.length === 0 ? (
          <EmptyState icon={Users} title="No cohorts yet">
            {isAdmin ? "Add a cohort to start enrolling students or taking applications." : "A platform admin creates cohorts for your college."}
          </EmptyState>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cohort</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Starts</TableHead>
                  <TableHead className="w-48">Seats</TableHead>
                  <TableHead className="w-36">Fee (₹)</TableHead>
                  <TableHead className="w-28">Applications</TableHead>
                  {isAdmin ? <TableHead className="w-20" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {cohorts.data.map((c) => (
                  <CohortRow key={`${c.id}-${c.fee_inr ?? 0}-${c.applications_open}`} cohort={c} editable={isAdmin} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      {isAdmin ? <NewCohortDialog key={adding ? "o" : "c"} open={adding} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

function CohortRow({ cohort: c, editable }: { cohort: Cohort; editable: boolean }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const [fee, setFee] = useState(c.fee_inr ? String(c.fee_inr) : "");
  const [open, setOpen] = useState(c.applications_open);
  const [error, setError] = useState<string | null>(null);
  const dirty = fee !== (c.fee_inr ? String(c.fee_inr) : "") || open !== c.applications_open;
  const pct = Math.round((c.seats_used / c.seats_total) * 100);
  const save = useMutation({
    mutationFn: () => api.setCohortAdmissions(c.id, fee.trim() ? Number(fee) : null, open),
    onSuccess: (x) => {
      toast.success(x.applications_open ? `${x.name} is taking applications at ${x.fee_inr ? inr(x.fee_inr) : "no fee"}` : `Saved ${x.name}`);
      void qc.invalidateQueries({ queryKey: ["cohorts"] });
    },
    onError: (e) => setError(e instanceof ApiError && e.code === "validation_failed" ? (Object.values(e.fields)[0] ?? applyErrorMessage(e)) : applyErrorMessage(e)),
  });
  const submit = () => {
    const n = Number(fee);
    if (fee.trim() && (!Number.isInteger(n) || n < 1)) return setError("Enter the fee in whole rupees.");
    if (open && !fee.trim()) return setError("Set a fee before taking applications.");
    setError(null);
    save.mutate();
  };
  return (
    <TableRow data-testid={`cohort-${c.name}`}>
      <TableCell className="font-medium">
        {c.name}
        <span className="text-muted-foreground block text-xs font-normal">{c.college_name ?? "Independent group"}</span>
        {error ? (
          <span className="text-destructive block text-xs font-normal" role="alert">
            {error}
          </span>
        ) : null}
      </TableCell>
      <TableCell>{c.program.days} days</TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">{c.start_date}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Progress value={pct} className="w-20" aria-label={`${c.seats_used} of ${c.seats_total} seats used`} />
          <span className="text-xs tabular-nums">
            {c.seats_used}/{c.seats_total}
          </span>
          {c.seats_used >= c.seats_total ? <Badge variant="outline">Full</Badge> : null}
        </div>
      </TableCell>
      <TableCell>
        {editable ? (
          <Input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="numeric" placeholder="No fee" aria-label={`Fee for ${c.name}`} className="h-8" data-testid="admission-fee" />
        ) : (
          <span className="tabular-nums">{c.fee_inr ? inr(c.fee_inr) : "No fee"}</span>
        )}
      </TableCell>
      <TableCell>
        {editable ? (
          <Switch checked={open} onCheckedChange={setOpen} aria-label={`${c.name} taking applications`} data-testid="admission-open" />
        ) : (
          <span>{c.applications_open ? "Open" : "Closed"}</span>
        )}
      </TableCell>
      {editable ? (
        <TableCell>
          <Button size="sm" variant={dirty ? "default" : "ghost"} disabled={!dirty || save.isPending} onClick={submit} data-testid="admission-save">
            {save.isPending ? <Spinner /> : "Save"}
          </Button>
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function NewCohortDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const colleges = useColleges();
  const programs = usePrograms();
  const id = useId();
  const [kind, setKind] = useState<CohortKind>("college");
  const [name, setName] = useState("");
  const [collegeId, setCollegeId] = useState("");
  const [program, setProgram] = useState("");
  const [start, setStart] = useState(todayISO());
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [seats, setSeats] = useState("60");
  const [fee, setFee] = useState("");
  const [open_, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const e: Record<string, string | undefined> = {};
    const n = Number(seats);
    if (name.trim().length < 2) e.name = "Give the cohort a name (at least 2 characters).";
    if (kind === "college" && !collegeId) e.college_id = "Pick the college.";
    if (!program) e.program_slug = "Pick a program.";
    if (!start) e.start_date = "Pick a start date.";
    if (!Number.isInteger(n) || n < 1 || n > 100000) e.seats_total = "Seats must be 1 to 100000.";
    const feeN = Number(fee);
    if (fee.trim() && (!Number.isInteger(feeN) || feeN < 1)) e.fee_inr = "Enter the fee in whole rupees, or leave it empty.";
    if (open_ && !fee.trim()) e.fee_inr = "Set a fee to take applications.";
    setErrors(e);
    setFormError(null);
    if (Object.values(e).some(Boolean)) return;
    setBusy(true);
    try {
      const c = await api.createCohort({
        kind,
        name: name.trim(),
        college_id: kind === "college" ? collegeId : null,
        program_slug: program,
        start_date: start,
        timezone,
        seats_total: n,
      });
      // The fee and admissions are saved right after the cohort itself.
      if (fee.trim()) await api.setCohortAdmissions(c.id, Number(fee), open_);
      toast.success(`Added ${c.name}`);
      void qc.invalidateQueries({ queryKey: ["cohorts"] });
      void qc.invalidateQueries({ queryKey: ["colleges"] });
      onClose();
    } catch (err) {
      const { fields, form } = splitError(err);
      setErrors(fields);
      setFormError(form);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a cohort</DialogTitle>
          <DialogDescription>A batch of students on one program, with a seat limit. Enrollments default to its start date.</DialogDescription>
        </DialogHeader>
        <form
          id={`${id}-f`}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <FieldGroup>
            {formError ? (
              <Alert variant="destructive">
                <CircleAlert aria-hidden />
                <AlertTitle>Couldn&apos;t add the cohort</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
              <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="ANITS Batch 2" aria-invalid={!!errors.name} />
              {errors.name ? <FieldError>{errors.name}</FieldError> : null}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${id}-kind`}>Type</FieldLabel>
                <Select value={kind} onValueChange={(v) => setKind(v === "group" ? "group" : "college")}>
                  <SelectTrigger id={`${id}-kind`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="college">College cohort</SelectItem>
                    <SelectItem value="group">Independent group</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {kind === "college" ? (
                <Field data-invalid={!!errors.college_id}>
                  <FieldLabel htmlFor={`${id}-college`}>College</FieldLabel>
                  <Select value={collegeId} onValueChange={setCollegeId}>
                    <SelectTrigger id={`${id}-college`} className="w-full" aria-invalid={!!errors.college_id}>
                      <SelectValue placeholder={colleges.isPending ? "Loading…" : "Pick a college"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(colleges.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.college_id ? <FieldError>{errors.college_id}</FieldError> : null}
                </Field>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.program_slug}>
                <FieldLabel htmlFor={`${id}-program`}>Program</FieldLabel>
                <Select value={program} onValueChange={setProgram}>
                  <SelectTrigger id={`${id}-program`} className="w-full" aria-invalid={!!errors.program_slug}>
                    <SelectValue placeholder="Pick a program" />
                  </SelectTrigger>
                  <SelectContent>
                    {(programs.data ?? []).map((p) => (
                      <SelectItem key={p.slug} value={p.slug}>
                        {p.slug} · {p.days} days
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.program_slug ? <FieldError>{errors.program_slug}</FieldError> : null}
              </Field>
              <Field data-invalid={!!errors.seats_total}>
                <FieldLabel htmlFor={`${id}-seats`}>Seats</FieldLabel>
                <Input id={`${id}-seats`} inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value)} aria-invalid={!!errors.seats_total} />
                {errors.seats_total ? <FieldError>{errors.seats_total}</FieldError> : null}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.start_date}>
                <FieldLabel htmlFor={`${id}-start`}>Start date</FieldLabel>
                <DatePicker id={`${id}-start`} value={start} onChange={setStart} invalid={!!errors.start_date} />
                {errors.start_date ? <FieldError>{errors.start_date}</FieldError> : null}
              </Field>
              <Field data-invalid={!!errors.timezone}>
                <FieldLabel htmlFor={`${id}-tz`}>Time zone</FieldLabel>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger id={`${id}-tz`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((z) => (
                      <SelectItem key={z} value={z}>
                        {z}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.timezone ? <FieldError>{errors.timezone}</FieldError> : <FieldDescription>Used to check the start date.</FieldDescription>}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.fee_inr}>
                <FieldLabel htmlFor={`${id}-fee`}>Fee in rupees (optional)</FieldLabel>
                <Input id={`${id}-fee`} inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="4999" aria-invalid={!!errors.fee_inr} data-testid="cohort-fee" />
                {errors.fee_inr ? <FieldError>{errors.fee_inr}</FieldError> : <FieldDescription>Only for cohorts students pay to join.</FieldDescription>}
              </Field>
              <Field orientation="horizontal" className="self-center">
                <Switch id={`${id}-open`} checked={open_} onCheckedChange={setOpen} data-testid="cohort-open" />
                <FieldLabel htmlFor={`${id}-open`} className="font-normal">
                  Taking applications now
                </FieldLabel>
              </Field>
            </div>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={`${id}-f`} disabled={busy} data-testid="cohort-save">
            {busy ? <Spinner data-icon="inline-start" /> : null} Add cohort
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
