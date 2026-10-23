"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useRef } from "react";

import { type SubmissionInput } from "@/lib/api/client";
import { ApiError, messageFor, NetworkError } from "@/lib/api/errors";
import { type Frame, type Task, type TaskStatus } from "@/lib/api/schemas";
import { upsertTask } from "@/lib/board";
import { useFrames } from "@/lib/realtime-context";
import { useSession } from "@/lib/session";
import { walletKey } from "@/lib/wallet-queries";

type State = { tasks: { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: Task[] } };

type Action = { type: "loaded"; items: Task[] } | { type: "failed"; message: string } | { type: "upserted"; task: Task } | { type: "replaced"; items: Task[] };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "loaded":
    case "replaced":
      return { tasks: { status: "ready", data: a.items } };
    case "failed":
      return s.tasks.status === "ready" ? s : { tasks: { status: "error", message: a.message } };
    case "upserted":
      return s.tasks.status === "ready" ? { tasks: { status: "ready", data: upsertTask(s.tasks.data, a.task) } } : s;
  }
}

/** The signed-in student's board, kept live over the page's socket. */
export function useWorkspace() {
  const { api } = useSession();
  const qc = useQueryClient();
  const [state, dispatch] = useReducer(reducer, { tasks: { status: "loading" } });
  // Finishing a task earns points and a credit; refresh the header chips.
  const refreshWallet = useCallback(() => void qc.invalidateQueries({ queryKey: walletKey }), [qc]);
  const tasksRef = useRef<Task[]>([]);
  useEffect(() => {
    if (state.tasks.status === "ready") tasksRef.current = state.tasks.data;
  }, [state.tasks]);

  const loadTasks = useCallback(async () => {
    try {
      dispatch({ type: "loaded", items: await api.myTasks() });
    } catch (e) {
      dispatch({ type: "failed", message: messageFor(e) });
    }
  }, [api]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useFrames(
    useCallback(
      (f: Frame) => {
        if (f.type === "ready") void loadTasks(); // after every (re)connect: catch up
        else if (f.type === "task") {
          dispatch({ type: "upserted", task: f.task });
          if (f.task.status === "done") refreshWallet();
        }
      },
      [loadTasks, refreshWallet],
    ),
  );

  /** Optimistic move with rollback. Returns a user-facing error, or null. */
  const move = useCallback(
    async (task: Task, to: TaskStatus, submission: SubmissionInput | null = null): Promise<string | null> => {
      const before = tasksRef.current;
      dispatch({ type: "replaced", items: before.map((t) => (t.id === task.id ? { ...t, status: to } : t)) });
      try {
        const updated = await api.transition(task.id, to, task.version, "", submission);
        dispatch({ type: "upserted", task: updated });
        if (updated.status === "done") refreshWallet();
        return null;
      } catch (e) {
        dispatch({ type: "replaced", items: before });
        if (e instanceof ApiError && (e.code === "version_conflict" || e.code === "invalid_transition")) {
          void loadTasks();
          return "This task changed on another device. We refreshed your board.";
        }
        if (e instanceof NetworkError) return "You're offline. The task wasn't moved.";
        if (e instanceof ApiError && e.code === "validation_failed") return Object.values(e.fields)[0] ?? messageFor(e);
        return messageFor(e);
      }
    },
    [api, loadTasks, refreshWallet],
  );

  /** Applies a task the server returned outside a move (e.g. a graded quiz). */
  const apply = useCallback(
    (t: Task) => {
      dispatch({ type: "upserted", task: t });
      if (t.status === "done") refreshWallet();
    },
    [refreshWallet],
  );

  return { state, move, apply, reload: () => void loadTasks() };
}
