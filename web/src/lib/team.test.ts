import { describe, expect, it } from "vitest";

import { type Message, type Persona } from "./api/schemas";
import { insertMention, mentionMatches, mentionQuery, speakerKey, speakerOf, splitMentions } from "./team";

const persona = (id: string, name: string, title: string): Persona => ({ id, name, title, color: "violet", auto_reply: true, archived: false, version: 1, team: false });
const sam = persona("00000000-0000-4000-8000-000000000001", "Sam Rivera", "Team Lead");
const priya = persona("00000000-0000-4000-8000-0000000000a1", "Priya Sharma", "Engineering Manager");
const msg = (speaker: string | null, author: "student" | "persona" = "persona"): Message => ({
  id: "m",
  enrollment_id: "e",
  persona_id: "t",
  author,
  body: "hi",
  task_id: null,
  client_id: null,
  sent_at: new Date(),
  automated: true,
  reactions: [],
  speaker_id: speaker,
});

describe("team room", () => {
  it("finds who spoke (TR3, TR4)", () => {
    expect(speakerOf(msg(null), [sam])).toEqual({ kind: "bot" });
    expect(speakerOf(msg(sam.id), [sam])).toEqual({ kind: "persona", persona: sam });
    expect(speakerOf(msg("00000000-0000-4000-8000-0000000000ff"), [sam])).toEqual({ kind: "unknown" });
    expect(speakerKey(msg(null, "student"))).toBe("student");
    expect(speakerKey(msg(sam.id))).toBe(sam.id);
    expect(speakerKey(msg(null))).toBe("bot");
  });

  it("suggests and inserts @mentions", () => {
    expect(mentionQuery("hey @pr")).toBe("pr");
    expect(mentionQuery("@")).toBe("");
    expect(mentionQuery("mail me at a@b")).toBeNull();
    expect(mentionQuery("@sam done")).toBeNull();
    expect(mentionMatches("pr", [sam, priya])).toEqual([priya]);
    expect(mentionMatches("team", [sam, priya])).toEqual([sam]);
    expect(mentionMatches("", [sam, priya])).toHaveLength(2);
    expect(insertMention("hey @pr", priya)).toBe("hey @Priya ");
  });

  it("highlights mentions but not emails", () => {
    expect(splitMentions("@Sam can you check, cc @Priya.")).toEqual([
      { text: "@Sam", mention: true },
      { text: " can you check, cc ", mention: false },
      { text: "@Priya", mention: true },
      { text: ".", mention: false },
    ]);
    expect(splitMentions("write to a@b.com")).toEqual([{ text: "write to a@b.com", mention: false }]);
  });
});
