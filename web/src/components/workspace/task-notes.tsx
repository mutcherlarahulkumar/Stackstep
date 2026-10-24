"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, NotebookPen, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, messageFor } from "@/lib/api/errors";
import { type TaskNote } from "@/lib/api/schemas";
import { dateTimeLabel } from "@/lib/format";
import { NOTE_MAX, noteStatus } from "@/lib/notes";
import { useSession } from "@/lib/session";
import { runeLength } from "@/lib/validation";

import { SafeMarkdown } from "../ai/markdown";

/** Private Markdown notes on a task; the student can share them with the reviewer. */
export function TaskNotes({ taskId }: { taskId: string }) {
  const { api } = useSession();
  const q = useQuery({ queryKey: ["note", taskId], queryFn: () => api.myNote(taskId) });
  return (
    <section aria-labelledby="notes-title" className="mt-6" data-testid="task-notes">
      <h3 id="notes-title" className="mb-2 flex items-center gap-2 text-sm font-medium">
        <NotebookPen className="text-muted-foreground size-4" aria-hidden /> Your notes
      </h3>
      {q.isPending ? (
        <Skeleton className="h-28 w-full" />
      ) : q.isError ? (
        <p className="text-destructive text-sm">{messageFor(q.error)}</p>
      ) : (
        <Editor key={q.data.updated_at?.toISOString() ?? "new"} taskId={taskId} saved={q.data} />
      )}
    </section>
  );
}

function Editor({ taskId, saved }: { taskId: string; saved: TaskNote }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const [body, setBody] = useState(saved.body);
  const [shared, setShared] = useState(saved.shared);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [error, setError] = useState<string | null>(null);
  const status = noteStatus(saved, body, shared);
  const length = runeLength(body);
  const save = useMutation({
    mutationFn: () => api.saveNote(taskId, body, shared),
    onSuccess: (n) => {
      setError(null);
      qc.setQueryData(["note", taskId], n);
      toast.success(n.updated_at === null ? "Notes cleared" : n.shared ? "Notes saved and shared with your reviewer" : "Notes saved");
    },
    onError: (e) => setError(e instanceof ApiError && e.code === "validation_failed" ? (e.fields.body ?? messageFor(e)) : messageFor(e)),
  });
  const tooLong = length > NOTE_MAX;
  const submit = () => {
    if (status !== "saved" && !tooLong && !save.isPending) save.mutate();
  };

  return (
    <div className="flex flex-col gap-2">
      <ToggleGroup type="single" size="sm" variant="outline" value={mode} onValueChange={(v) => (v === "write" || v === "preview" ? setMode(v) : null)} aria-label="Notes view">
        <ToggleGroupItem value="write" aria-label="Write">
          <Pencil aria-hidden /> Write
        </ToggleGroupItem>
        <ToggleGroupItem value="preview" aria-label="Preview" disabled={body.trim() === ""}>
          <Eye aria-hidden /> Preview
        </ToggleGroupItem>
      </ToggleGroup>
      {mode === "write" ? (
        <Textarea
          aria-label="Your notes (Markdown)"
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={"What you tried, links you found, what you'd do next…\nMarkdown works: **bold**, - lists, `code`."}
          className="font-mono text-[0.85rem]"
          aria-invalid={tooLong || !!error}
          data-testid="note-body"
        />
      ) : (
        <div className="bg-muted/40 max-h-80 overflow-y-auto rounded-md border p-3" data-testid="note-preview">
          <SafeMarkdown>{body}</SafeMarkdown>
        </div>
      )}
      <label className="flex items-start gap-3 rounded-md border p-2.5">
        <Switch checked={shared} onCheckedChange={setShared} className="mt-0.5" data-testid="note-share" />
        <span className="flex flex-col text-sm">
          <span className="font-medium">Share with your reviewer</span>
          <span className="text-muted-foreground text-xs">They see these notes next to your hand-in. Off means only you can read them.</span>
        </span>
      </label>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs tabular-nums" aria-live="polite">
          {tooLong
            ? `${length.toLocaleString()} / ${NOTE_MAX.toLocaleString()} characters — too long`
            : status === "saved"
              ? saved.updated_at
                ? `Saved ${dateTimeLabel(saved.updated_at)}${saved.shared ? " · shared" : ""}`
                : "Only you can see your notes unless you share them."
              : "Unsaved changes"}
        </span>
        <Button size="sm" onClick={submit} disabled={status === "saved" || tooLong || save.isPending} data-testid="note-save">
          {save.isPending ? <Spinner data-icon="inline-start" /> : null}
          Save notes
        </Button>
      </div>
    </div>
  );
}

/** A student's shared notes, for reviewers. */
export function SharedNote({ note }: { note: TaskNote }) {
  return (
    <details className="text-muted-foreground text-xs" data-testid="shared-note">
      <summary className="cursor-pointer select-none">
        <NotebookPen className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
        Student&apos;s notes{note.updated_at ? ` · ${dateTimeLabel(note.updated_at)}` : ""}
      </summary>
      <div className="text-foreground bg-muted/40 mt-1 max-h-72 overflow-y-auto rounded-md border p-2.5">
        <SafeMarkdown>{note.body}</SafeMarkdown>
      </div>
    </details>
  );
}
