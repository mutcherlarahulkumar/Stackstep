"use client";

import { ArrowLeft, BookOpen, ChevronRight } from "lucide-react";

import { DocumentMarkdown } from "@/components/app/document-markdown";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { type TaskDocument } from "@/lib/api/schemas";

export function TaskDocuments({ documents }: { documents: readonly TaskDocument[] }) {
  if (documents.length === 0) return null;
  return (
    <section aria-label="Task guides" className="mt-6" data-testid="task-documents">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-medium"><BookOpen className="text-muted-foreground size-4" aria-hidden />Task guides</h3>
      <p className="text-muted-foreground mb-3 text-xs">Read the lesson here, then return to your task.</p>
      <ul className="flex flex-col gap-2">
        {documents.map((document, i) => (
          <li key={i}>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="h-auto min-h-14 w-full justify-start gap-3 px-3 py-3 text-left whitespace-normal" aria-label={`Read ${document.title}`} data-testid={`read-document-${i}`}>
                  <BookOpen className="text-primary size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1"><span className="block font-medium break-words">{document.title}</span><span className="text-muted-foreground mt-0.5 block text-xs font-normal">{Math.max(1, Math.ceil(document.body.trim().split(/\s+/u).length / 200))} min read · In-app guide</span></span>
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-3xl" data-testid="document-reader">
                <DialogHeader className="border-b p-5 pr-12">
                  <DialogTitle className="text-xl leading-snug break-words">{document.title}</DialogTitle>
                  <DialogDescription>Task guide · Read without leaving your workspace.</DialogDescription>
                </DialogHeader>
                <article aria-label={document.title} className="min-h-0 min-w-0 overflow-y-auto overscroll-contain p-5 sm:p-7" tabIndex={0}>
                  <DocumentMarkdown>{document.body}</DocumentMarkdown>
                </article>
                <div className="bg-muted/40 flex justify-start border-t p-3">
                  <DialogClose asChild><Button variant="outline" aria-label="Back to task"><ArrowLeft data-icon="inline-start" aria-hidden />Back to task</Button></DialogClose>
                </div>
              </DialogContent>
            </Dialog>
          </li>
        ))}
      </ul>
    </section>
  );
}
