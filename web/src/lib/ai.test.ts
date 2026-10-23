import { describe, expect, it } from "vitest";

import { countdown, hasErrors, validateFollowUp, validateQuestion } from "./ai";
import { AIConversationDetail, Wallet } from "./api/schemas";

const wallet = {
  points: { total: 25, finished: 1, on_time: 1 },
  credits: { balance: 19, history: [{ id: 1, delta: -1, reason: "ai_question", note: "x", task_id: null, created_at: "2026-11-04T04:30:00Z" }] },
  ai: { enabled: true, daily_limit: 8, used_today: 1, cost_per_question: 1, next_question_at: null },
};

describe("AI helper", () => {
  it("refuses one-line prompts and asks what was tried (A1, A4)", () => {
    expect(hasErrors(validateQuestion({ task_id: null, goal: "fix it", tried: "nothing", error: "", code: "" }))).toBe(true);
    const ok = validateQuestion({
      task_id: null,
      goal: "Filter the task list by status without a reload.",
      tried: "I used Array.filter and logged the result; it is right but the list doesn't change.",
      error: "",
      code: "",
    });
    expect(hasErrors(ok)).toBe(false);
    expect(validateFollowUp({ tried_since: "", body: "Why?" }).tried_since).toBeTruthy();
    expect(validateFollowUp({ tried_since: "", body: "Why?" }).body).toBeTruthy();
  });

  it("counts down to the next follow-up", () => {
    const now = new Date("2026-11-04T10:00:00Z");
    expect(countdown(new Date("2026-11-04T10:04:05Z"), now)).toBe("4:05");
    expect(countdown(new Date("2026-11-04T09:59:00Z"), now)).toBeNull();
    expect(countdown(null, now)).toBeNull();
    expect(countdown(new Date("2026-11-04T12:30:00Z"), now)).toBe("2h 30m");
  });

  it("wallet and conversation payloads parse strictly", () => {
    expect(Wallet.parse(wallet).credits.history[0]?.reason).toBe("ai_question");
    expect(Wallet.safeParse({ ...wallet, credits: { ...wallet.credits, history: [{ ...wallet.credits.history[0], reason: "bonus" }] } }).success).toBe(false);
    const d = AIConversationDetail.parse({
      conversation: { id: "00000000-0000-4000-8000-0000000000c1", task_id: null, title: "Filter", follow_ups: 0, created_at: "2026-11-04T04:30:00Z", updated_at: "2026-11-04T04:30:00Z" },
      messages: [{ id: "00000000-0000-4000-8000-0000000000d1", role: "assistant", status: "ok", kind: "answer", body: "**Hints**", parts: null, created_at: "2026-11-04T04:30:00Z" }],
      follow_ups_left: 3,
      follow_up_at: "2026-11-04T04:35:00Z",
      wallet,
    });
    expect(d.follow_up_at).toBeInstanceOf(Date);
  });
});

describe("AI answers", () => {
  it("bold-only lines become section headings; inline bold stays", async () => {
    const { sectionHeadings } = await import("@/components/ai/markdown");
    expect(sectionHeadings("**Hints**\n1. Look **here**")).toBe("#### Hints\n1. Look **here**");
  });
});
