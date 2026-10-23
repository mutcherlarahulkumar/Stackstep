"use client";

import { MousePointerClick, Users } from "lucide-react";
import { useState } from "react";

import { type Student } from "@/lib/api/schemas";

import { AppHeader } from "../app/app-header";
import { RequireSession } from "../app/guard";
import { EmptyState } from "../app/state";
import { DesktopGate } from "./desktop-gate";
import { StudentDetail } from "./review";
import { StudentList } from "./students";
import { useIsDesktop } from "./use-desktop";

export function AdminConsole() {
  const desktop = useIsDesktop();
  const [selected, setSelected] = useState<Student | null>(null);
  return (
    <RequireSession audience="staff">
      {(me) => (
        <div className="flex h-dvh flex-col">
          <AppHeader user={me.user}>
            <span className="text-muted-foreground hidden text-sm sm:inline">{me.user.role === "admin" ? "Admin console" : "Placement cell"}</span>
          </AppHeader>
          <main id="main" className="flex min-h-0 flex-1">
            {desktop === null ? null : desktop ? (
              <>
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
                    <div className="flex flex-1 items-center justify-center">
                      <EmptyState icon={MousePointerClick} title="Pick a student">
                        See their board, review submitted work, and assign the next task.
                      </EmptyState>
                    </div>
                  )}
                </section>
              </>
            ) : (
              <DesktopGate />
            )}
          </main>
        </div>
      )}
    </RequireSession>
  );
}
