"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, TreePine } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { messageFor } from "@/lib/api/errors";
import { type Me } from "@/lib/api/schemas";
import { useSession } from "@/lib/session";

import { AppHeader } from "../app/app-header";
import { RequireSession } from "../app/guard";
import { EmptyState, ErrorState, ListSkeleton } from "../app/state";
import { AttendanceSeats, AttendanceStats, Forest } from "./attendance";

export function AttendanceScreen() {
  return <RequireSession audience="student">{(me) => <AttendanceView me={me} />}</RequireSession>;
}

function AttendanceView({ me }: { me: Me }) {
  const { api } = useSession();
  const q = useQuery({ queryKey: ["attendance"], queryFn: () => api.myAttendance(), enabled: !!me.enrollment, staleTime: 0 });
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader user={me.user}>
        <span className="bg-border hidden h-5 w-px sm:block" aria-hidden />
        <Button asChild variant="ghost" size="sm">
          <Link href={me.enrollment ? "/workspace" : "/"}>
            <ArrowLeft data-icon="inline-start" aria-hidden /> {me.enrollment ? "Workspace" : "Home"}
          </Link>
        </Button>
      </AppHeader>
      <main id="main" className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your attendance</h1>
          <p className="text-muted-foreground mt-1">
            Open Stackstep on a day and you are marked present, with your seat in the order you arrived. Every day present grows a tree.
          </p>
        </div>
        {!me.enrollment ? (
          <EmptyState icon={TreePine} title="Your forest starts on Day 1">
            Once your internship begins, every day you show up plants a tree here.
          </EmptyState>
        ) : q.isPending ? (
          <ListSkeleton rows={4} className="h-24" />
        ) : q.isError ? (
          <ErrorState message={messageFor(q.error)} onRetry={() => void q.refetch()} />
        ) : q.data.days.length === 0 ? (
          <EmptyState icon={TreePine} title="Your forest starts on Day 1">
            Come back tomorrow. Opening Stackstep plants your first tree.
          </EmptyState>
        ) : (
          <>
            <AttendanceStats a={q.data} />
            <Forest a={q.data} />
            <section aria-labelledby="seats-h" className="bg-card rounded-2xl border p-5">
              <h2 id="seats-h" className="mb-4 font-semibold">
                Day by day
              </h2>
              <div className="overflow-x-auto">
                <AttendanceSeats a={q.data} />
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
