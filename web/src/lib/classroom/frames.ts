import { z } from "zod";

import { ReactionEmoji } from "../api/schemas";

/** The live room's wire format (GET /v1/classes/{id}/ws). Go omits empty lists. */
export const RoomRole = z.enum(["host", "student"]);
export type RoomRole = z.output<typeof RoomRole>;
export const RoomPeer = z.object({
  id: z.string(),
  name: z.string(),
  login: z.string(),
  avatar_url: z.string().nullable().optional(),
  role: RoomRole,
  hand: z.boolean(),
  mic: z.boolean(),
});
export type RoomPeer = z.output<typeof RoomPeer>;
const at = z.iso.datetime({ offset: true }).transform((s) => new Date(s));
export const RoomChat = z.object({
  id: z.string(),
  peer_id: z.string(),
  name: z.string(),
  role: RoomRole,
  body: z.string(),
  at,
});
export type RoomChat = z.output<typeof RoomChat>;
export const RoomQuestion = z.object({
  id: z.string(),
  peer_id: z.string(),
  name: z.string(),
  body: z.string(),
  at,
  votes: z.int().min(0),
  answered: z.boolean(),
});
export type RoomQuestion = z.output<typeof RoomQuestion>;
export const Stroke = z.object({
  id: z.string(),
  tool: z.enum(["pen", "highlight", "laser"]),
  color: z.string(),
  width: z.number(),
  points: z.array(z.tuple([z.number(), z.number()])),
});
export type Stroke = z.output<typeof Stroke>;

const list = <T extends z.ZodType>(t: T) => z.array(t).optional().default([]);

export const RoomFrame = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("welcome"),
    you: RoomPeer,
    peers: list(RoomPeer),
    chat: list(RoomChat),
    questions: list(RoomQuestion),
    strokes: list(Stroke),
    presenter: z.string().optional().default(""),
  }),
  z.object({ type: z.literal("peer_joined"), peer: RoomPeer }),
  z.object({ type: z.literal("peer_left"), peer_id: z.string() }),
  z.object({ type: z.literal("peer"), peer: RoomPeer }),
  z.object({
    type: z.literal("presenter"),
    presenter: z.string().optional().default(""),
  }),
  z.object({ type: z.literal("chat"), message: RoomChat }),
  z.object({ type: z.literal("question"), question: RoomQuestion }),
  z.object({ type: z.literal("signal"), from: z.string(), data: z.unknown() }),
  z.object({ type: z.literal("draw"), stroke: Stroke }),
  z.object({ type: z.literal("clear") }),
  z.object({
    type: z.literal("react"),
    emoji: ReactionEmoji,
    name: z.string(),
  }),
  z.object({ type: z.literal("promoted"), name: z.string(), code: z.string() }),
  z.object({
    type: z.literal("error"),
    code: z.string(),
    error: z.string().optional().default("Something went wrong in the room."),
  }),
  z.object({ type: z.literal("ended") }),
]);
export type RoomFrame = z.output<typeof RoomFrame>;
