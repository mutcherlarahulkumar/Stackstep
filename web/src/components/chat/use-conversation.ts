"use client";

import { useQueryClient } from "@tanstack/react-query";
import { newId } from "@/lib/uuid";
import { useCallback, useEffect, useReducer, useRef } from "react";

import { messageFor } from "@/lib/api/errors";
import { type Frame, type Message } from "@/lib/api/schemas";
import { mergeMessages } from "@/lib/board";
import { belongsTo, isMine, type ChatTarget } from "@/lib/inbox";
import { clearUnreadInCache } from "@/lib/inbox-queries";
import { useFrames } from "@/lib/realtime-context";
import { useSession } from "@/lib/session";
import { validateMessage } from "@/lib/validation";

export type Outgoing = { clientId: string; body: string; at: Date; error: string | null };

type State = {
  messages: { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: Message[] };
  nextCursor: string | null;
  loadingOlder: boolean;
  outgoing: Outgoing[];
};

type Action =
  | { type: "loaded"; items: Message[]; nextCursor: string | null }
  | { type: "failed"; message: string }
  | { type: "older_loading" }
  | { type: "older_loaded"; items: Message[]; nextCursor: string | null }
  | { type: "older_failed" }
  | { type: "received"; items: Message[] }
  | { type: "queued"; out: Outgoing }
  | { type: "send_failed"; clientId: string; error: string }
  | { type: "retrying"; clientId: string }
  | { type: "discarded"; clientId: string };

const initial: State = { messages: { status: "loading" }, nextCursor: null, loadingOlder: false, outgoing: [] };

export function conversationReducer(s: State, a: Action): State {
  switch (a.type) {
    case "loaded":
      return {
        ...s,
        messages: { status: "ready", data: s.messages.status === "ready" ? mergeMessages(s.messages.data, a.items) : a.items },
        // A catch-up reload must not forget older pages already shown.
        nextCursor: s.messages.status === "ready" ? s.nextCursor : a.nextCursor,
      };
    case "failed":
      return s.messages.status === "ready" ? s : { ...s, messages: { status: "error", message: a.message } };
    case "older_loading":
      return { ...s, loadingOlder: true };
    case "older_loaded":
      return s.messages.status !== "ready"
        ? s
        : { ...s, loadingOlder: false, nextCursor: a.nextCursor, messages: { status: "ready", data: mergeMessages(s.messages.data, a.items) } };
    case "older_failed":
      return { ...s, loadingOlder: false };
    case "received": {
      if (s.messages.status !== "ready") return s;
      const ids = new Set(a.items.map((m) => m.client_id));
      return { ...s, messages: { status: "ready", data: mergeMessages(s.messages.data, a.items) }, outgoing: s.outgoing.filter((o) => !ids.has(o.clientId)) };
    }
    case "queued":
      return { ...s, outgoing: [...s.outgoing, a.out] };
    case "send_failed":
      return { ...s, outgoing: s.outgoing.map((o) => (o.clientId === a.clientId ? { ...o, error: a.error } : o)) };
    case "retrying":
      return { ...s, outgoing: s.outgoing.map((o) => (o.clientId === a.clientId ? { ...o, error: null } : o)) };
    case "discarded":
      return { ...s, outgoing: s.outgoing.filter((o) => o.clientId !== a.clientId) };
  }
}

/**
 * One conversation, live over the page's socket. Mount it with a `key` per target so
 * switching threads starts from a clean state.
 */
export function useConversation(target: ChatTarget) {
  const { api } = useSession();
  const qc = useQueryClient();
  const [state, dispatch] = useReducer(conversationReducer, initial);
  const { personaId, enrollmentId } = target;

  const fetchPage = useCallback(
    (cursor: string | null) => (enrollmentId ? api.staffMessages(enrollmentId, personaId, cursor) : api.messages(personaId, cursor)),
    [api, enrollmentId, personaId],
  );

  const markRead = useCallback(async () => {
    try {
      if (enrollmentId) await api.staffMarkRead(enrollmentId, personaId);
      else await api.markRead(personaId);
      clearUnreadInCache(qc, { personaId, enrollmentId });
    } catch {
      // Unread counts are best effort; the next open retries.
    }
  }, [api, qc, enrollmentId, personaId]);

  const load = useCallback(async () => {
    try {
      const page = await fetchPage(null);
      dispatch({ type: "loaded", items: page.items, nextCursor: page.next_cursor });
    } catch (e) {
      dispatch({ type: "failed", message: messageFor(e) });
    }
  }, [fetchPage]);

  useEffect(() => {
    void load();
    void markRead();
  }, [load, markRead]);

  const unseen = useRef(false);
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && unseen.current) {
        unseen.current = false;
        void markRead();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [markRead]);

  useFrames(
    useCallback(
      (f: Frame) => {
        if (f.type === "ready") void load();
        else if (f.type === "message" && belongsTo({ personaId, enrollmentId }, f.message)) {
          dispatch({ type: "received", items: [f.message] });
          // Only count it as read once someone can actually see it.
          if (!isMine({ personaId, enrollmentId }, f.message)) {
            if (document.hidden) unseen.current = true;
            else void markRead();
          }
        }
      },
      [load, markRead, personaId, enrollmentId],
    ),
  );

  const loadOlder = useCallback(async () => {
    if (state.loadingOlder || !state.nextCursor) return;
    dispatch({ type: "older_loading" });
    try {
      const page = await fetchPage(state.nextCursor);
      dispatch({ type: "older_loaded", items: page.items, nextCursor: page.next_cursor });
    } catch {
      dispatch({ type: "older_failed" });
    }
  }, [fetchPage, state.loadingOlder, state.nextCursor]);

  const deliver = useCallback(
    async (o: Outgoing) => {
      try {
        const m = enrollmentId ? await api.staffSend(enrollmentId, personaId, o.clientId, o.body) : await api.sendMessage(personaId, o.clientId, o.body);
        dispatch({ type: "received", items: [m] });
      } catch (e) {
        dispatch({ type: "send_failed", clientId: o.clientId, error: messageFor(e) });
      }
    },
    [api, enrollmentId, personaId],
  );

  /** Returns a validation message, or null once the message is queued. */
  const send = useCallback(
    (raw: string): string | null => {
      const problem = validateMessage(raw);
      if (problem) return problem;
      const out: Outgoing = { clientId: newId(), body: raw.trim(), at: new Date(), error: null };
      dispatch({ type: "queued", out });
      void deliver(out);
      return null;
    },
    [deliver],
  );

  /** Same client id, so the server never stores a duplicate. */
  const retry = useCallback(
    (o: Outgoing) => {
      dispatch({ type: "retrying", clientId: o.clientId });
      void deliver(o);
    },
    [deliver],
  );

  const discard = useCallback((o: Outgoing) => dispatch({ type: "discarded", clientId: o.clientId }), []);

  return { state, send, retry, discard, loadOlder, reload: load, target };
}

export type Conversation = ReturnType<typeof useConversation>;
