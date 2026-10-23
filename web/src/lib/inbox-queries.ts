"use client";

import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { type Frame, type StaffThreadPage, type Thread } from "./api/schemas";
import { applyMessage, clearUnread, type ChatTarget } from "./inbox";
import { useFrames } from "./realtime-context";
import { useSession } from "./session";

export const studentThreadsKey = ["threads"] as const;
export const staffThreadsKey = (unreadOnly: boolean) => ["staff-threads", { unreadOnly }] as const;
export const personasKey = ["personas"] as const;

/** The student's conversations, kept live from socket frames. */
export function useStudentThreads() {
  const { api } = useSession();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: studentThreadsKey, queryFn: () => api.threads() });
  useFrames(
    useCallback(
      (f: Frame) => {
        if (f.type === "ready") {
          void qc.invalidateQueries({ queryKey: studentThreadsKey });
          return;
        }
        if (f.type !== "message") return;
        const list = qc.getQueryData<Thread[]>(studentThreadsKey);
        if (!list) return;
        const next = applyMessage(list, f.message, false);
        if (next === null) void qc.invalidateQueries({ queryKey: studentThreadsKey });
        else if (next !== list) qc.setQueryData(studentThreadsKey, next);
      },
      [qc],
    ),
  );
  return q;
}

/** The staff inbox, paged and kept live. */
export function useStaffThreads(unreadOnly: boolean) {
  const { api } = useSession();
  const qc = useQueryClient();
  const key = staffThreadsKey(unreadOnly);
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => api.staffThreads({ unreadOnly, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });
  useFrames(
    useCallback(
      (f: Frame) => {
        if (f.type === "ready") {
          void qc.invalidateQueries({ queryKey: ["staff-threads"] });
          return;
        }
        if (f.type !== "message") return;
        let missing = false;
        qc.setQueriesData<InfiniteData<StaffThreadPage, string | null>>({ queryKey: ["staff-threads"] }, (data) => {
          if (!data) return data;
          const flat = data.pages.flatMap((p) => p.items);
          const next = applyMessage(flat, f.message, true);
          if (next === null) {
            missing = true;
            return data;
          }
          if (next === flat) return data;
          // Keep page boundaries: the moved thread goes to the first page.
          const sizes = data.pages.map((p) => p.items.length);
          let at = 0;
          return { ...data, pages: data.pages.map((p, i) => ({ ...p, items: next.slice(at, (at += sizes[i] ?? 0)) })) };
        });
        if (missing) void qc.invalidateQueries({ queryKey: ["staff-threads"] });
      },
      [qc],
    ),
  );
  return q;
}

/** Clears a thread's badge in every cached list after the server recorded the read. */
export function clearUnreadInCache(qc: QueryClient, target: ChatTarget): void {
  if (target.enrollmentId === null) {
    qc.setQueryData<Thread[]>(studentThreadsKey, (list) => (list ? clearUnread(list, target) : list));
    return;
  }
  qc.setQueriesData<InfiniteData<StaffThreadPage, string | null>>({ queryKey: ["staff-threads"] }, (data) =>
    data ? { ...data, pages: data.pages.map((p) => ({ ...p, items: clearUnread(p.items, target) })) } : data,
  );
}

/** Active personas for pickers. */
export function usePersonas() {
  const { api } = useSession();
  return useQuery({ queryKey: personasKey, queryFn: () => api.personas(false), staleTime: 60_000 });
}
