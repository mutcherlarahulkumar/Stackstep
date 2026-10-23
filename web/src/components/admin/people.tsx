"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CircleAlert, Plus, ShieldCheck, ShieldOff, UserCog, Users } from "lucide-react";
import { useId, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, messageFor } from "@/lib/api/errors";
import { type CohortKind, type Me, type StaffMember } from "@/lib/api/schemas";
import { normalizeLogin, TIMEZONES, todayISO, validLogin } from "@/lib/people";
import { useSession } from "@/lib/session";

import { EmptyState, ErrorState, ListSkeleton } from "../app/state";
import { AdminShell } from "./admin-shell";
import { splitError } from "./form-errors";
import { EnrollPanel, useCohorts, useColleges, usePrograms } from "./people-enroll";

type Tab = "enroll" | "cohorts" | "staff";

export function PeopleScreen() {
  return <AdminShell section="people" phone="gate">{(me) => <People me={me} />}</AdminShell>;
}

function People({ me }: { me: Me }) {
  const isAdmin = me.user.role === "admin";
  const [tab, setTab] = useState<Tab>("enroll");
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
        <div>
          <h1 className="text-xl font-semibold">People</h1>
          <p className="text-muted-foreground text-sm">
            {isAdmin ? "Enroll students, set up colleges and cohorts, and manage who has admin access." : "Enroll students into your college's cohorts."}
          </p>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v === "cohorts" || v === "staff" ? v : "enroll")} className="gap-6">
          <TabsList>
            <TabsTrigger value="enroll">
              <Users aria-hidden /> Enroll
            </TabsTrigger>
            <TabsTrigger value="cohorts">
              <Building2 aria-hidden /> Colleges &amp; cohorts
            </TabsTrigger>
            {isAdmin ? (
              <TabsTrigger value="staff">
                <UserCog aria-hidden /> Staff
              </TabsTrigger>
            ) : null}
          </TabsList>
          <TabsContent value="enroll">
            <EnrollPanel me={me} />
          </TabsContent>
          <TabsContent value="cohorts">
            <CohortsPanel isAdmin={isAdmin} />
          </TabsContent>
          {isAdmin ? (
            <TabsContent value="staff">
              <StaffPanel me={me} />
            </TabsContent>
          ) : null}
        </Tabs>
      </div>
    </div>
  );
}

// ---- Colleges and cohorts ----

