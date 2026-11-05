"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Building2, Plus } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { messageFor } from "@/lib/api/errors";
import { type Me } from "@/lib/api/schemas";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { InfoNote } from "../app/info-note";
import { PAGE, PageHeader } from "../app/page-header";
import { EmptyState, ErrorState, ListSkeleton } from "../app/state";
import { AdminShell } from "./admin-shell";
import { splitError } from "./form-errors";
import { useColleges } from "./people-enroll";

export function CollegesScreen() {
  return <AdminShell section="colleges" phone="gate">{(me) => <Colleges me={me} />}</AdminShell>;
}

function Colleges({ me }: { me: Me }) {
  const isAdmin = me.user.role === "admin";
  const colleges = useColleges();
  const [adding, setAdding] = useState(false);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={cn(PAGE, "gap-6")}>
        <PageHeader title="Colleges" description="The institutions you run internships with.">
          {isAdmin ? (
            <Button onClick={() => setAdding(true)} data-testid="open-new-college">
              <Plus data-icon="inline-start" aria-hidden /> Add college
            </Button>
          ) : null}
        </PageHeader>
        <InfoNote id="colleges" title="What a college is for">
          A college groups its students so its placement cell can follow their progress and get the weekly report. Each college can have
          several cohorts (Setup, then Cohorts) and its own college admins (Setup, then People, then Staff). Students who join on their own
          don&apos;t need a college.
        </InfoNote>
        {colleges.isPending ? (
          <ListSkeleton rows={2} className="h-10" />
        ) : colleges.isError ? (
          <ErrorState message={messageFor(colleges.error)} onRetry={() => void colleges.refetch()} />
        ) : colleges.data.length === 0 ? (
          <EmptyState icon={Building2} title="No colleges yet">
            {isAdmin ? "Add a college to give its placement cell a cohort and a college admin." : "A platform admin adds colleges."}
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
      </div>
      {isAdmin ? <NewCollegeDialog key={adding ? "o" : "c"} open={adding} onClose={() => setAdding(false)} /> : null}
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
