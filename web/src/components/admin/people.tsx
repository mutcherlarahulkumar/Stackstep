"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Plus, ShieldCheck, ShieldOff, UserCog, Users } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, messageFor } from "@/lib/api/errors";
import { type Me, type StaffMember } from "@/lib/api/schemas";
import { normalizeLogin, validLogin } from "@/lib/people";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { PAGE, PageHeader } from "../app/page-header";
import { InfoNote } from "../app/info-note";
import { ErrorState, ListSkeleton } from "../app/state";
import { AdminShell } from "./admin-shell";
import { splitError } from "./form-errors";
import { EnrollPanel, useColleges } from "./people-enroll";

type Tab = "enroll" | "staff";

export function PeopleScreen() {
  return <AdminShell section="people" phone="gate">{(me) => <People me={me} />}</AdminShell>;
}

function People({ me }: { me: Me }) {
  const isAdmin = me.user.role === "admin";
  const [tab, setTab] = useState<Tab>("enroll");
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={cn(PAGE, "gap-6")}>
        <PageHeader title="People" description={isAdmin ? "Add students to a cohort and decide who can run the console." : "Add students to your college's cohorts."} />
        <Tabs value={tab} onValueChange={(v) => setTab(v === "staff" ? "staff" : "enroll")} className="gap-6">
          <TabsList>
            <TabsTrigger value="enroll">
              <Users aria-hidden /> Enroll students
            </TabsTrigger>
            {isAdmin ? (
              <TabsTrigger value="staff">
                <UserCog aria-hidden /> Staff
              </TabsTrigger>
            ) : null}
          </TabsList>
          <TabsContent value="enroll" className="flex flex-col gap-6">
            <InfoNote id="people-enroll" title="Enroll students by hand">
              Use this when a college sends you a list, or to add someone without the application form. Enter a GitHub login (or upload a
              CSV of them), pick a cohort and an optional flow, and the internship starts on the cohort&apos;s start date. Students enrolled
              here skip the payment step. Students who apply and pay themselves show up under Applications instead.
            </InfoNote>
            <EnrollPanel me={me} />
          </TabsContent>
          {isAdmin ? (
            <TabsContent value="staff" className="flex flex-col gap-6">
              <InfoNote id="people-staff" title="Who can run Stackstep">
                Admins see and change everything. College admins see only their own college&apos;s students, applications and reports.
                Mentors reply in chats and review work as the personas.
              </InfoNote>
              <StaffPanel me={me} />
            </TabsContent>
          ) : null}
        </Tabs>
      </div>
    </div>
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
      toast.error(
        e instanceof ApiError && e.code === "invalid_transition"
          ? m.user.id === me.user.id
            ? "You can't remove your own admin access."
            : "There must always be at least one platform admin."
          : messageFor(e),
      );
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
                  <TableCell className="text-muted-foreground">{m.college_name ?? "All colleges"}</TableCell>
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
                  <SelectItem value="college_admin">College admin, their college only</SelectItem>
                  <SelectItem value="admin">Platform admin, everything</SelectItem>
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
