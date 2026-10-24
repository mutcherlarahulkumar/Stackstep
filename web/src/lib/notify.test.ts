import { describe, expect, it } from "vitest";

import { message, task } from "@/test/fixtures";

import { Frame } from "./api/schemas";
import { notificationFor, titleWithCount } from "./notify";

const name = (id: string) => (id ? "Sam Rivera" : undefined);
const msg = (o: Record<string, unknown>) => Frame.parse({ type: "message", message: message(o) });
const tsk = (o: Record<string, unknown>) => Frame.parse({ type: "task", task: task(o) });

describe("notifications", () => {
  it("students hear from personas, not their own messages (NT1)", () => {
    expect(notificationFor(msg({ author: "persona", body: "Standup in 5" }), "student", name)).toMatchObject({ title: "Sam Rivera", body: "Standup in 5" });
    expect(notificationFor(msg({ author: "student" }), "student", name)).toBeNull();
    expect(notificationFor(Frame.parse({ type: "ready" }), "student", name)).toBeNull();
  });

  it("students hear about reviews and new tasks only (NT2)", () => {
    expect(notificationFor(tsk({ status: "changes_requested", title: "Fix" }), "student", name)?.title).toBe("Changes requested");
    expect(notificationFor(tsk({ status: "done", review_mode: "manual" }), "student", name)?.title).toBe("Approved");
    expect(notificationFor(tsk({ status: "done", review_mode: "self" }), "student", name)).toBeNull();
    expect(notificationFor(tsk({ status: "todo", version: 1 }), "student", name)?.title).toBe("New task on your board");
    expect(notificationFor(tsk({ status: "in_progress", version: 2 }), "student", name)).toBeNull();
  });

  it("staff hear about student messages and hand-ins (NT3)", () => {
    expect(notificationFor(msg({ author: "student", body: "Stuck" }), "staff", name)?.title).toBe("New message for Sam Rivera");
    expect(notificationFor(msg({ author: "persona" }), "staff", name)).toBeNull();
    expect(notificationFor(tsk({ status: "in_review", title: "Hero" }), "staff", name)).toMatchObject({ title: "New hand-in to review", body: "Hero" });
  });

  it("puts the unread count in the tab title (NT4)", () => {
    expect(titleWithCount("Workspace · Stackstep", 3)).toBe("(3) Workspace · Stackstep");
    expect(titleWithCount("(3) Workspace · Stackstep", 0)).toBe("Workspace · Stackstep");
    expect(titleWithCount("Stackstep", 120)).toBe("(99+) Stackstep");
  });
});
