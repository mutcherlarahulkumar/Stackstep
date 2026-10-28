"use client";

import { MousePointerClick, Users } from "lucide-react";
import { useState } from "react";

import { type Student } from "@/lib/api/schemas";

import { EmptyState } from "../app/state";
import { InfoNote } from "../app/info-note";
import { AdminShell } from "./admin-shell";
import { StudentDetail } from "./review";
import { StudentList } from "./students";

export function AdminConsole() {
  const [selected, setSelected] = useState<Student | null>(null);
  return (
    <AdminShell section="students" phone="gate">
      {() => (
        <div className="flex min-h-0 flex-1">
          <aside aria-label="Students" className="flex w-88 shrink-0 flex-col border-r">
            <h2 className="flex h-11 items-center gap-2 border-b px-4 text-sm font-medium">
              <Users className="text-muted-foreground size-4" aria-hidden /> Students
            </h2>
            <StudentList selectedId={selected?.user.id ?? null} onSelect={setSelected} />
          </aside>
          <section aria-label="Student detail" className="flex min-w-0 flex-1 flex-col">
            {selected ? (
              <StudentDetail key={selected.user.id} student={selected} />
            ) : (
              <div className="flex flex-1 flex-col gap-6 p-6">
                <InfoNote id="students" title="Your students">
                  Everyone with an internship you manage is listed on the left. Pick a student to see their task board, open what they handed
                  in, assign the next task or a whole flow, and change their internship status. Students who are still applying are under
                  Applications.
                </InfoNote>
                <div className="flex flex-1 items-center justify-center">
                  <EmptyState icon={MousePointerClick} title="Pick a student">
                    See their board, review submitted work, assign a flow or the next task.
                  </EmptyState>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </AdminShell>
  );
}
