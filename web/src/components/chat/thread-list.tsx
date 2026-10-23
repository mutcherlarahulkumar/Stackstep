"use client";

import { Inbox, MessagesSquare } from "lucide-react";
import { type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { messageFor } from "@/lib/api/errors";
import { type Message, type StaffThread, type Thread } from "@/lib/api/schemas";
import { inboxTimeLabel, previewLine, threadKey } from "@/lib/inbox";
import { useStaffThreads, useStudentThreads } from "@/lib/inbox-queries";
import { cn } from "@/lib/utils";

import { PERSONA_DOT, PersonaAvatar, PersonAvatar } from "../app/persona-avatar";
import { EmptyState, ErrorState, ListSkeleton } from "../app/state";

function preview(m: Message | null, staff: boolean): string {
  if (!m) return "No messages yet";
  const mine = staff ? m.author === "persona" : m.author === "student";
  return `${mine ? "You: " : ""}${previewLine(m.body)}`;
}

function UnreadBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="bg-primary text-primary-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function Row({
  avatar,
  title,
  tag,
  last,
  unread,
  staff,
  selected,
  onSelect,
  testId,
}: {
  avatar: ReactNode;
  title: string;
  tag: ReactNode;
  last: Message | null;
  unread: number;
  staff: boolean;
  selected: boolean;
  onSelect: () => void;
  testId: string;
}) {
  const now = new Date();
  const bold = unread > 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      aria-label={`${title}${unread ? `, ${unread} unread` : ""}`}
      data-testid={testId}
      className={cn(
        "hover:bg-muted/70 focus-visible:ring-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-2",
        selected && "bg-muted",
      )}
    >
      {avatar}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-sm", bold ? "font-semibold" : "font-medium")}>{title}</span>
          {last ? <span className={cn("shrink-0 text-xs", bold ? "text-primary" : "text-muted-foreground")}>{inboxTimeLabel(last.sent_at, now)}</span> : null}
        </span>
        <span className="text-muted-foreground truncate text-xs">{tag}</span>
        <span className="flex items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-sm", bold ? "text-foreground" : "text-muted-foreground")}>{preview(last, staff)}</span>
          <UnreadBadge count={unread} />
        </span>
      </span>
    </button>
  );
}

/** The student's chats: one per persona. */
export function StudentThreadList({ selected, onSelect }: { selected: string | null; onSelect: (t: Thread) => void }) {
  const q = useStudentThreads();
  if (q.isPending) return <ListSkeleton rows={4} className="h-16" />;
  if (q.isError) return <ErrorState message={messageFor(q.error)} onRetry={() => void q.refetch()} />;
  if (q.data.length === 0) {
    return (
      <EmptyState icon={MessagesSquare} title="No chats yet">
        Your team posts tickets and updates here once your internship starts. Each person gets their own chat.
      </EmptyState>
    );
  }
  return (
    <ul className="flex flex-col gap-0.5" aria-label="Chats">
      {q.data.map((t) => (
        <li key={t.persona.id}>
          <Row
            avatar={<PersonaAvatar persona={t.persona} size="lg" />}
            title={t.persona.name}
            tag={t.persona.title}
            last={t.last_message}
            unread={t.unread}
            staff={false}
            selected={selected === t.persona.id}
            onSelect={() => onSelect(t)}
            testId={`thread-${t.persona.name}`}
          />
        </li>
      ))}
    </ul>
  );
}

/** The staff inbox: every conversation in scope, newest first. */
export function StaffThreadList({ unreadOnly, selected, onSelect }: { unreadOnly: boolean; selected: string | null; onSelect: (t: StaffThread) => void }) {
  const q = useStaffThreads(unreadOnly);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (q.isPending) return <ListSkeleton rows={6} className="h-16" />;
  if (q.isError) return <ErrorState message={messageFor(q.error)} onRetry={() => void q.refetch()} />;
  if (items.length === 0) {
    return (
      <EmptyState icon={Inbox} title={unreadOnly ? "All caught up" : "No conversations yet"}>
        {unreadOnly ? "Nothing waiting on a reply. New student messages show up here live." : "Conversations start when a persona posts a task or a student writes in."}
      </EmptyState>
    );
  }
  return (
    <>
      <ul className="flex flex-col gap-0.5" aria-label="Conversations">
        {items.map((t) => (
          <li key={threadKey(t)}>
            <Row
              avatar={<PersonAvatar name={t.student.name} login={t.student.github_login} url={t.student.avatar_url} size="lg" />}
              title={t.student.name}
              tag={
                <span className="inline-flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", PERSONA_DOT[t.persona.color])} aria-hidden />
                  with {t.persona.name} · @{t.student.github_login}
                </span>
              }
              last={t.last_message}
              unread={t.unread}
              staff
              selected={selected === threadKey(t)}
              onSelect={() => onSelect(t)}
              testId={`staff-thread-${t.student.github_login}-${t.persona.name}`}
            />
          </li>
        ))}
      </ul>
      {q.hasNextPage ? (
        <Button variant="ghost" className="mt-2 w-full" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
          {q.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null} Load more
        </Button>
      ) : null}
    </>
  );
}
