"use client";

import { Info, X } from "lucide-react";
import { useSyncExternalStore, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EVENT = "stackstep:info-note";
const storageKey = (id: string) => `info-note:${id}`;

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

function read(id: string): boolean {
  try {
    return localStorage.getItem(storageKey(id)) === "hidden";
  } catch {
    return false;
  }
}

function write(id: string, hidden: boolean) {
  try {
    if (hidden) localStorage.setItem(storageKey(id), "hidden");
    else localStorage.removeItem(storageKey(id));
  } catch {
    // Private mode: the note just stays open.
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * A short "what is this and what do I do here" box at the top of a page or tab. Every screen
 * has one. Once read it can be put away ("Got it"), leaving an "About this page" button.
 */
export function InfoNote({ id, title, children, className }: { id: string; title: string; children: ReactNode; className?: string }) {
  const hidden = useSyncExternalStore(
    subscribe,
    () => read(id),
    () => false,
  );
  if (hidden) {
    return (
      <Button variant="ghost" size="sm" className={cn("text-muted-foreground w-fit", className)} onClick={() => write(id, false)} data-testid="info-note-show">
        <Info data-icon="inline-start" aria-hidden /> About this page
      </Button>
    );
  }
  return (
    <aside className={cn("bg-muted/40 animate-enter flex flex-col gap-1 rounded-xl border px-4 py-3 text-sm", className)} aria-label={title} data-testid="info-note">
      <div className="flex items-center gap-2">
        <Info className="text-primary size-4 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1 font-medium">{title}</p>
        <Button variant="ghost" size="icon-sm" className="-my-1 -mr-2 shrink-0" onClick={() => write(id, true)} aria-label={`Got it, hide "${title}"`} title="Got it">
          <X aria-hidden />
        </Button>
      </div>
      <div className="text-muted-foreground pl-6 leading-relaxed">{children}</div>
    </aside>
  );
}
