import {
  type RoomChat,
  type RoomFrame,
  type RoomPeer,
  type RoomQuestion,
  type Stroke,
} from "./frames";

export type Burst = { key: number; emoji: string; name: string; left: number };

export type RoomState = {
  you: RoomPeer | null;
  peers: RoomPeer[];
  chat: RoomChat[];
  questions: RoomQuestion[];
  strokes: Stroke[];
  /** Live laser dot, fades on its own. */
  laser: { x: number; y: number; at: number } | null;
  presenter: string;
  bursts: Burst[];
  ended: boolean;
  lastError: string | null;
  promoted: string | null;
};

export const emptyRoom: RoomState = {
  you: null,
  peers: [],
  chat: [],
  questions: [],
  strokes: [],
  laser: null,
  presenter: "",
  bursts: [],
  ended: false,
  lastError: null,
  promoted: null,
};

const CHAT_KEPT = 100;

/** Unanswered first, then most votes, then oldest. Same order as the server. */
export function sortQuestions(qs: readonly RoomQuestion[]): RoomQuestion[] {
  return [...qs].sort(
    (a, b) =>
      Number(a.answered) - Number(b.answered) ||
      b.votes - a.votes ||
      a.at.getTime() - b.at.getTime(),
  );
}

const upsert = <T extends { id: string }>(list: readonly T[], item: T): T[] => {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) return [...list, item];
  const next = [...list];
  next[i] = item;
  return next;
};

/** Applies one room frame. `now` and `seed` keep it pure for tests. */
export type RoomAction =
  | RoomFrame
  | { type: "burst_done"; key: number }
  | { type: "reset" };

export function roomReducer(
  s: RoomState,
  f: RoomAction,
  now = Date.now(),
  seed = Math.random(),
): RoomState {
  switch (f.type) {
    case "reset":
      return emptyRoom;
    case "welcome":
      return {
        ...emptyRoom,
        you: f.you,
        peers: f.peers,
        chat: f.chat,
        questions: sortQuestions(f.questions),
        strokes: f.strokes,
        presenter: f.presenter,
      };
    case "peer_joined":
    case "peer": {
      const peers = upsert(s.peers, f.peer);
      return {
        ...s,
        peers,
        you: s.you && s.you.id === f.peer.id ? f.peer : s.you,
      };
    }
    case "peer_left":
      return { ...s, peers: s.peers.filter((p) => p.id !== f.peer_id) };
    case "presenter":
      return {
        ...s,
        presenter: f.presenter,
        strokes: f.presenter ? s.strokes : [],
      };
    case "chat":
      return { ...s, chat: [...s.chat, f.message].slice(-CHAT_KEPT) };
    case "question":
      return {
        ...s,
        questions: sortQuestions(upsert(s.questions, f.question)),
      };
    case "draw":
      if (f.stroke.tool === "laser") {
        const p = f.stroke.points[f.stroke.points.length - 1];
        return p ? { ...s, laser: { x: p[0], y: p[1], at: now } } : s;
      }
      return { ...s, strokes: [...s.strokes, f.stroke].slice(-2000) };
    case "clear":
      return { ...s, strokes: [] };
    case "react":
      return {
        ...s,
        bursts: [
          ...s.bursts,
          {
            key: now + seed,
            emoji: f.emoji,
            name: f.name,
            left: 10 + Math.round(seed * 80),
          },
        ].slice(-30),
      };
    case "burst_done":
      return { ...s, bursts: s.bursts.filter((b) => b.key !== f.key) };
    case "promoted":
      return { ...s, promoted: f.code, lastError: null };
    case "error":
      return { ...s, lastError: f.error };
    case "ended":
      return { ...s, ended: true };
    case "signal":
      return s;
  }
}

export const hostOf = (s: RoomState) => s.you?.role === "host";
export const handsUp = (s: RoomState) => s.peers.filter((p) => p.hand);
