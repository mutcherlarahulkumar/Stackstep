import { Frame } from "./schemas";

export type SocketStatus = "connecting" | "live" | "offline";

type Options = {
  url: string;
  token: () => Promise<string | null>;
  onFrame: (f: Frame) => void;
  onStatus: (s: SocketStatus) => void;
  /** Injected in tests. */
  createSocket?: (url: string, protocols: string[]) => WebSocket;
  random?: () => number;
};

/**
 * Keeps one WebSocket open with exponential backoff (1 s → 30 s, ±20 % jitter).
 * A "ready" frame after every (re)connect tells callers to refetch what they missed.
 * Close code 4409 (no enrollment) stops retrying; 4401 asks the token provider again.
 */
export function connectRealtime(opts: Options): () => void {
  const create = opts.createSocket ?? ((url, protocols) => new WebSocket(url, protocols));
  const random = opts.random ?? Math.random;
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let stopped = false;

  const schedule = () => {
    if (stopped) return;
    const base = Math.min(30, 2 ** attempt);
    attempt = Math.min(attempt + 1, 10);
    timer = setTimeout(() => void open(), base * 1000 * (0.8 + random() * 0.4));
  };

  const open = async () => {
    if (stopped) return;
    opts.onStatus("connecting");
    const token = await opts.token();
    if (stopped) return;
    if (!token) {
      opts.onStatus("offline");
      return;
    }
    const ws = create(opts.url, ["stackstep.v1", `bearer.${token}`]);
    socket = ws;
    ws.onmessage = (ev: MessageEvent<unknown>) => {
      if (typeof ev.data !== "string") return;
      let raw: unknown;
      try {
        raw = JSON.parse(ev.data);
      } catch {
        return;
      }
      const parsed = Frame.safeParse(raw);
      if (!parsed.success) return; // dropped; the next refetch heals state
      if (parsed.data.type === "ready") {
        attempt = 0;
        opts.onStatus("live");
      }
      opts.onFrame(parsed.data);
    };
    ws.onclose = (ev) => {
      socket = null;
      if (stopped) return;
      // 1006 with no reason usually means the server refused the handshake: check
      // PUBLIC_WS_URL (wss://…/v1/ws) and the API's ALLOWED_ORIGINS for this site's origin.
      if (ev.code !== 1000) console.warn(`Live updates disconnected (code ${ev.code}${ev.reason ? `: ${ev.reason}` : ""}); retrying.`);
      opts.onStatus("offline");
      if (ev.code === 4409) return;
      schedule();
    };
  };

  const onOnline = () => {
    if (!socket && !stopped) {
      if (timer) clearTimeout(timer);
      attempt = 0;
      void open();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("online", onOnline);
  void open();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (typeof window !== "undefined") window.removeEventListener("online", onOnline);
    socket?.close(1000, "bye");
    socket = null;
  };
}
