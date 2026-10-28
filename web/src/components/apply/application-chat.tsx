"use client";

import { ArrowUp, Info, MessagesSquare } from "lucide-react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { type ApplicationMessage } from "@/lib/api/schemas";
import { applyErrorMessage } from "@/lib/apply";
import { dateTimeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX = 4000;

/**
 * The application's chat with the admissions team. Students see "Admissions"; staff see the
 * student's name. Stackstep's own status lines sit in the middle.
 */
export function ApplicationChat({
  messages,
  viewer,
  otherName,
  onSend,
  className,
}: {
  messages: ApplicationMessage[];
  viewer: "applicant" | "staff";
  otherName: string;
  onSend: (clientId: string, body: string) => Promise<unknown>;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientId = useRef<string>("");
  const end = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    if (body.length > MAX) {
      setError(`Keep it under ${MAX} characters.`);
      return;
    }
    // One id per message, kept across retries so a resend never doubles it.
    if (!clientId.current) clientId.current = crypto.randomUUID();
    setBusy(true);
    setError(null);
    try {
      await onSend(clientId.current, body);
      clientId.current = "";
      setText("");
    } catch (e) {
      setError(applyErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <section aria-label="Messages" className={cn("bg-card flex flex-col rounded-xl border", className)} data-testid="application-chat">
      <h2 className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium">
        <MessagesSquare className="text-muted-foreground size-4" aria-hidden />
        {viewer === "applicant" ? "Questions? Message the admissions team" : `Chat with ${otherName}`}
      </h2>
      <ol className="flex max-h-96 min-h-32 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 ? (
          <li className="text-muted-foreground m-auto text-center text-sm">
            {viewer === "applicant" ? "Stuck on the payment or the form? Ask here — a person replies." : "No messages yet."}
          </li>
        ) : null}
        {messages.map((m) => {
          if (m.author === "system") {
            return (
              <li key={m.id} className="bg-muted text-muted-foreground mx-auto flex max-w-md gap-2 rounded-lg px-3 py-2 text-xs whitespace-pre-line" data-testid="application-system-message">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>{m.body}</span>
              </li>
            );
          }
          const mine = m.author === viewer;
          const who = mine ? "You" : m.author === "staff" ? "Admissions" : otherName;
          return (
            <li key={m.id} className={cn("flex max-w-[85%] flex-col gap-1", mine ? "items-end self-end" : "items-start self-start")} data-testid="application-message">
              <span className="text-muted-foreground text-[11px]">
                {who} · <time dateTime={m.created_at.toISOString()}>{dateTimeLabel(m.created_at)}</time>
              </span>
              <p className={cn("rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap", mine ? "bg-primary text-primary-foreground" : "bg-muted")}>{m.body}</p>
            </li>
          );
        })}
        <div ref={end} />
      </ol>
      <form
        className="flex flex-col gap-1.5 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            className="max-h-32 min-h-10 resize-none"
            placeholder="Write a message"
            aria-label="Message"
            aria-invalid={!!error}
            data-testid="application-chat-input"
          />
          <Button type="submit" size="icon" disabled={busy || !text.trim()} aria-label="Send message" data-testid="application-chat-send">
            {busy ? <Spinner /> : <ArrowUp aria-hidden />}
          </Button>
        </div>
        {error ? (
          <p className="text-destructive text-xs" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
