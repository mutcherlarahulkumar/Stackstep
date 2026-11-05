import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { type TaskDocument } from "@/lib/api/schemas";

import { DocumentsEditor } from "./documents-editor";

function Editor() {
  const [form, setForm] = useState<{ title: string; documents: TaskDocument[] }>({ title: "Draft task", documents: [{ title: "Existing guide", body: "Original writing" }] });
  const [importing, setImporting] = useState(false);
  return <>
    <input aria-label="Task title" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
    <DocumentsEditor value={form.documents} onChange={(update) => setForm({ ...form, documents: update(form.documents) })} onImportingChange={setImporting} errors={{}} idPrefix="test" />
    <button type="submit" disabled={importing}>Save task</button>
  </>;
}

describe("task document authoring", () => {
  it("previews the current Markdown without changing the source", async () => {
    const user = userEvent.setup();
    render(<Editor />);
    await user.clear(screen.getByLabelText("Document 1 Markdown"));
    await user.type(screen.getByLabelText("Document 1 Markdown"), "# A measurable goal\n\n**Ship** a working page.");
    await user.click(screen.getByRole("button", { name: "Preview document 1" }));
    expect(screen.getByRole("heading", { name: "A measurable goal" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Write document 1" }));
    expect((screen.getByLabelText("Document 1 Markdown") as HTMLTextAreaElement).value).toContain("# A measurable goal");
  });

  it("imports as a new document, preserves edits made during file I/O and resets the input", async () => {
    const user = userEvent.setup();
    render(<Editor />);
    let resolve: ((buffer: ArrayBuffer) => void) | undefined;
    const pending = new Promise<ArrayBuffer>((done) => { resolve = done; });
    const file = new File(["# New lesson"], "new-lesson.md", { type: "text/markdown" });
    Object.defineProperty(file, "arrayBuffer", { value: () => pending });
    const upload = screen.getByLabelText("Import Markdown");
    fireEvent.change(upload, { target: { files: [file] } });
    expect(screen.getByRole("status").textContent).toContain("Importing");
    expect((screen.getByRole("button", { name: "Save task" }) as HTMLButtonElement).disabled).toBe(true);
    await user.clear(screen.getByLabelText("Task title"));
    await user.type(screen.getByLabelText("Task title"), "Updated while importing");
    resolve?.(new TextEncoder().encode("# New lesson").buffer);
    await waitFor(() => expect(screen.getByLabelText("Document 2 title")).toBeTruthy());
    expect((screen.getByRole("button", { name: "Save task" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText("Task title") as HTMLInputElement).value).toBe("Updated while importing");
    expect((screen.getByLabelText("Document 1 Markdown") as HTMLTextAreaElement).value).toBe("Original writing");
    expect((screen.getByLabelText("Document 2 title") as HTMLInputElement).value).toBe("new lesson");
    expect((upload as HTMLInputElement).value).toBe("");
    await user.clear(screen.getByLabelText("Document 1 Markdown"));
    await user.type(screen.getByLabelText("Document 1 Markdown"), "My own edit");
    expect((screen.getByLabelText("Document 2 Markdown") as HTMLTextAreaElement).value).toBe("# New lesson");
  });

  it("shows import errors without losing existing documents", async () => {
    render(<Editor />);
    fireEvent.change(screen.getByLabelText("Import Markdown"), { target: { files: [new File(["x"], "unsafe.html")] } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(".md"));
    expect((screen.getByLabelText("Document 1 Markdown") as HTMLTextAreaElement).value).toBe("Original writing");
    expect(screen.queryByLabelText("Document 2 title")).toBeNull();
  });
});
