import { type TaskDocument } from "./api/schemas";
import { ContentBounds, validateDocuments } from "./content";
import { normalizeLine } from "./validation";

type MarkdownFile = Pick<File, "name" | "size" | "arrayBuffer">;

/** Reads local UTF-8 Markdown as a new document; it never fetches a URL or replaces text. */
export async function documentFromMarkdownFile(file: MarkdownFile): Promise<TaskDocument> {
  if (!/\.(md|markdown)$/i.test(file.name)) throw new Error("Choose a .md or .markdown file.");
  if (file.size > ContentBounds.documentFileBytesMax) throw new Error("Choose a Markdown file smaller than 80 KB.");
  let body: string;
  try {
    body = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    throw new Error("Couldn't read this file. Save it as UTF-8 Markdown and try again.");
  }
  const filename = file.name.replace(/\.(md|markdown)$/i, "").replace(/[_-]+/g, " ");
  const title = [...normalizeLine(filename || "Task guide")].slice(0, ContentBounds.documentTitleMax).join("");
  const document = { title, body };
  const errors = validateDocuments([document]);
  const error = Object.values(errors)[0];
  if (error) throw new Error(error);
  return document;
}
