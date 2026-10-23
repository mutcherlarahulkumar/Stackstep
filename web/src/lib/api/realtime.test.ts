import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { connectRealtime, type SocketStatus } from "./realtime";

class FakeSocket {
  static all: FakeSocket[] = [];
  onmessage: ((ev: MessageEvent<unknown>) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  closed = false;
  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    FakeSocket.all.push(this);
  }
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<unknown>);
  }
  drop(code = 1006) {
    this.onclose?.({ code } as CloseEvent);
  }
  close() {
    this.closed = true;
  }
}

describe("connectRealtime", () => {
  beforeEach(() => {
    FakeSocket.all = [];
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  const start = (token: string | null = "tok") => {
    const statuses: SocketStatus[] = [];
    const frames: string[] = [];
    const stop = connectRealtime({
      url: "ws://api.test/v1/ws",
      token: async () => token,
      onFrame: (f) => frames.push(f.type),
      onStatus: (s) => statuses.push(s),
      createSocket: (url, protocols) => new FakeSocket(url, protocols) as unknown as WebSocket,
      random: () => 0.5,
    });
    return { statuses, frames, stop };
  };

  it("authenticates with subprotocols and goes live on ready", async () => {
    const { statuses, frames } = start();
    await vi.advanceTimersByTimeAsync(0);
    const s = FakeSocket.all[0];
    expect(s?.protocols).toEqual(["stackstep.v1", "bearer.tok"]);
    s?.emit({ type: "ready" });
    s?.emit({ type: "bogus" }); // malformed frames are dropped
    expect(statuses.at(-1)).toBe("live");
    expect(frames).toEqual(["ready"]);
  });

  it("reconnects with backoff, and stops for 4409", async () => {
    start();
    await vi.advanceTimersByTimeAsync(0);
    FakeSocket.all[0]?.drop();
    await vi.advanceTimersByTimeAsync(999);
    expect(FakeSocket.all).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(FakeSocket.all).toHaveLength(2);
    FakeSocket.all[1]?.drop();
    await vi.advanceTimersByTimeAsync(2010); // second attempt waits ~2 s
    expect(FakeSocket.all).toHaveLength(3);
    FakeSocket.all[2]?.drop(4409);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.all).toHaveLength(3);
  });

  it("stays offline without a token and closes on stop", async () => {
    const { statuses } = start(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeSocket.all).toHaveLength(0);
    expect(statuses.at(-1)).toBe("offline");
    const live = start();
    await vi.advanceTimersByTimeAsync(0);
    live.stop();
    expect(FakeSocket.all[0]?.closed).toBe(true);
  });
});
