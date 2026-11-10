"use client";

import { useMutation } from "@tanstack/react-query";
import { Compass, LifeBuoy, RotateCcw, SendHorizontal, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { messageFor } from "@/lib/api/errors";
import { type HelpTurn } from "@/lib/api/schemas";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { Prose } from "../app/prose";
import { startTour, useTourAvailable } from "./tour";

type Turn = HelpTurn & { topics?: string[]; guide?: boolean };

const SUGGESTIONS = ["How do I hand in a task?", "When does Day 1 start?", "What are credits for?", "How do I join a live class?", "How is attendance marked?"];

const STORE = "stackstep-help";
function load(): Turn[] {
  try {
    const raw = sessionStorage.getItem(STORE);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? (v as Turn[]).filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string").slice(-20) : [];
  } catch {
    return [];
  }
}

/**
 * The help assistant: a chat bubble in the corner that answers questions about using
 * Stackstep from our own student guide. It doesn't know (or talk about) staff tools.
 */
export function HelpWidget({ inline = false }: { inline?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {inline ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen((o) => !o)}
          className="gap-2 rounded-full"
          aria-expanded={open}
          aria-controls="help-panel"
          aria-label="Help"
          data-testid="help-open"
          data-tour="help"
        >
          <LifeBuoy aria-hidden />
          <span className="hidden lg:inline">Help</span>
        </Button>
      ) : (
        <Button
          onClick={() => setOpen((o) => !o)}
          className={cn("fixed right-4 bottom-4 z-40 h-12 gap-2 rounded-full px-4 shadow-lg print:hidden", open && "max-sm:hidden")}
          aria-expanded={open}
          aria-controls="help-panel"
          data-testid="help-open"
          data-tour="help"
        >
          {open ? <X aria-hidden /> : <LifeBuoy aria-hidden />}
          <span className="hidden sm:inline">{open ? "Close help" : "Help"}</span>
          <span className="sr-only sm:hidden">{open ? "Close help" : "Help"}</span>
        </Button>
      )}
      {/* At the page root: a blurred header would otherwise trap the fixed panel inside it. */}
      {open ? createPortal(<Panel onClose={() => setOpen(false)} inline={inline} />, document.body) : null}
    </>
  );
}

function Panel({ onClose, inline }: { onClose: () => void; inline: boolean }) {
  const { api } = useSession();
  const tour = useTourAvailable();
  const [turns, setTurns] = useState<Turn[]>(load);
  const [draft, setDraft] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(turns.slice(-20)));
    } catch {
      // Private windows may refuse storage; the chat still works.
    }
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [turns]);
  useEffect(() => {
    input.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const ask = useMutation({
    mutationFn: (q: string) =>
      api.askHelp(
        q,
        turns.slice(-6).map(({ role, content }) => ({ role, content: content.slice(0, 1500) })),
      ),
    onSuccess: (a) => setTurns((t) => [...t, { role: "assistant", content: a.answer, topics: a.topics.map((x) => x.title), guide: !a.ai }]),
    onError: (e) => setTurns((t) => [...t, { role: "assistant", content: messageFor(e) }]),
  });
  const send = (q: string) => {
    const text = q.trim().slice(0, 500);
    if (!text || ask.isPending) return;
    setTurns((t) => [...t, { role: "user", content: text }]);
    setDraft("");
    ask.mutate(text);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(draft);
  };

  return (
    <section
      id="help-panel"
      aria-label="Help"
      className={cn(
        "bg-popover text-popover-foreground animate-in fade-in slide-in-from-bottom-4 fixed z-50 flex flex-col overflow-hidden shadow-2xl ring-1 ring-black/10 max-sm:inset-0 sm:right-4 sm:h-[min(560px,calc(100dvh-7rem))] sm:w-[380px] sm:rounded-2xl",
        inline ? "sm:top-16" : "sm:bottom-20",
      )}
      data-testid="help-panel"
    >
      <header className="from-primary flex items-center gap-3 bg-gradient-to-br to-fuchsia-500 px-4 py-3 text-white">
        <span className="grid size-9 place-items-center rounded-full bg-white/20">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Stackstep help</h2>
          <p className="text-xs text-white/80">Answers from our student guide</p>
        </div>
        {turns.length > 0 ? (
          <Button size="icon-sm" variant="ghost" className="text-white hover:bg-white/15 hover:text-white" aria-label="Start over" onClick={() => setTurns([])}>
            <RotateCcw aria-hidden />
          </Button>
        ) : null}
        <Button size="icon-sm" variant="ghost" className="text-white hover:bg-white/15 hover:text-white" aria-label="Close help" onClick={onClose} data-testid="help-close">
          <X aria-hidden />
        </Button>
      </header>

      <div ref={list} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
        <Bubble role="assistant">Hi! Ask me anything about using Stackstep, from applying and Day 1 to hand-ins, reviews, credits, classes and the app.</Bubble>
        {tour ? (
          <button
            type="button"
            onClick={() => {
              onClose();
              startTour();
            }}
            className="border-primary/30 bg-primary/5 hover:bg-primary/10 flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-sm font-medium"
            data-testid="help-tour"
          >
            <Compass className="text-primary size-4" aria-hidden /> Take the tour of this page
          </button>
        ) : null}
        {turns.length === 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => send(s)} className="bg-muted hover:bg-accent rounded-full px-3 py-1.5 text-left text-xs" data-testid="help-suggestion">
                {s}
              </button>
            ))}
          </div>
        ) : null}
        {turns.map((t, i) => (
          <Bubble key={i} role={t.role} topics={t.topics} guide={t.guide}>
            {t.content}
          </Bubble>
        ))}
        {ask.isPending ? (
          <span className="text-muted-foreground flex items-center gap-2 text-xs">
            <Spinner /> Looking it up
          </span>
        ) : null}
      </div>

      <form onSubmit={submit} className="flex items-end gap-2 border-t p-3">
        <Textarea
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
          rows={1}
          maxLength={500}
          placeholder="Ask how something works"
          aria-label="Your question"
          className="max-h-28 min-h-10 resize-none"
          data-testid="help-input"
        />
        <Button type="submit" size="icon" disabled={!draft.trim() || ask.isPending} aria-label="Send" data-testid="help-send">
          <SendHorizontal aria-hidden />
        </Button>
      </form>
      <p className="text-muted-foreground px-4 pb-2 text-center text-[10px]">For your tasks and reviews, ask your team lead in chat.</p>
    </section>
  );
}

function Bubble({ role, children, topics, guide }: { role: HelpTurn["role"]; children: string; topics?: string[]; guide?: boolean }) {
  const mine = role === "user";
  return (
    <div className={cn("flex max-w-[88%] flex-col gap-1", mine ? "self-end items-end" : "self-start")} data-testid={mine ? "help-q" : "help-a"}>
      <div className={cn("rounded-2xl px-3.5 py-2.5 text-sm", mine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md")}>
        {mine ? <p className="whitespace-pre-wrap">{children}</p> : <Prose className="prose-sm [&_p]:my-1">{children}</Prose>}
      </div>
      {topics && topics.length > 0 ? (
        <p className="text-muted-foreground text-[10px]">
          {guide ? "From the guide" : "Based on"} · {topics.slice(0, 2).join(", ")}
        </p>
      ) : null}
    </div>
  );
}
