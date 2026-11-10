"use client";

import { BookOpen, Eye, FileUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { DocumentMarkdown } from "@/components/app/document-markdown";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type TaskDocument } from "@/lib/api/schemas";
import { ContentBounds } from "@/lib/content";
import { documentFromMarkdownFile } from "@/lib/markdown-file";
import { runeLength } from "@/lib/validation";

type DocumentsUpdate = (current: TaskDocument[]) => TaskDocument[];

/** Documents are snapshots on each task. Import always adds a new one, preserving drafts. */
export function DocumentsEditor({ value, onChange, errors, idPrefix, onImportingChange }: {
  value: TaskDocument[];
  onChange: (update: DocumentsUpdate) => void;
  onImportingChange?: (busy: boolean) => void;
  errors: Record<string, string | undefined>;
  idPrefix: string;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  // Read the current callback after asynchronous local file I/O, not the render that
  // launched it. Editing another form field during import must never lose that edit.
  const current = useRef({ value, onChange, onImportingChange });
  const mounted = useRef(false);
  useEffect(() => { current.current = { value, onChange, onImportingChange }; }, [value, onChange, onImportingChange]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const importFile = async (file: File) => {
    setImporting(true);
    current.current.onImportingChange?.(true);
    setImportError(null);
    try {
      const document = await documentFromMarkdownFile(file);
      if (!mounted.current) return;
      if (current.current.value.length >= ContentBounds.documents) {
        setImportError(`Add at most ${ContentBounds.documents} documents. Remove one before importing.`);
        return;
      }
      current.current.onChange((documents) => [...documents, document]);
      setPreview(null);
    } catch (error) {
      if (mounted.current) setImportError(error instanceof Error ? error.message : "Couldn't import this file. Try again.");
    } finally {
      if (mounted.current) {
        setImporting(false);
        current.current.onImportingChange?.(false);
      }
    }
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-3 rounded-lg border p-4" disabled={importing} data-testid="documents-editor">
      <legend className="px-1 text-sm font-medium">In-app documents</legend>
      <FieldDescription>Write a lesson in Markdown or import a .md file. Students read it here without leaving the app. Optional external references belong in Links.</FieldDescription>
      <ol className="flex min-w-0 flex-col gap-4">
        {value.map((document, i) => {
          const titleError = errors[`documents[${i}].title`];
          const bodyError = errors[`documents[${i}].body`];
          const set = (patch: Partial<TaskDocument>) => onChange((documents) => documents.map((item, index) => index === i ? { ...item, ...patch } : item));
          return (
            <li key={i} className="bg-muted/30 flex min-w-0 flex-col gap-3 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <BookOpen className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <p className="flex-1 text-sm font-medium">Document {i + 1}</p>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove document ${i + 1}`} onClick={() => { onChange((documents) => documents.filter((_, index) => index !== i)); setPreview(null); }}><Trash2 aria-hidden /></Button>
              </div>
              <Field data-invalid={!!titleError}>
                <FieldLabel htmlFor={`${idPrefix}-doc-${i}-title`}>Document {i + 1} title</FieldLabel>
                <Input id={`${idPrefix}-doc-${i}-title`} value={document.title} placeholder="e.g. Flexbox: build a responsive navigation" aria-invalid={!!titleError} onChange={(event) => set({ title: event.target.value })} />
                {titleError ? <FieldError>{titleError}</FieldError> : null}
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FieldLabel htmlFor={`${idPrefix}-doc-${i}-body`}>Document {i + 1} Markdown</FieldLabel>
                <Button type="button" variant="outline" size="sm" aria-label={preview === i ? `Write document ${i + 1}` : `Preview document ${i + 1}`} aria-pressed={preview === i} onClick={() => setPreview(preview === i ? null : i)}>
                  {preview === i ? <Pencil data-icon="inline-start" aria-hidden /> : <Eye data-icon="inline-start" aria-hidden />}{preview === i ? "Write" : "Preview"}
                </Button>
              </div>
              {preview === i ? (
                <div className="bg-background max-h-96 min-h-32 min-w-0 overflow-y-auto rounded-md border p-4" role="region" aria-label={`Document ${i + 1} preview`}>
                  {document.body.trim() ? <DocumentMarkdown>{document.body}</DocumentMarkdown> : <p className="text-muted-foreground text-sm">Write your document first, then preview it here.</p>}
                </div>
              ) : <Textarea id={`${idPrefix}-doc-${i}-body`} value={document.body} rows={10} className="field-sizing-fixed max-h-96 overflow-y-auto font-mono text-sm" aria-invalid={!!bodyError} placeholder={"# Your learning guide\n\n## Goal\nWhat will the student be able to do?\n\n## Try it\nSteps and examples.\n\n## Done when\n- [ ] A measurable result."} onChange={(event) => set({ body: event.target.value })} />}
              {bodyError ? <FieldError>{bodyError}</FieldError> : null}
              <p className="text-muted-foreground text-xs tabular-nums">{runeLength(document.body).toLocaleString()} / {ContentBounds.documentBodyMax.toLocaleString()} characters · Headings, code, tables and checklists</p>
            </li>
          );
        })}
      </ol>
      {errors.documents ? <FieldError>{errors.documents}</FieldError> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" disabled={value.length >= ContentBounds.documents} onClick={() => onChange((documents) => [...documents, { title: "", body: "" }])}><Plus data-icon="inline-start" aria-hidden />Add document</Button>
        <span className="text-muted-foreground text-xs tabular-nums">{value.length} / {ContentBounds.documents} documents</span>
      </div>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-import`} className="flex items-center gap-2"><FileUp className="size-4" aria-hidden />Import Markdown</FieldLabel>
        <Input id={`${idPrefix}-import`} type="file" accept=".md,.markdown,text/markdown" disabled={value.length >= ContentBounds.documents} onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importFile(file);
        }} />
        <FieldDescription>UTF-8 · Up to 80 KB and {ContentBounds.documentBodyMax.toLocaleString()} characters. Imports add a document; existing writing stays intact.</FieldDescription>
      </Field>
      {importing ? <p className="text-muted-foreground text-sm" role="status">Importing Markdown…</p> : null}
      {importError ? <p className="text-destructive text-sm" role="alert">{importError}</p> : null}
    </fieldset>
  );
}
