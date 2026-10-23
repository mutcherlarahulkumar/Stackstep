"use client";

import { ArrowUp, Bot, SquareKanban } from "lucide-react";
import { Fragment, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { type Message } from "@/lib/api/schemas";
import { dayLabel, timeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Bounds, runeLength } from "@/lib/validation";

import { EmptyState, ErrorState, ListSkeleton } from "../app/state";
import { type Outgoing, type useWorkspace } from "./use-workspace";

type Workspace = ReturnType<typeof useWorkspace>;

type Row = { key: string; at: Date; mine: boolean; body: string; taskId: string | null; outgoing: Outgoing | null };

function rows(messages: Message[], outgoing: Outgoing[]): Row[] {
  // Oldest first for rendering top-to-bottom.
  const delivered: Row[] = [...messages].reverse().map((m) => ({
    key: m.id,
    at: m.sent_at,
    mine: m.author === "student",
    body: m.body,
    taskId: m.task_id,
    outgoing: null,
  }));
  return [...delivered, ...outgoing.map((o) => ({ key: `out-${o.clientId}`, at: o.at, mine: true, body: o.body, taskId: null, outgoing: o }))];
}

const QUICK_REPLIES = ["PR ready for review", "I'm stuck on this", "Good morning"];

export function ChatPanel({ ws, onOpenTask }: { ws: Workspace; onOpenTask: (taskId: string) => void }) {
  const { state } = ws;
  if (state.messages.status === "loading") {
    return (
      <div className="p-4">
        <ListSkeleton rows={6} className="h-12" />
      </div>
    );
  }
  if (state.messages.status === "error") return <ErrorState message={state.messages.message} onRetry={ws.reload} />;
  return <Thread ws={ws} messages={state.messages.data} onOpenTask={onOpenTask} />;
}

function Thread({ ws, messages, onOpenTask }: { ws: Workspace; messages: Message[]; onOpenTask: (taskId: string) => void }) {
  const list = rows(messages, ws.state.outgoing);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const prevHeight = useRef(0);
  const now = new Date();

  // Keep the newest message in view unless the reader scrolled up; keep position when older pages load.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    else if (prevHeight.current && el.scrollTop < 40) el.scrollTop += el.scrollHeight - prevHeight.current;
    prevHeight.current = el.scrollHeight;
  }, [list.length]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 200) void ws.loadOlder();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Chat with your team lead"
        data-testid="chat-log"
      >
        {ws.state.nextCursor === null ? (
          <p className="text-muted-foreground py-6 text-center text-xs">This is the start of your internship chat.</p>
        ) : ws.state.loadingOlder ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : null}
        {list.length === 0 ? (
          <EmptyState icon={Bot} title="Say hi to your team lead">
            Your lead posts standups and tickets here. Ask anything — replies take a minute, like on a real team.
          </EmptyState>
        ) : (
          <ol className="flex flex-col">
            {list.map((r, i) => {
              const prev = list[i - 1];
              const next = list[i + 1];
              const newDay = !prev || dayLabel(prev.at, now) !== dayLabel(r.at, now);
              const groupedWithPrev = !!prev && !newDay && prev.mine === r.mine && r.at.getTime() - prev.at.getTime() < 300_000;
              const groupedWithNext = !!next && next.mine === r.mine && next.at.getTime() - r.at.getTime() < 300_000 && dayLabel(next.at, now) === dayLabel(r.at, now);
              return (
                <Fragment key={r.key}>
                  {newDay ? (
                    <li className="my-3 flex justify-center" aria-hidden>
                      <span className="bg-muted text-muted-foreground rounded-full px-3 py-0.5 text-xs font-medium">{dayLabel(r.at, now)}</span>
                    </li>
                  ) : null}
                  <Bubble row={r} showAvatar={!groupedWithPrev} showMeta={!groupedWithNext} ws={ws} onOpenTask={onOpenTask} />
                </Fragment>
              );
            })}
          </ol>
        )}
      </div>
      <Composer onSend={ws.send} />
    </div>
  );
}

