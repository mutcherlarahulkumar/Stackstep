import { describe, expect, it } from "vitest";

import { Message } from "@/lib/api/schemas";
import { message } from "@/test/fixtures";

import { withReaction } from "../components/chat/use-conversation";
import { reactionChips } from "./reactions";

describe("reactions (CH8)", () => {
  it("toggles one side's emoji and rolls chips up per emoji", () => {
    const m = Message.parse(message({ reactions: [{ emoji: "heart", by: "persona" }] }));
    const both = withReaction(m, "heart", "student", true);
    expect(reactionChips(both.reactions, "student")).toEqual([{ emoji: "heart", count: 2, mine: true }]);
    expect(reactionChips(withReaction(both, "heart", "student", false).reactions, "student")).toEqual([{ emoji: "heart", count: 1, mine: false }]);
    expect(() => Message.parse(message({ reactions: [{ emoji: "fire", by: "student" }] }))).toThrow();
  });
});
