"use client";

import { ArrowUp, MessagesSquare, SmilePlus, SquareKanban } from "lucide-react";
import { toast } from "sonner";
import { Fragment, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { REACTION_EMOJIS, type Message, type Persona } from "@/lib/api/schemas";
import { dayLabel, timeLabel } from "@/lib/format";
import { isMine, isStaffTarget, type ChatTarget } from "@/lib/inbox";
import { REACTION_GLYPH, reactionChips } from "@/lib/reactions";
import { BOT, insertMention, mentionMatches, mentionQuery, speakerKey, speakerOf, splitMentions } from "@/lib/team";
import { cn } from "@/lib/utils";
import { Bounds, runeLength } from "@/lib/validation";

import { ChatSkeleton } from "../app/loading";
import { BotAvatar, PersonaAvatar } from "../app/persona-avatar";
import { EmptyState, ErrorState } from "../app/state";
import { useConversation, type Conversation, type Outgoing } from "./use-conversation";

type Row = {
  key: string;
  at: Date;
  mine: boolean;
  body: string;
  taskId: string | null;
  automated: boolean;
  outgoing: Outgoing | null;
  message: Message | null;
  /** Who said it, for grouping (team rooms have many speakers). */
  speaker: string;
};

function rows(target: ChatTarget, messages: Message[], outgoing: Outgoing[]): Row[] {
  // Oldest first for rendering top-to-bottom.
  const delivered: Row[] = [...messages].reverse().map((m) => ({
    key: m.id,
    at: m.sent_at,
    mine: isMine(target, m),
    body: m.body,
    taskId: m.task_id,
    automated: m.automated,
    outgoing: null,
    message: m,
    speaker: speakerKey(m),
  }));
  return [
    ...delivered,
    ...outgoing.map((o) => ({
      key: `out-${o.clientId}`,
      at: o.at,
      mine: true,
      body: o.body,
      taskId: null,
      automated: false,
      outgoing: o,
      message: null,
      speaker: o.speakerId ?? "student",
    })),
  ];
}

const STUDENT_REPLIES = ["PR ready for review", "I'm stuck on this", "Good morning"];
const STAFF_REPLIES = ["Looks good, thanks!", "Can you share the PR link?", "Let's sync tomorrow"];

/**
 * Who the conversation is with. In a team room `team` lists the personas who speak there;
 * each message then shows its speaker, and the composer suggests @mentions (students) or
 * asks who to speak as (staff).
 */
type Other = { name: string; avatar: ReactNode; team?: { members: Persona[] } };

const TEAM_STUDENT_REPLIES = ["Good morning, team", "I'm stuck on this", "PR ready for review"];

/**
 * One conversation. Students talk to a persona; staff (target.enrollmentId set) see a
 * student and write as the persona. Mount with a `key` per target.
 */
export function ConversationView({ target, other, onOpenTask }: { target: ChatTarget; other: Other; onOpenTask?: (taskId: string) => void }) {
  const ws = useConversation(target);
  const { state } = ws;
  if (state.messages.status === "loading") {
    return (
      <div className="p-4">
        <ChatSkeleton />
      </div>
    );
  }
  if (state.messages.status === "error") return <ErrorState message={state.messages.message} onRetry={() => void ws.reload()} />;
  return <Thread ws={ws} messages={state.messages.data} other={other} onOpenTask={onOpenTask} />;
}

function Thread({ ws, messages, other, onOpenTask }: { ws: Conversation; messages: Message[]; other: Other; onOpenTask?: (taskId: string) => void }) {
  const staff = isStaffTarget(ws.target);
  const list = rows(ws.target, messages, ws.state.outgoing);
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
        aria-label={`Conversation with ${other.name}`}
        data-testid="chat-log"
      >
        {ws.state.nextCursor === null && list.length > 0 ? (
          <p className="text-muted-foreground py-6 text-center text-xs">This is the start of the conversation.</p>
        ) : ws.state.loadingOlder ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : null}
        {list.length === 0 ? (
          <EmptyState icon={MessagesSquare} title={staff ? "No messages yet" : `Say hi to ${other.name}`}>
            {staff
              ? "Write as the persona. The student sees it in their chat right away."
              : `Tickets and updates from ${other.name} land here. Ask questions any time.`}
          </EmptyState>
        ) : (
          <ol className="flex flex-col">
            {list.map((r, i) => {
              const prev = list[i - 1];
              const next = list[i + 1];
              const newDay = !prev || dayLabel(prev.at, now) !== dayLabel(r.at, now);
              const groupedWithPrev = !!prev && !newDay && prev.mine === r.mine && prev.speaker === r.speaker && r.at.getTime() - prev.at.getTime() < 300_000;
              const groupedWithNext =
                !!next &&
                next.mine === r.mine &&
                next.speaker === r.speaker &&
                next.at.getTime() - r.at.getTime() < 300_000 &&
                dayLabel(next.at, now) === dayLabel(r.at, now);
              return (
                <Fragment key={r.key}>
                  {newDay ? (
                    <li className="my-3 flex justify-center" aria-hidden>
                      <span className="bg-muted text-muted-foreground rounded-full px-3 py-0.5 text-xs font-medium">{dayLabel(r.at, now)}</span>
                    </li>
                  ) : null}
                  <Bubble row={r} showAvatar={!groupedWithPrev} showMeta={!groupedWithNext} ws={ws} other={other} onOpenTask={onOpenTask} />
                </Fragment>
              );
            })}
          </ol>
        )}
      </div>
      {other.team && staff ? (
        <StaffTeamComposer ws={ws} members={other.team.members} />
      ) : (
        <Composer
          onSend={(raw) => ws.send(raw)}
          placeholder={other.team ? "Message your team. Type @ to ask someone" : `Message ${other.name}`}
          quickReplies={staff ? STAFF_REPLIES : other.team ? TEAM_STUDENT_REPLIES : STUDENT_REPLIES}
          members={other.team?.members}
        />
      )}
    </div>
  );
}

