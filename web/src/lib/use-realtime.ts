"use client";

import { useEffect, useRef, useState } from "react";

import { connectRealtime, type SocketStatus } from "./api/realtime";
import { type Frame } from "./api/schemas";
import { useSession } from "./session";

/** One socket per workspace; every frame goes to `onFrame`. */
export function useRealtime(onFrame: (f: Frame) => void): SocketStatus {
  const { api, config } = useSession();
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const handler = useRef(onFrame);
  useEffect(() => {
    handler.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    if (!config) return;
    return connectRealtime({
      url: config.wsUrl,
      token: () => api.accessTokenForSocket(),
      onFrame: (f) => handler.current(f),
      onStatus: setStatus,
    });
  }, [api, config]);
  return status;
}
