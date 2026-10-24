import { describe, expect, it } from "vitest";

import { LEAD_ID, MANAGER_ID, message, persona, thread } from "@/test/fixtures";

import { Message, Thread } from "./api/schemas";
import { applyMessage, belongsTo, clearUnread, inboxTimeLabel, isMine, personaTag, previewLine, totalUnread } from "./inbox";

const msg = (o: Record<string, unknown> = {}) => Message.parse(message(o));
const th = (o: Record<string, unknown> = {}) => Thread.parse(thread(o));
const manager = persona({ id: MANAGER_ID, name: "Priya Sharma", title: "Engineering Manager", color: "blue" });

describe("inbox", () => {
  const lead = th({ last_message: message({ sent_at: "2026-11-04T09:00:00Z" }) });
  const mgr = th({ persona: manager, last_message: message({ persona_id: MANAGER_ID, sent_at: "2026-11-04T09:30:00Z" }) });

  it("a persona message moves its thread to the top and counts as unread for the student", () => {
    const next = applyMessage([mgr, lead], msg({ sent_at: "2026-11-04T10:00:00Z" }), false);
    expect(next?.map((t) => t.persona.id)).toEqual([LEAD_ID, MANAGER_ID]);
    expect(next?.[0]?.unread).toBe(1);
  });

  it("own messages don't count as unread; the other side's do", () => {
    const mine = msg({ author: "student", sent_at: "2026-11-04T10:00:00Z" });
    expect(applyMessage([lead], mine, false)?.[0]?.unread).toBe(0);
    expect(applyMessage([lead], mine, true)?.[0]?.unread).toBe(1);
  });

  it("duplicate and older frames leave the list unchanged; unknown threads ask for a refetch", () => {
    const list = [lead];
    const same = lead.last_message ? msg({ ...message(), id: lead.last_message.id, sent_at: "2026-11-04T09:00:00Z" }) : msg();
    expect(applyMessage(list, same, false)).toBe(list);
    expect(applyMessage(list, msg({ sent_at: "2026-11-04T08:00:00Z" }), false)).toBe(list);
    expect(applyMessage(list, msg({ persona_id: MANAGER_ID }), false)).toBeNull();
    expect(applyMessage(list, msg({ enrollment_id: "00000000-0000-4000-8000-0000000000e2" }), true)).toBeNull();
  });

  it("clearing unread touches only the target", () => {
    const list = [th({ unread: 3 }), th({ persona: manager, unread: 2 })];
    const cleared = clearUnread(list, { personaId: LEAD_ID, enrollmentId: null });
    expect(cleared.map((t) => t.unread)).toEqual([0, 2]);
    expect(totalUnread(cleared)).toBe(2);
  });

  it("targets decide whose bubbles are mine and which frames belong", () => {
    const student = { personaId: LEAD_ID, enrollmentId: null };
    const staff = { personaId: LEAD_ID, enrollmentId: "7a1c1d5e-1a7b-4c3e-9c0a-1b2c3d4e5f61" };
    const m = msg();
    expect(isMine(student, m)).toBe(false);
    expect(isMine(staff, m)).toBe(true);
    expect(belongsTo(student, msg({ persona_id: MANAGER_ID }))).toBe(false);
    expect(belongsTo({ ...staff, enrollmentId: "00000000-0000-4000-8000-0000000000e2" }, m)).toBe(false);
  });

  it("labels", () => {
    expect(previewLine("line one\n\nline   two")).toBe("line one line two");
    expect([...previewLine("x".repeat(200))].length).toBe(90);
    expect(inboxTimeLabel(new Date(2026, 10, 3, 9), new Date(2026, 10, 4, 18))).toBe("Yesterday");
  });

  it("labels who is behind a persona", () => {
    expect(personaTag({ auto_reply: true })).toBe("Mentor · some replies automatic");
    expect(personaTag({ auto_reply: false })).toBe("Played by a mentor");
  });
});
