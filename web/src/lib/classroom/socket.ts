import { RoomFrame } from "./frames";

export type RoomStatus = "connecting" | "live" | "reconnecting" | "closed";
/** Why the room closed for good: not invited, the class is over, or it's full. */
export type ClosedReason =
  | "not_invited"
  | "closed"
  | "full"
  | "unauthenticated"
  | "left";

type Options = {
  url: string;
  token: () => Promise<string | null>;
  onFrame: (f: RoomFrame) => void;
  onStatus: (s: RoomStatus, reason?: ClosedReason) => void;
};

export type RoomSocket = {
  send: (frame: Record<string, unknown>) => boolean;
  close: () => void;
};

/** The class room's own socket (two-way), with backoff reconnects (1 s → 15 s). */
export function connectRoom(opts: Options): RoomSocket {
  let ws: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const open = async () => {
    if (stopped) return;
    opts.onStatus(attempt === 0 ? "connecting" : "reconnecting");
    let token: string | null;
    try {
      token = await opts.token();
    } catch {
      // A network blip while refreshing the token: try again later, as for a dropped socket.
      if (stopped) return;
      opts.onStatus("reconnecting");
      timer = setTimeout(() => void open(), Math.min(15, 2 ** attempt++) * 1000);
      return;
    }
    if (stopped) return;
    if (!token) return opts.onStatus("closed", "unauthenticated");
    const sock = new WebSocket(opts.url, ["stackstep.v1", `bearer.${token}`]);
    ws = sock;
    sock.onmessage = (ev: MessageEvent<unknown>) => {
      if (typeof ev.data !== "string") return;
      let raw: unknown;
      try {
        raw = JSON.parse(ev.data);
      } catch {
        return;
      }
      const f = RoomFrame.safeParse(raw);
      if (!f.success) return;
      if (f.data.type === "welcome") {
        attempt = 0;
        opts.onStatus("live");
      }
      opts.onFrame(f.data);
    };
    sock.onclose = (ev) => {
      ws = null;
      if (stopped) return;
      const reason: ClosedReason | null =
        ev.code === 4404
          ? "not_invited"
          : ev.code === 4410 || ev.code === 1000
            ? "closed"
            : ev.code === 4429
              ? "full"
              : ev.code === 4401
                ? "unauthenticated"
                : null;
      if (reason) {
        stopped = true;
        return opts.onStatus("closed", reason);
      }
      opts.onStatus("reconnecting");
      const wait = Math.min(15, 2 ** attempt++) * 1000;
      timer = setTimeout(() => void open(), wait);
    };
  };
  void open();
  return {
    send: (frame) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(frame));
      return true;
    },
    close: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      ws?.close(1000);
      opts.onStatus("closed", "left");
    },
  };
}

/** /v1/ws → /v1/classes/{id}/ws on the same host. */
export function roomUrl(wsUrl: string, classId: string): string {
  return (
    wsUrl.replace(/\/v1\/ws\/?$/, "") +
    `/v1/classes/${encodeURIComponent(classId)}/ws`
  );
}
