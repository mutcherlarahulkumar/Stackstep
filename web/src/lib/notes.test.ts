import { describe, expect, it } from "vitest";

import { noteStatus } from "./notes";

describe("notes", () => {
  const saved = { body: "## Plan", shared: false, updated_at: new Date() };
  it("is saved only when body and sharing match", () => {
    expect(noteStatus(saved, "## Plan", false)).toBe("saved");
    expect(noteStatus(saved, "## Plan ", false)).toBe("dirty");
    expect(noteStatus(saved, "## Plan", true)).toBe("dirty");
  });
});
