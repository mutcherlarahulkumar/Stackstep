"use client";

import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { type Frame, type Mail, type MailPage } from "./api/schemas";
import { useFrames } from "./realtime-context";
import { useSession } from "./session";

export const mailKey = ["mail"] as const;

/** The mailbox, paged. A new letter over the socket refetches it and says so. */
export function useMailbox() {
  const { api } = useSession();
  return useInfiniteQuery({
    queryKey: mailKey,
    queryFn: ({ pageParam }) => api.myMail(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });
}

/** Unread letters, for the header badge. */
export function useUnreadMail(): number {
  const q = useMailbox();
  return q.data?.pages[0]?.unread ?? 0;
}

/** Keeps the mailbox live inside a RealtimeProvider and toasts new letters. */
export function useMailFrames(onOpen?: (id: string) => void) {
  const qc = useQueryClient();
  useFrames(
    useCallback(
      (f: Frame) => {
        if (f.type === "ready") {
          void qc.invalidateQueries({ queryKey: mailKey });
          return;
        }
        if (f.type !== "mail") return;
        void qc.invalidateQueries({ queryKey: mailKey });
        toast(`Mail from ${f.mail.from_name}`, {
          description: f.mail.subject,
          action: onOpen ? { label: "Read", onClick: () => onOpen(f.mail.id) } : undefined,
        });
      },
      [qc, onOpen],
    ),
  );
}

/** Opens one letter (which marks it read) and updates the list without a refetch. */
export function useLetter(id: string | null) {
  const { api } = useSession();
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["letter", id],
    enabled: id !== null,
    queryFn: async () => {
      const m = await api.openMail(id ?? "");
      qc.setQueryData<InfiniteData<MailPage, string | null>>(mailKey, (data) => markRead(data, m));
      return m;
    },
    staleTime: Infinity,
  });
}

/** The mailbox with one letter marked read (and the unread count lowered once). */
export function markRead(data: InfiniteData<MailPage, string | null> | undefined, m: Mail) {
  if (!data) return data;
  const was = data.pages.some((p) => p.items.some((x) => x.id === m.id && !x.read));
  return {
    ...data,
    pages: data.pages.map((p, i) => ({
      ...p,
      unread: i === 0 && was ? Math.max(0, p.unread - 1) : p.unread,
      items: p.items.map((x) => (x.id === m.id ? { ...x, read: true } : x)),
    })),
  };
}