function Bubble({ row, showAvatar, showMeta, ws, onOpenTask }: { row: Row; showAvatar: boolean; showMeta: boolean; ws: Workspace; onOpenTask: (id: string) => void }) {
  const o = row.outgoing;
  const failed = !!o?.error;
  const sending = !!o && !failed;
  return (
    <li className={cn("flex gap-2", row.mine ? "justify-end" : "justify-start", showMeta ? "mb-3" : "mb-0.5")}>
      {!row.mine ? (
        showAvatar ? (
          <Avatar size="sm" className="mt-0.5">
            <AvatarFallback className="bg-primary text-primary-foreground">
              <Bot className="size-3.5" aria-hidden />
            </AvatarFallback>
          </Avatar>
        ) : (
          <span className="w-6 shrink-0" />
        )
      ) : null}
      <div className={cn("flex max-w-[min(36rem,85%)] flex-col", row.mine ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2 text-[0.94rem] leading-relaxed break-words whitespace-pre-wrap transition-opacity",
            row.mine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted text-foreground rounded-bl-md",
            sending && "opacity-60",
            failed && "ring-destructive ring-2",
          )}
        >
          <span className="sr-only">{row.mine ? "You: " : "Team lead: "}</span>
          {row.body}
          {row.taskId ? (
            <div className="mt-2">
              <Button size="sm" variant="outline" className="bg-background text-foreground" onClick={() => onOpenTask(row.taskId ?? "")}>
                <SquareKanban data-icon="inline-start" aria-hidden />
                Open task
              </Button>
            </div>
          ) : null}
        </div>
        {failed && o ? (
          <p className="text-destructive mt-1 flex items-center gap-2 text-xs" role="alert">
            {o.error}
            <Button size="xs" variant="outline" onClick={() => ws.retry(o)}>
              Retry
            </Button>
            <Button size="xs" variant="ghost" onClick={() => ws.discard(o)}>
              Delete
            </Button>
          </p>
        ) : showMeta || sending ? (
          <p className="text-muted-foreground mt-1 px-1 text-xs">{sending ? "Sending…" : timeLabel(row.at)}</p>
        ) : null}
      </div>
    </li>
  );
}

function Composer({ onSend }: { onSend: (raw: string) => string | null }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const length = runeLength(text.trim());
  const canSend = text.trim().length > 0 && length <= Bounds.messageMax;

  const submit = (preset?: string) => {
    const err = onSend(preset ?? text);
    if (err) {
      setError(err);
      return;
    }
    if (preset === undefined) setText("");
    ref.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSend) submit();
    }
  };

  return (
    <form
      className="bg-background border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) submit();
      }}
    >
      {text === "" ? (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1" aria-label="Quick replies">
          {QUICK_REPLIES.map((q) => (
            <Button key={q} type="button" size="sm" variant="outline" className="shrink-0 rounded-full" onClick={() => submit(q)}>
              {q}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <label htmlFor="chat-input" className="sr-only">
          Message your team lead
        </label>
        <Textarea
          id="chat-input"
          ref={ref}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onKeyDown={onKeyDown}
          placeholder="Message your team lead"
          rows={1}
          aria-invalid={!!error || length > Bounds.messageMax}
          aria-describedby="chat-hint"
          className="max-h-40 min-h-10 resize-none"
        />
        <Button type="submit" size="icon-lg" disabled={!canSend} aria-label="Send message">
          <ArrowUp aria-hidden />
        </Button>
      </div>
      <div id="chat-hint" className="mt-1.5 flex min-h-4 items-center justify-between gap-2 text-xs">
        <span className={error ? "text-destructive" : "text-muted-foreground hidden sm:inline"} role={error ? "alert" : undefined}>
          {error ?? "Enter to send · Shift+Enter for a new line"}
        </span>
        {length > Bounds.messageMax - 500 ? (
          <span className={cn("tabular-nums", length > Bounds.messageMax ? "text-destructive" : "text-muted-foreground")}>
            {length} / {Bounds.messageMax}
          </span>
        ) : null}
      </div>
    </form>
  );
}
