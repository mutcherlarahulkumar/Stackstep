"use client";

import { createContext, use, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";

import { type SocketStatus } from "./api/realtime";
import { type Frame } from "./api/schemas";
import { useRealtime } from "./use-realtime";

type Listener = (f: Frame) => void;
type Bus = { status: SocketStatus; subscribe: (fn: Listener) => () => void };

const RealtimeContext = createContext<Bus | null>(null);

/** One socket per page; every component that cares subscribes to its frames. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Set<Listener>());
  const status = useRealtime((f) => {
    for (const fn of listeners.current) fn(f);
  });
  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);
  const value = useMemo(() => ({ status, subscribe }), [status, subscribe]);
  return <RealtimeContext value={value}>{children}</RealtimeContext>;
}

function useBus(): Bus {
  const bus = use(RealtimeContext);
  if (!bus) throw new Error("RealtimeProvider is missing");
  return bus;
}

export const useSocketStatus = (): SocketStatus => useBus().status;

/** Calls `onFrame` for every live frame while mounted. */
export function useFrames(onFrame: Listener): void {
  const { subscribe } = useBus();
  const handler = useRef(onFrame);
  useEffect(() => {
    handler.current = onFrame;
  }, [onFrame]);
  useEffect(() => subscribe((f) => handler.current(f)), [subscribe]);
}
