"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, messageFor } from "@/lib/api/errors";
import { type Enrollment, type EnrollmentStatus, type Student } from "@/lib/api/schemas";
import { firstName } from "@/lib/format";
import { STATUS_ACTION, STATUS_LABEL, statusMoves } from "@/lib/people";
import { useSession } from "@/lib/session";

const CONSEQUENCE: Record<EnrollmentStatus, string> = {
  active: "Their board and chats open again, and the team lead tells them.",
  paused: "They keep read access to their board and chats but can't move tasks. The team lead tells them.",
  completed: "This is final. Their internship closes; issue the certificate first if they've earned one.",
  cancelled: "This is final. Their internship closes without a message. They can be enrolled again later.",
};

/** Status badge plus pause / resume / complete / cancel for staff. */
export function InternshipStatus({ student, enrollment }: { student: Student; enrollment: Enrollment }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const [status, setStatus] = useState<EnrollmentStatus>(enrollment.status);
  const [target, setTarget] = useState<EnrollmentStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const moves = statusMoves(status);

  const apply = async (to: EnrollmentStatus) => {
    setBusy(true);
    try {
      const e = await api.setEnrollmentStatus(enrollment.id, to);
      setStatus(e.status);
      toast.success(`${firstName(student.user.name)}'s internship is now ${STATUS_LABEL[e.status].toLowerCase()}`);
      for (const k of ["students", "overview", "cohorts", "colleges", "enrollment-tasks"]) void qc.invalidateQueries({ queryKey: [k] });
      setTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError && err.code === "invalid_transition" ? err.message : messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={moves.length === 0} data-testid="internship-status">
            <span className={status === "active" ? "bg-success size-2 rounded-full" : "bg-muted-foreground size-2 rounded-full"} aria-hidden />
            Status: {STATUS_LABEL[status]}
            {moves.length > 0 ? <ChevronDown data-icon="inline-end" aria-hidden /> : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Internship</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {moves.map((to) => (
            <DropdownMenuItem key={to} variant={to === "cancelled" ? "destructive" : "default"} onSelect={() => setTarget(to)} data-testid={`status-${to}`}>
              {STATUS_ACTION[to]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={target !== null} onOpenChange={(o) => (o ? null : setTarget(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {target ? STATUS_ACTION[target] : ""} for {student.user.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>{target ? CONSEQUENCE[target] : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction
              variant={target === "cancelled" ? "destructive" : "default"}
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (target) void apply(target);
              }}
              data-testid="confirm-status"
            >
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {target ? STATUS_ACTION[target] : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
