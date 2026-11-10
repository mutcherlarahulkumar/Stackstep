import { describe, expect, it } from "vitest";

import { TaskContent } from "./api/schemas";
import { cleanContent, contentForEdit, emptyContent, validateDocuments } from "./content";
import { documentFromMarkdownFile } from "./markdown-file";

const file = (name: string, body: string) => ({ name, size: new TextEncoder().encode(body).byteLength, arrayBuffer: () => Promise.resolve(new TextEncoder().encode(body).buffer) });

describe("authored task documents", () => {
  it("decodes legacy content, but rejects malformed documents", () => {
    for (const documents of [undefined, null]) expect(TaskContent.parse({ resources: [], quiz: null, documents }).documents).toEqual([]);
    for (const documents of [{}, ["x"], [{ title: "", body: "hi" }], [{ title: "Hi", body: " " }], [{ title: "Hi", body: "bad\u0000" }]]) {
      expect(TaskContent.safeParse({ resources: [], quiz: null, documents }).success).toBe(false);
    }
  });

  it("preserves Markdown whitespace and copy snapshots through editing", () => {
    const body = "  # Guide\n\n```js\n  const number = 2;\n```\n";
    const parsed = TaskContent.parse({ resources: [], quiz: null, documents: [{ title: " Guide ", body }] });
    const draft = contentForEdit(parsed);
    expect(cleanContent(draft).documents).toEqual([{ title: "Guide", body }]);
    const first = draft.documents?.[0];
    if (first) first.body = "changed";
    expect(parsed.documents[0]?.body).toBe(body);
    expect(emptyContent().documents).toEqual([]);
  });

  it("matches server bounds in code points and rejects control characters before normalization", () => {
    const valid = { title: "🧠".repeat(80), body: "🧠".repeat(20_000) };
    expect(validateDocuments([valid])).toEqual({});
    expect(TaskContent.safeParse({ resources: [], quiz: null, documents: [valid] }).success).toBe(true);
    expect(validateDocuments([{ ...valid, title: `${valid.title}x` }])["documents[0].title"]).toBeTruthy();
    expect(validateDocuments([{ ...valid, body: `${valid.body}x` }])["documents[0].body"]).toBeTruthy();
    for (const control of ["\u0000", "\u0085", "\u2028", "\u2029", "\ud800"]) {
      expect(validateDocuments([{ title: `Guide${control}title`, body: "Text" }])["documents[0].title"]).toBeTruthy();
      expect(validateDocuments([{ title: "Guide", body: `Text${control}` }])["documents[0].body"]).toBeTruthy();
    }
    expect(validateDocuments([{ title: " Guide\n\t title ", body: "Text\n\tmore\r\n" }])).toEqual({});
    expect(validateDocuments(Array.from({ length: 6 }, () => ({ title: "Guide", body: "Text" }))).documents).toBeTruthy();
  });

  it("imports local UTF-8 Markdown into a new titled document", async () => {
    expect(await documentFromMarkdownFile(file("flexbox-guide.MD", "# Layout\n\n- [ ] Try it\n"))).toEqual({ title: "flexbox guide", body: "# Layout\n\n- [ ] Try it\n" });
    expect((await documentFromMarkdownFile(file("a".repeat(100) + ".markdown", "Lesson"))).title).toHaveLength(80);
  });

  it("rejects wrong files, empty/oversized documents, unreadable files and invalid UTF-8", async () => {
    await expect(documentFromMarkdownFile(file("script.html", "# Unsafe"))).rejects.toThrow(/\.md/);
    await expect(documentFromMarkdownFile(file("empty.md", " \n"))).rejects.toThrow(/Write the document/);
    await expect(documentFromMarkdownFile(file("long.md", "a".repeat(20_001)))).rejects.toThrow(/20,000/);
    await expect(documentFromMarkdownFile({ ...file("big.md", "text"), size: 80_001 })).rejects.toThrow(/80 KB/);
    await expect(documentFromMarkdownFile({ name: "broken.md", size: 1, arrayBuffer: () => Promise.resolve(Uint8Array.of(0xff).buffer) })).rejects.toThrow(/UTF-8/);
    await expect(documentFromMarkdownFile({ name: "unreadable.md", size: 1, arrayBuffer: () => Promise.reject(new Error("not found")) })).rejects.toThrow(/Couldn't read/);
  });
});
