import { describe, expect, it } from "vitest";

import { enrollment, flowJson, message, persona, task, thread, user } from "@/test/fixtures";

import { messageFor, ApiError, NetworkError } from "./errors";
import { ERROR_CODES, FlowDetail, Frame, Me, Message, Persona, Task, TaskSpec, Thread } from "./schemas";

describe("contract schemas", () => {
  it("parses a valid task into Dates", () => {
    const t = Task.parse(task({ status: "changes_requested" }));
    expect(t.due_at).toBeInstanceOf(Date);
    expect(t.status).toBe("changes_requested");
  });

  it("rejects unknown enum values, missing fields and wrong types", () => {
    expect(Task.safeParse(task({ status: "archived" })).success).toBe(false);
    const noVersion: Record<string, unknown> = task();
    delete noVersion.version;
    expect(Task.safeParse(noVersion).success).toBe(false);
    expect(Task.safeParse(task({ version: "1" })).success).toBe(false);
    expect(Task.safeParse(task({ due_at: "tomorrow" })).success).toBe(false);
  });

  it("ignores extra fields so the server can grow", () => {
    expect(Task.safeParse({ ...task(), new_field: 1 }).success).toBe(true);
  });

  it("me with and without enrollment; days must be 30 or 60", () => {
    const account = { terms_version: 1, consent_required: false, onboarded: true };
    expect(Me.parse({ user: user(), enrollment: enrollment(), account }).enrollment?.day_number).toBe(3);
    expect(Me.parse({ user: user({ role: "admin" }), enrollment: null, account }).enrollment).toBeNull();
    expect(Me.safeParse({ user: user(), enrollment: enrollment({ program: { slug: "x", days: 45, track: "frontend" } }), account }).success).toBe(false);
    // The account block is required: an older API would otherwise skip the consent step.
    expect(Me.safeParse({ user: user(), enrollment: null }).success).toBe(false);
  });

  it("frames are a closed union", () => {
    expect(Frame.safeParse({ type: "ready" }).success).toBe(true);
    expect(Frame.safeParse({ type: "typing" }).success).toBe(false);
  });

  it("every error code has human copy", () => {
    for (const code of ERROR_CODES) {
      const text = messageFor(new ApiError(400, code, "raw server text"));
      expect(text).not.toContain("raw server text");
      expect(text.length).toBeGreaterThan(5);
    }
    expect(messageFor(new NetworkError("x"))).toMatch(/connection/);
    expect(messageFor(new ApiError(429, "rate_limited", "", {}, 7200))).toMatch(/2h/);
  });

  it("feature 2 payloads: personas, threads, flows", () => {
    expect(Persona.safeParse(persona({ color: "pink" })).success).toBe(false);
    expect(Message.safeParse(message({ author: "lead" })).success).toBe(false);
    expect(Thread.parse(thread({ unread: 2 })).unread).toBe(2);
    const spec = { type: "dsa", title: "Two pointers", brief: "", persona_id: persona().id, review_mode: "self", due_minutes: 60, release_window: 0, content: { resources: [], quiz: null } };
    expect(TaskSpec.safeParse({ ...spec, release_time: "10:00" }).success).toBe(true);
    expect(TaskSpec.safeParse({ ...spec, release_time: "24:00" }).success).toBe(false);
    expect(TaskSpec.safeParse({ ...spec, release_time: "10:00", due_minutes: 10 }).success).toBe(false);
    expect(FlowDetail.parse({ flow: flowJson(), draft: null, published: null }).flow.days).toBe(30);
  });
});
