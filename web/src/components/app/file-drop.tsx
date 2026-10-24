"use client";

import { FileUp } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Drop a file here or choose one. Only reads it in the browser; nothing is uploaded by this component. */
export function FileDrop({ accept, onFile, label, hint }: { accept: string; onFile: (f: File) => void; label: string; hint?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const hintId = useId();
  const take = (f: File | undefined) => {
    if (!f) return;
    setName(f.name);
    onFile(f);
  };
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files[0]);
      }}
      className={cn("flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 text-sm transition-colors", over ? "border-primary bg-primary/5" : "border-input")}
      data-testid="file-drop"
    >
      <FileUp className="text-muted-foreground size-4" aria-hidden />
      <span className="text-muted-foreground min-w-0 flex-1 truncate" id={hintId}>
        {name ? <span className="text-foreground">{name}</span> : (hint ?? "Drop a file here")}
      </span>
      <Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()} aria-describedby={hintId}>
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