/** Staff in a team room pick which persona they speak as. */
function StaffTeamComposer({ ws, members }: { ws: Conversation; members: Persona[] }) {
  const [speaker, setSpeaker] = useState<string>(members[0]?.id ?? "");
  const who = members.find((p) => p.id === speaker);
  return (
    <div className="bg-background border-t">
      <div className="flex items-center gap-2 px-4 pt-3 text-xs sm:px-6">
        <span className="text-muted-foreground" id="speak-as">
          Speak as
        </span>
        <Select value={speaker} onValueChange={setSpeaker}>
          <SelectTrigger size="sm" className="h-8 w-auto max-w-full min-w-56" aria-labelledby="speak-as" data-testid="team-speaker">
            <SelectValue placeholder="Pick a persona" />
          </SelectTrigger>
          <SelectContent>
            {members.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <PersonaAvatar persona={p} size="sm" className="size-4" /> {p.name} · {p.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Composer
        onSend={(raw) => (speaker ? ws.send(raw, speaker) : "Pick who you speak as.")}
        placeholder={who ? `Message the team room as ${who.name}` : "Message the team room"}
        quickReplies={STAFF_REPLIES}
        bare
      />
    </div>
  );
}

/** The speaker's name above their first bubble in a team room. */
function SpeakerLabel({ message, members }: { message: Message; members: Persona[] }) {
  const s = speakerOf(message, members);
  const [name, title] = s.kind === "bot" ? [BOT.name, BOT.title] : s.kind === "persona" ? [s.persona.name, s.persona.title] : ["A former teammate", ""];
  return (
    <p className="text-muted-foreground mb-1 px-1 text-xs" data-testid="team-speaker-name">
      <span className="text-foreground font-medium">{name}</span>
      {title ? ` · ${title}` : null}
    </p>
  );
}

function SpeakerAvatar({ message, members }: { message: Message; members: Persona[] }) {
  const s = speakerOf(message, members);
  if (s.kind === "persona") return <PersonaAvatar persona={s.persona} size="sm" />;
  return <BotAvatar size="sm" />;
}

function Body({ text, mentions }: { text: string; mentions: boolean }) {
  if (!mentions) return <>{text}</>;
  return (
    <>
      {splitMentions(text).map((part, i) =>
        part.mention ? (
          <strong key={i} className="font-semibold underline decoration-current/30 underline-offset-2">
            {part.text}
          </strong>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

function Bubble({
  row,
  showAvatar,
  showMeta,
  ws,
  other,
  onOpenTask,
}: {
  row: Row;
  showAvatar: boolean;
  showMeta: boolean;
  ws: Conversation;
  other: Other;
  onOpenTask?: (id: string) => void;
}) {
  const o = row.outgoing;
  const failed = !!o?.error;
  const sending = !!o && !failed;
  const team = other.team;
  // In a team room every persona message names its speaker (staff see it on their own side too).
  const teamSpeaker = team && row.message && row.message.author === "persona" ? row.message : null;
  return (
    <li className={cn("animate-enter flex gap-2", row.mine ? "justify-end" : "justify-start", showMeta ? "mb-3" : "mb-0.5")}>
      {!row.mine ? (
        showAvatar ? (
          <span className="mt-0.5 shrink-0" aria-hidden>
            {teamSpeaker && team ? <SpeakerAvatar message={teamSpeaker} members={team.members} /> : other.avatar}
          </span>
        ) : (
          <span className="w-6 shrink-0" />
        )
      ) : null}
      <div className={cn("group/bubble flex max-w-[min(36rem,85%)] flex-col", row.mine ? "items-end" : "items-start")}>
        {teamSpeaker && team && showAvatar ? <SpeakerLabel message={teamSpeaker} members={team.members} /> : null}
        <div className={cn("flex items-center gap-1", row.mine && "flex-row-reverse")}>
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2 text-[0.94rem] leading-relaxed break-words whitespace-pre-wrap shadow-xs transition-opacity",
            row.mine ? "from-primary bg-gradient-to-br to-violet-600 text-primary-foreground rounded-br-md" : "bg-muted text-foreground rounded-bl-md",
            !showMeta && (row.mine ? "rounded-br-2xl" : "rounded-bl-2xl"),
            sending && "opacity-60",
            failed && "ring-destructive ring-2",
          )}
          data-testid="chat-bubble"
        >
          <span className="sr-only">{row.mine ? "You: " : `${teamSpeaker && team ? speakerName(teamSpeaker, team.members) : other.name}: `}</span>
          <Body text={row.body} mentions={!!team} />
          {row.taskId && onOpenTask ? (
            <div className="mt-2">
              <Button size="sm" variant="outline" className="bg-background text-foreground" onClick={() => onOpenTask(row.taskId ?? "")}>
                <SquareKanban data-icon="inline-start" aria-hidden />
                Open task
              </Button>
            </div>
          ) : null}
        </div>
        {row.message ? <ReactionPicker message={row.message} ws={ws} /> : null}
        </div>
        {row.message && row.message.reactions.length > 0 ? <ReactionChips message={row.message} ws={ws} /> : null}
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
          <p className="text-muted-foreground mt-1 px-1 text-xs">
            {sending ? "Sending…" : timeLabel(row.at)}
            {/* Honest personas: replies no mentor wrote say so (once per group of messages). */}
            {row.automated ? <span data-testid="automated-label"> · Automatic reply</span> : null}
          </p>
        ) : row.automated ? (
          <span className="sr-only">Automatic reply</span>
        ) : null}
      </div>
    </li>
  );
}

function speakerName(m: Message, members: Persona[]): string {
  const s = speakerOf(m, members);
  return s.kind === "persona" ? s.persona.name : s.kind === "bot" ? BOT.name : "A former teammate";
}

function Composer({
  onSend,
  placeholder,
  quickReplies,
  members,
  bare = false,
}: {
  onSend: (raw: string) => string | null;
  placeholder: string;
  quickReplies: string[];
  /** Team room members to suggest after "@". */
  members?: Persona[];
  /** Drop the top border (when stacked under another control). */
  bare?: boolean;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const length = runeLength(text.trim());
  const canSend = text.trim().length > 0 && length <= Bounds.messageMax;
  const query = members ? mentionQuery(text) : null;
  const suggestions = query !== null && members ? mentionMatches(query, members).slice(0, 6) : [];
  const pick = (p: Persona) => {
    setText((t) => insertMention(t, p));
    ref.current?.focus();
  };

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
    const first = suggestions[0];
    if (first && (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey))) {
      e.preventDefault();
      pick(first);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSend) submit();
    }
  };

  return (
    <form
      className={cn("bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6", !bare && "border-t")}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) submit();
      }}
    >
      {suggestions.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Mention someone" data-testid="mention-suggestions">
          {suggestions.map((p) => (
            <li key={p.id}>
              <Button type="button" size="sm" variant="secondary" className="h-8 rounded-full" onClick={() => pick(p)}>
                <PersonaAvatar persona={p} size="sm" className="size-5" />
                {p.name.split(/\s+/)[0]}
                <span className="text-muted-foreground text-xs">{p.title}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {text === "" ? (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1" aria-label="Quick replies">
          {quickReplies.map((q) => (
            <Button key={q} type="button" size="sm" variant="outline" className="shrink-0 rounded-full" onClick={() => submit(q)}>
              {q}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <label htmlFor="chat-input" className="sr-only">
          {placeholder}
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
          placeholder={placeholder}
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
        <span className={error ? "text-destructive" : "sr-only"} role={error ? "alert" : undefined}>
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

async function toggle(ws: Conversation, m: Message, emoji: (typeof REACTION_EMOJIS)[number]) {
  const err = await ws.react(m, emoji);
  if (err) toast.error(err);
}

/** The smile button beside a bubble: shown on hover and focus, opens the six reactions. */
function ReactionPicker({ message, ws }: { message: Message; ws: Conversation }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground size-7 rounded-full opacity-0 transition-opacity group-hover/bubble:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          aria-label="React to this message"
          data-testid="react-open"
        >
          <SmilePlus aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto rounded-full p-1" side="top" data-testid="reaction-bar">
        <div className="flex gap-0.5">
          {REACTION_EMOJIS.map((e) => {
            const mine = message.reactions.some((r) => r.emoji === e && r.by === ws.side);
            return (
              <button
                key={e}
                type="button"
                className={cn(
                  "focus-visible:ring-ring/60 grid size-9 place-items-center rounded-full text-xl transition-transform outline-none hover:scale-125 focus-visible:ring-2",
                  mine && "bg-primary/12",
                )}
                aria-label={REACTION_GLYPH[e].label}
                aria-pressed={mine}
                data-testid={`react-${e}`}
                onClick={() => {
                  setOpen(false);
                  void toggle(ws, message, e);
                }}
              >
                {REACTION_GLYPH[e].glyph}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ReactionChips({ message, ws }: { message: Message; ws: Conversation }) {
  return (
    <ul className="mt-1 flex flex-wrap gap-1" aria-label="Reactions">
      {reactionChips(message.reactions, ws.side).map((c) => (
        <li key={c.emoji}>
          <button
            type="button"
            onClick={() => void toggle(ws, message, c.emoji)}
            aria-pressed={c.mine}
            aria-label={`${REACTION_GLYPH[c.emoji].label}${c.count > 1 ? `, ${c.count}` : ""}${c.mine ? ", yours. Remove it" : ""}`}
            className={cn(
              "animate-in zoom-in-75 flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition-colors duration-200",
              c.mine ? "border-primary bg-primary/10" : "bg-background hover:bg-accent",
            )}
            data-testid={`chip-${c.emoji}`}
          >
            <span aria-hidden>{REACTION_GLYPH[c.emoji].glyph}</span>
            {c.count > 1 ? <span className="tabular-nums">{c.count}</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
