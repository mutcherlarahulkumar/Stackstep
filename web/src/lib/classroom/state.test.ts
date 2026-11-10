import { describe, expect, it } from "vitest";

import { RoomFrame, RoomQuestion } from "./frames";
import { emptyRoom, roomReducer, sortQuestions } from "./state";

const peer = (id: string, role: "host" | "student" = "student") => ({
  id,
  name: id,
  login: id,
  role,
  hand: false,
  mic: false,
});
const parse = (f: unknown) => RoomFrame.parse(f);
const q = (
  id: string,
  votes: number,
  answered = false,
  at = "2026-11-05T10:00:00Z",
) => ({ id, peer_id: "a", name: "A", body: "Why?", at, votes, answered });

describe("classroom state (LC17)", () => {
  it("starts from the welcome, even when Go left out empty lists", () => {
    const s = roomReducer(
      emptyRoom,
      parse({ type: "welcome", you: peer("me"), presenter: "" }),
    );
    expect(s.you?.id).toBe("me");
    expect(s.chat).toEqual([]);
    expect(s.strokes).toEqual([]);
  });

  it("keeps peers, the last 100 lines and questions in the server's order", () => {
    let s = roomReducer(
      emptyRoom,
      parse({
        type: "welcome",
        you: peer("me"),
        peers: [peer("me")],
        presenter: "",
      }),
    );
    s = roomReducer(s, parse({ type: "peer_joined", peer: peer("h", "host") }));
    s = roomReducer(
      s,
      parse({ type: "peer", peer: { ...peer("me"), mic: true } }),
    );
    expect(s.you?.mic).toBe(true);
    for (let i = 0; i < 105; i++)
      s = roomReducer(
        s,
        parse({
          type: "chat",
          message: {
            id: `c${i}`,
            peer_id: "me",
            name: "me",
            role: "student",
            body: "hi",
            at: "2026-11-05T10:00:00Z",
          },
        }),
      );
    expect(s.chat).toHaveLength(100);
    expect(s.chat[0]?.id).toBe("c5");
    s = roomReducer(s, parse({ type: "peer_left", peer_id: "h" }));
    expect(s.peers.map((p) => p.id)).toEqual(["me"]);
    const order = sortQuestions(
      [
        q("old", 1),
        q("answered", 9, true),
        q("top", 3),
        q("new", 1, false, "2026-11-05T11:00:00Z"),
      ].map((x) => RoomQuestion.parse(x)),
    );
    expect(order.map((x) => x.id)).toEqual(["top", "old", "new", "answered"]);
  });

  it("draws strokes, shows the laser without keeping it, clears, and drops strokes when presenting stops", () => {
    let s = roomReducer(
      emptyRoom,
      parse({ type: "presenter", presenter: "h" }),
    );
    s = roomReducer(
      s,
      parse({
        type: "draw",
        stroke: {
          id: "s1",
          tool: "pen",
          color: "#f00",
          width: 0.004,
          points: [[0.1, 0.2]],
        },
      }),
    );
    s = roomReducer(
      s,
      parse({
        type: "draw",
        stroke: {
          id: "s2",
          tool: "laser",
          color: "#f00",
          width: 0.004,
          points: [[0.5, 0.5]],
        },
      }),
      1000,
    );
    expect(s.strokes.map((x) => x.id)).toEqual(["s1"]);
    expect(s.laser).toEqual({ x: 0.5, y: 0.5, at: 1000 });
    s = roomReducer(s, parse({ type: "presenter", presenter: "" }));
    expect(s.strokes).toEqual([]);
  });

  it("floats reactions and forgets them when the animation ends", () => {
    let s = roomReducer(
      emptyRoom,
      parse({ type: "react", emoji: "party", name: "Asha" }),
      5,
      0.5,
    );
    expect(s.bursts[0]).toMatchObject({ emoji: "party", left: 50 });
    s = roomReducer(s, { type: "burst_done", key: 5.5 });
    expect(s.bursts).toEqual([]);
  });
});
