"use client";

import { ArrowLeft, CircleCheck, Monitor } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { type Student, type Task } from "@/lib/api/schemas";
import { dueLabel, firstName } from "@/lib/format";

import { AdminShell } from "./admin-shell";
import { AssignTaskForm } from "./assign-task-form";
import { StudentList } from "./students";

/** Phone-friendly task allocation: pick a student, then fill the form. */
export function AssignFlow() {
  const [student, setStudent] = useState<Student | null>(null);
  const [done, setDone] = useState<Task | null>(null);
  return (
    <AdminShell section="assign" phone="allow">
      {() => (
          <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col">
            {student === null ? (
              <>
                <div className="px-4 pt-4">
                  <Alert>
                    <Monitor aria-hidden />
                    <AlertTitle>Assigning on the go</AlertTitle>
                    <AlertDescription>Flows, the task library and reviews are in the desktop console. Replies to students are in Inbox.</AlertDescription>
                  </Alert>
                  <h1 className="mt-6 text-lg font-semibold">Who is this task for?</h1>
                </div>
                <StudentList selectedId={null} onSelect={(s) => setStudent(s)} />
              </>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <Button variant="ghost" size="sm" className="-ml-2 mb-3" onClick={() => setStudent(null)}>
                  <ArrowLeft data-icon="inline-start" aria-hidden /> All students
                </Button>
                <h1 className="text-xl font-semibold">Assign to {student.user.name}</h1>
                <p className="text-muted-foreground mb-6 text-sm">
                  Day {student.enrollment.day_number} of {student.enrollment.program.days} · {student.open_tasks} open · {student.in_review} in review
                </p>
                {done ? (
                  <Alert className="mb-6" data-testid="assign-success">
                    <CircleCheck aria-hidden />
                    <AlertTitle>Assigned “{done.title}”</AlertTitle>
                    <AlertDescription>
                      {firstName(student.user.name)} sees it on their board, with an announcement in chat. {dueLabel(done.due_at, new Date())}.
                    </AlertDescription>
                  </Alert>
                ) : null}
                <AssignTaskForm student={student} onAssigned={setDone} />
              </div>
            )}
          </div>
      )}
    </AdminShell>
  );
}