function CohortsPanel({ isAdmin }: { isAdmin: boolean }) {
  const colleges = useColleges();
  const cohorts = useCohorts();
  const [newCollege, setNewCollege] = useState(false);
  const [newCohort, setNewCohort] = useState(false);
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="colleges-h" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="colleges-h" className="text-base font-semibold">
            Colleges
          </h2>
          {isAdmin ? (
            <Button size="sm" variant="outline" onClick={() => setNewCollege(true)} data-testid="open-new-college">
              <Plus data-icon="inline-start" aria-hidden /> Add college
            </Button>
          ) : null}
        </div>
        {colleges.isPending ? (
          <ListSkeleton rows={2} className="h-10" />
        ) : colleges.isError ? (
          <ErrorState message={messageFor(colleges.error)} onRetry={() => void colleges.refetch()} />
        ) : colleges.data.length === 0 ? (
          <EmptyState icon={Building2} title="No colleges yet">
            Add a college to give its placement cell a cohort and a college admin.
          </EmptyState>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>College</TableHead>
                  <TableHead className="text-right">Students</TableHead>
                  <TableHead className="text-right">Cohorts</TableHead>
                  <TableHead className="text-right">College admins</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {colleges.data.map((c) => (
                  <TableRow key={c.id} data-testid={`college-${c.name}`}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.students}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.cohorts}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.college_admins}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section aria-labelledby="cohorts-h" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="cohorts-h" className="text-base font-semibold">
            Cohorts
          </h2>
          {isAdmin ? (
            <Button size="sm" variant="outline" onClick={() => setNewCohort(true)} data-testid="open-new-cohort">
              <Plus data-icon="inline-start" aria-hidden /> Add cohort
            </Button>
          ) : null}
        </div>
        {cohorts.isPending ? (
          <ListSkeleton rows={2} className="h-10" />
        ) : cohorts.isError ? (
          <ErrorState message={messageFor(cohorts.error)} onRetry={() => void cohorts.refetch()} />
        ) : cohorts.data.length === 0 ? (
          <EmptyState icon={Users} title="No cohorts yet">
            {isAdmin ? "A cohort is a batch of students on one program with a seat limit." : "A platform admin creates cohorts for your college."}
          </EmptyState>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cohort</TableHead>
                  <TableHead>College</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Starts</TableHead>
                  <TableHead className="w-56">Seats</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cohorts.data.map((c) => {
                  const pct = Math.round((c.seats_used / c.seats_total) * 100);
                  return (
                    <TableRow key={c.id} data-testid={`cohort-${c.name}`}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">{c.college_name ?? <Badge variant="outline">Group</Badge>}</TableCell>
                      <TableCell>{c.program.slug}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{c.start_date}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={pct} className="w-24" aria-label={`${c.seats_used} of ${c.seats_total} seats used`} />
                          <span className="text-xs tabular-nums">
                            {c.seats_used}/{c.seats_total}
                          </span>
                          {c.seats_used >= c.seats_total ? <Badge variant="outline">Full</Badge> : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      {isAdmin ? <NewCollegeDialog key={newCollege ? "o" : "c"} open={newCollege} onClose={() => setNewCollege(false)} /> : null}
      {isAdmin ? <NewCohortDialog key={newCohort ? "o2" : "c2"} open={newCohort} onClose={() => setNewCohort(false)} /> : null}
    </div>
  );
}

function NewCollegeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const id = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (name.trim().length < 2) {
      setError("Give the college a name (at least 2 characters).");
      return;
    }
    setBusy(true);
    try {
      const c = await api.createCollege(name.trim());
      toast.success(`Added ${c.name}`);
      void qc.invalidateQueries({ queryKey: ["colleges"] });
      onClose();
    } catch (e) {
      const { fields, form } = splitError(e);
      setError(fields.name ?? form);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a college</DialogTitle>
          <DialogDescription>Then add a cohort for it and make someone from its placement cell a college admin.</DialogDescription>
        </DialogHeader>
        <form
          id={`${id}-f`}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor={`${id}-name`}>College name</FieldLabel>
            <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!error} autoFocus />
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={`${id}-f`} disabled={busy} data-testid="college-save">
            {busy ? <Spinner data-icon="inline-start" /> : null} Add college
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
                <Input id={`${id}-start`} type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-invalid={!!errors.start_date} />
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

// ---- Staff ----

function StaffPanel({ me }: { me: Me }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const staff = useQuery({ queryKey: ["staff"], queryFn: () => api.staff() });
  const [adding, setAdding] = useState(false);
  const [revoking, setRevoking] = useState<StaffMember | null>(null);
  const [busy, setBusy] = useState(false);
  const revoke = async (m: StaffMember) => {
    setBusy(true);
    try {
      await api.revokeStaff(m.user.id);
      toast.success(`@${m.user.github_login} no longer has admin access`);
      void qc.invalidateQueries({ queryKey: ["staff"] });
      void qc.invalidateQueries({ queryKey: ["colleges"] });
      setRevoking(null);
    } catch (e) {
      toast.error(e instanceof ApiError && e.code === "invalid_transition" ? e.message : messageFor(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="staff-h" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 id="staff-h" className="text-base font-semibold">
            Staff
          </h2>
          <p className="text-muted-foreground text-sm">Platform admins run everything. College admins see and manage only their college&apos;s students.</p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)} data-testid="open-add-staff">
          <Plus data-icon="inline-start" aria-hidden /> Add staff
        </Button>
      </div>
      {staff.isPending ? (
        <ListSkeleton rows={3} className="h-10" />
      ) : staff.isError ? (
        <ErrorState message={messageFor(staff.error)} onRetry={() => void staff.refetch()} />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>College</TableHead>
                <TableHead>GitHub linked</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.data.map((m) => (
                <TableRow key={m.user.id} data-testid={`staff-${m.user.github_login}`}>
                  <TableCell>
                    <span className="block font-medium">{m.user.name}</span>
                    <span className="text-muted-foreground text-xs">@{m.user.github_login}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.user.role === "admin" ? "default" : "outline"}>{m.user.role === "admin" ? "Admin" : "College admin"}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.college_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{m.signed_in ? "Yes" : "Not yet"}</TableCell>
                  <TableCell className="text-right">
                    {m.user.id === me.user.id ? (
                      <span className="text-muted-foreground text-xs">You</span>
                    ) : (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRevoking(m)}>
                        <ShieldOff data-icon="inline-start" aria-hidden /> Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <AddStaffDialog key={adding ? "open" : "closed"} open={adding} onClose={() => setAdding(false)} />
      <AlertDialog open={revoking !== null} onOpenChange={(o) => (o ? null : setRevoking(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke access for @{revoking?.user.github_login}?</AlertDialogTitle>
            <AlertDialogDescription>They lose the admin console on their next click. You can add them back any time.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (revoking) void revoke(revoking);
              }}
              disabled={busy}
              data-testid="confirm-revoke-staff"
            >
              {busy ? <Spinner data-icon="inline-start" /> : null} Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function AddStaffDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const colleges = useColleges();
  const id = useId();
  const [login, setLogin] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "college_admin">("college_admin");
  const [collegeId, setCollegeId] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const e: Record<string, string | undefined> = {};
    if (!validLogin(login)) e.github_login = "Enter a GitHub username.";
    if (role === "college_admin" && !collegeId) e.college_id = "Pick the college they manage.";
    setErrors(e);
    setFormError(null);
    if (Object.values(e).some(Boolean)) return;
    setBusy(true);
    try {
      const m = await api.grantStaff({ github_login: normalizeLogin(login), name: name.trim() || undefined }, role, role === "college_admin" ? collegeId : null);
      toast.success(`@${m.user.github_login} is now ${m.user.role === "admin" ? "an admin" : `a college admin for ${m.college_name ?? "their college"}`}`, {
        description: m.signed_in ? undefined : "They get access the first time they sign in with GitHub.",
      });
      void qc.invalidateQueries({ queryKey: ["staff"] });
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" aria-hidden /> Add staff
          </DialogTitle>
          <DialogDescription>By GitHub username. If they already use Stackstep as a student, finish or cancel their internship first.</DialogDescription>
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
                <AlertTitle>Couldn&apos;t add them</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}
            <Field data-invalid={!!errors.github_login}>
              <FieldLabel htmlFor={`${id}-login`}>GitHub username</FieldLabel>
              <Input id={`${id}-login`} value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off" spellCheck={false} aria-invalid={!!errors.github_login} />
              {errors.github_login ? <FieldError>{errors.github_login}</FieldError> : null}
            </Field>
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor={`${id}-name`}>Name (optional)</FieldLabel>
              <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
              {errors.name ? <FieldError>{errors.name}</FieldError> : null}
            </Field>
            <Field data-invalid={!!errors.role}>
              <FieldLabel htmlFor={`${id}-role`}>Role</FieldLabel>
              <Select value={role} onValueChange={(v) => setRole(v === "admin" ? "admin" : "college_admin")}>
                <SelectTrigger id={`${id}-role`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="college_admin">College admin — their college only</SelectItem>
                  <SelectItem value="admin">Platform admin — everything</SelectItem>
                </SelectContent>
              </Select>
              {errors.role ? <FieldError>{errors.role}</FieldError> : null}
            </Field>
            {role === "college_admin" ? (
              <Field data-invalid={!!errors.college_id}>
                <FieldLabel htmlFor={`${id}-college`}>College</FieldLabel>
                <Select value={collegeId} onValueChange={setCollegeId}>
                  <SelectTrigger id={`${id}-college`} className="w-full" aria-invalid={!!errors.college_id}>
                    <SelectValue placeholder="Pick a college" />
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
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={`${id}-f`} disabled={busy} data-testid="staff-save">
            {busy ? <Spinner data-icon="inline-start" /> : null} Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
