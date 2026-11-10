import { describe, expect, it } from "vitest";

import { type Mail } from "./api/schemas";
import { markRead } from "./mail-queries";

const mail = (id: string, read: boolean): Mail => ({
  id,
  kind: "announcement",
  subject: id,
  preview: "",
  body: null,
  from_name: "Sam",
  persona_id: null,
  announcement_id: null,
  task_id: null,
  class_id: null,
  created_at: new Date(),
  read,
});

describe("mail (MA9)", () => {
  it("marks a letter read once and lowers the unread count once", () => {
    const data = { pages: [{ items: [mail("a", false), mail("b", true)], next_cursor: null, unread: 1 }], pageParams: [null] };
    const once = markRead(data, mail("a", true));
    expect(once?.pages[0]?.unread).toBe(0);
    expect(once?.pages[0]?.items[0]?.read).toBe(true);
    expect(markRead(once, mail("a", true))?.pages[0]?.unread).toBe(0);
  });
});
