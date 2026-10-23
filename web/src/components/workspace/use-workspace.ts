"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

import { ApiError, messageFor, NetworkError } from "@/lib/api/errors";
import { type Frame, type Message, type Task, type TaskStatus } from "@/lib/api/schemas";
import { mergeMessages, upsertTask } from "@/lib/board";
import { useRealtime } from "@/lib/use-realtime";
import { validateMessage } from "@/lib/validation";
import { useSession } from "@/lib/session";

export type Outgoing = { clientId: string; body: string; at: Date; error: string | null };

type Load<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

type State = {
  messages: Load<Message[]>;
  nextCursor: string | null;
  loadingOlder: boolean;
  outgoing: Outgoing[];
  tasks: Load<Task[]>;
};

type Action =
  | { type: "messages_loaded"; items: Message[]; nextCursor: string | null }
  | { type: "messages_failed"; message: string }
  | { type: "older_loading" }
  | { type: "older_loaded"; items: Message[]; nextCursor: string | null }
  | { type: "older_failed" }
  | { type: "received"; items: Message[] }
  | { type: "queued"; out: Outgoing }
  | { type: "send_failed"; clientId: string; error: string }
  | { type: "retrying"; clientId: string }
  | { type: "discarded"; clientId: string }
  | { type: "tasks_loaded"; items: Task[] }
  | { type: "tasks_failed"; message: string }
  | { type: "task_upserted"; task: Task }
  | { type: "tasks_replaced"; items: Task[] };

const initial: State = { messages: { status: "loading" }, nextCursor: null, loadingOlder: false, outgoing: [], tasks: { status: "loading" } };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "messages_loaded":
      return { ...s, messages: { status: "ready", data: s.messages.status === "ready" ? mergeMessages(s.messages.data, a.items) : a.items }, nextCursor: a.nextCursor };
    case "messages_failed":
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
    case "tasks_loaded":
      return { ...s, tasks: { status: "ready", data: a.items } };
    case "tasks_failed":
      return s.tasks.status === "ready" ? s : { ...s, tasks: { status: "error", message: a.message } };
    case "task_upserted":
      return s.tasks.status === "ready" ? { ...s, tasks: { status: "ready", data: upsertTask(s.tasks.data, a.task) } } : s;
    case "tasks_replaced":
      return { ...s, tasks: { status: "ready", data: a.items } };
  }
}

/** Chat + board state for the signed-in student, kept live over one socket. */
export function useWorkspace() {
  const { api } = useSession();
  const [state, dispatch] = useReducer(reducer, initial);
  const tasksRef = useRef<Task[]>([]);
  useEffect(() => {
    if (state.tasks.status === "ready") tasksRef.current = state.tasks.data;
  }, [state.tasks]);

  const loadMessages = useCallback(async () => {
    try {
      const page = await api.messages();
      dispatch({ type: "messages_loaded", items: page.items, nextCursor: page.next_cursor });
    } catch (e) {
      dispatch({ type: "messages_failed", message: messageFor(e) });
    }
  }, [api]);

  const loadTasks = useCallback(async () => {
    try {
      dispatch({ type: "tasks_loaded", items: await api.myTasks() });
    } catch (e) {
      dispatch({ type: "tasks_failed", message: messageFor(e) });
    }
  }, [api]);

  const onFrame = useCallback(
    (f: Frame) => {
      switch (f.type) {
        case "ready": // after every (re)connect: catch up on anything missed
          void loadMessages();
          void loadTasks();
          return;
        case "message":
          dispatch({ type: "received", items: [f.message] });
          return;
        case "task":
          dispatch({ type: "task_upserted", task: f.task });
          return;
      }
    },
    [loadMessages, loadTasks],
  );
  const socket = useRealtime(onFrame);

  useEffect(() => {
    void loadMessages();
    void loadTasks();
  }, [loadMessages, loadTasks]);

  const loadOlder = useCallback(async () => {
    if (state.loadingOlder || !state.nextCursor) return;
    dispatch({ type: "older_loading" });
    try {
      const page = await api.messages(state.nextCursor);
      dispatch({ type: "older_loaded", items: page.items, nextCursor: page.next_cursor });
    } catch {
      dispatch({ type: "older_failed" });
    }
  }, [api, state.loadingOlder, state.nextCursor]);

  const deliver = useCallback(
    async (o: Outgoing) => {
      try {
        dispatch({ type: "received", items: [await api.sendMessage(o.clientId, o.body)] });
      } catch (e) {
        dispatch({ type: "send_failed", clientId: o.clientId, error: messageFor(e) });
      }
    },
    [api],
  );

  /** Returns a validation message, or null once the message is queued. */
  const send = useCallback(
    (raw: string): string | null => {
      const problem = validateMessage(raw);
      if (problem) return problem;
      const out: Outgoing = { clientId: crypto.randomUUID(), body: raw.trim(), at: new Date(), error: null };
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

  /** Optimistic move with rollback. Returns a user-facing error, or null. */
  const move = useCallback(
    async (task: Task, to: TaskStatus): Promise<string | null> => {
      const before = tasksRef.current;
      dispatch({ type: "tasks_replaced", items: before.map((t) => (t.id === task.id ? { ...t, status: to } : t)) });
      try {
        dispatch({ type: "task_upserted", task: await api.transition(task.id, to, task.version) });
        return null;
      } catch (e) {
        dispatch({ type: "tasks_replaced", items: before });
        if (e instanceof ApiError && (e.code === "version_conflict" || e.code === "invalid_transition")) {
          void loadTasks();
          return "This task changed on another device. We refreshed your board.";
        }
        if (e instanceof NetworkError) return "You're offline. The task wasn't moved.";
        return messageFor(e);
      }
    },
    [api, loadTasks],
  );

  return { state, socket, send, retry, discard, loadOlder, move, reload: () => void Promise.all([loadMessages(), loadTasks()]) };
}
