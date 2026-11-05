import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { DocumentMarkdown } from "../app/document-markdown";
import { TaskDocuments } from "./task-documents";

describe("in-app task document reader", () => {
  it("opens structured Markdown inside the task and restores focus on return", async () => {
    const user = userEvent.setup();
    render(<TaskDocuments documents={[{ title: "Responsive layout", body: "# Your goal\n\nRead **carefully**.\n\n```js\nconst width = 360;\n```\n\n| Size | Result |\n| --- | --- |\n| 360 | Fits |\n\n- [x] Keyboard tested\n- [ ] Try the next size" }]} />);
    const trigger = screen.getByRole("button", { name: "Read Responsive layout" });
    await user.click(trigger);
    const reader = screen.getByRole("dialog", { name: "Responsive layout" });
    expect(within(reader).getByRole("heading", { name: "Your goal" }).tagName).toBe("H2");
    expect(within(reader).getByRole("table")).toBeTruthy();
    expect(within(reader).getAllByRole("checkbox")).toHaveLength(2);
    expect(within(reader).getByText("const width = 360;").closest("pre")).toBeTruthy();
    await user.click(within(reader).getByRole("button", { name: "Back to task" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    await user.click(trigger);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("does not embed HTML/media or navigate through references in authored lessons", () => {
    const { container } = render(<DocumentMarkdown>{"# Safety\n\n<script>window.hacked=true</script>\n<img src=x onerror=alert(1)>\n\n![Tracking](https://tracking.invalid/x.png)\n\n[Bad](javascript:alert(1)) [Data](data:text/html,hello) [Reference](https://example.com) [Local](other.md) [Section](#goal)"}</DocumentMarkdown>);
    expect(container.querySelector("script,img,iframe,a")).toBeNull();
    expect(screen.getByText("Reference")).toBeTruthy();
    expect(screen.getByText("Local")).toBeTruthy();
  });

  it("keeps empty legacy tasks free of empty viewer controls", () => {
    const { container } = render(<TaskDocuments documents={[]} />);
    expect(container.childElementCount).toBe(0);
  });
});
