"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Search, UserSearch } from "lucide-react";
import { useDeferredValue, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { messageFor } from "@/lib/api/errors";
import { type Student } from "@/lib/api/schemas";
import { initials } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { normalizeLineSafe } from "./util";
import { Bounds } from "@/lib/validation";

import { EmptyState, ErrorState } from "../app/state";
import { RowsSkeleton, stagger } from "../app/loading";

export function useStudents(query: string) {
  const { api } = useSession();
  return useInfiniteQuery({
    queryKey: ["students", query],
    queryFn: ({ pageParam }) => api.students(query, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });
}

export function StudentList({ selectedId, onSelect }: { selectedId: string | null; onSelect: (s: Student) => void }) {
  const [raw, setRaw] = useState("");
  const query = useDeferredValue(normalizeLineSafe(raw));
  const q = useStudents(query);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-3">
        <InputGroup>
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            value={raw}
            maxLength={Bounds.searchMax}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Search name or GitHub login"
            aria-label="Search students"
            type="search"
          />
          {q.isFetching && !q.isFetchingNextPage ? (
            <InputGroupAddon align="inline-end">
              <Spinner />
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {q.isPending ? (
          <RowsSkeleton rows={6} />
        ) : q.isError ? (
          <ErrorState message={messageFor(q.error)} onRetry={() => void q.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon={UserSearch} title={query ? `No students match “${query}”` : "No students yet"}>
            {query ? "Check the spelling, or search by GitHub login." : "Students appear here once they join a cohort you manage."}
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-1" aria-label="Students">
            {items.map((s, i) => (
              <li key={s.user.id} className="animate-enter-stagger" style={stagger(i)}>
                <StudentRow student={s} selected={s.user.id === selectedId} onSelect={() => onSelect(s)} />
              </li>
            ))}
          </ul>
        )}
        {q.hasNextPage ? (
          <Button variant="ghost" className="mt-2 w-full" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            {q.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null} Load more
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function StudentRow({ student: s, selected, onSelect }: { student: Student; selected: boolean; onSelect: () => void }) {
  const active = s.enrollment.status === "active";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      data-testid={`student-${s.user.github_login}`}
      className={cn(
        "hover:bg-muted flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors outline-none focus-visible:ring-2",
        selected && "bg-muted",
      )}
    >
      <Avatar>
        {s.user.avatar_url ? <AvatarImage src={s.user.avatar_url} alt="" /> : null}
        <AvatarFallback>{initials(s.user.name, s.user.github_login)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{s.user.name}</span>
        <span className="text-muted-foreground block truncate text-xs">
          @{s.user.github_login} · Day {s.enrollment.day_number}/{s.enrollment.program.days}
        </span>
      </span>
      {!active ? (
        <Badge variant="secondary" className="capitalize">
          {s.enrollment.status}
        </Badge>
      ) : s.in_review > 0 ? (
        <Badge className="bg-warning/14 text-warning" title={`${s.in_review} waiting for review`}>
          {s.in_review} to review
        </Badge>
      ) : (
        <span className="text-muted-foreground text-xs tabular-nums">{s.open_tasks} open</span>
      )}
    </button>
  );
}
