"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { ApiClient } from "./api/client";
import { ApiError, messageFor, NetworkError } from "./api/errors";
import { RuntimeConfig, type Me } from "./api/schemas";

export type SessionState =
  | { status: "loading" }
  | { status: "signed_out"; message: string | null }
  | { status: "signed_in"; me: Me };

type SessionValue = {
  state: SessionState;
  api: ApiClient;
  config: RuntimeConfig | null;
  devLogin: (login: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  reloadMe: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

const FALLBACK_CONFIG: RuntimeConfig = { wsUrl: "ws://localhost:8080/v1/ws", devLogin: false };

export function SessionProvider({ children, client }: { children: ReactNode; client?: ApiClient }) {
  const [api] = useState(() => client ?? new ApiClient());
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [config, setConfig] = useState<RuntimeConfig | null>(null);

  const loadMe = useCallback(async () => {
    setState({ status: "signed_in", me: await api.me() });
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    api.setSessionExpiredHandler(() => {
      setState((s) => (s.status === "signed_in" ? { status: "signed_out", message: "Your session expired. Please sign in again." } : s));
    });
    void (async () => {
      try {
        const res = await fetch("/api/web-config", { cache: "no-store" });
        const parsed = RuntimeConfig.safeParse(await res.json());
        if (!cancelled) setConfig(parsed.success ? parsed.data : FALLBACK_CONFIG);
      } catch {
        if (!cancelled) setConfig(FALLBACK_CONFIG);
      }
    })();
    void (async () => {
      try {
        if (!(await api.restore())) {
          if (!cancelled) setState({ status: "signed_out", message: null });
          return;
        }
        const me = await api.me();
        if (!cancelled) setState({ status: "signed_in", me });
      } catch (e) {
        if (!cancelled) setState({ status: "signed_out", message: e instanceof NetworkError ? messageFor(e) : null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const devLogin = useCallback(
    async (login: string) => {
      try {
        await api.devLogin(login);
        await loadMe();
        return null;
      } catch (e) {
        if (e instanceof ApiError && e.code === "validation_failed") return Object.values(e.fields)[0] ?? messageFor(e);
        return messageFor(e);
      }
    },
    [api, loadMe],
  );

  const signOut = useCallback(async () => {
    await api.logout();
    setState({ status: "signed_out", message: null });
  }, [api]);

  const reloadMe = useCallback(async () => {
    try {
      await loadMe();
    } catch {
      // Screens show their own errors.
    }
  }, [loadMe]);

  const value = useMemo(() => ({ state, api, config, devLogin, signOut, reloadMe }), [state, api, config, devLogin, signOut, reloadMe]);
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession must be used inside <SessionProvider>");
  return v;
}

/** Where a signed-in user belongs. One place decides who sees what. */
export function homeFor(me: Me): "/admin" | "/workspace" {
  switch (me.user.role) {
    case "admin":
    case "college_admin":
      return "/admin";
    case "student":
      return "/workspace";
  }
}
