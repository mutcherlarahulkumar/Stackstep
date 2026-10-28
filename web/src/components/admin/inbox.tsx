"use client";

import { ArrowLeft, Inbox, Megaphone } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type StaffThread } from "@/lib/api/schemas";
import { threadKey } from "@/lib/inbox";

import { choiceItem } from "../app/choice";
import { PersonaAvatar, PersonAvatar } from "../app/persona-avatar";
import { EmptyState } from "../app/state";
import { InfoNote } from "../app/info-note";
import { ConversationView } from "../chat/conversation";
import { StaffThreadList } from "../chat/thread-list";
import { AdminShell } from "./admin-shell";
import { BroadcastDialog } from "./broadcast-dialog";

/** Admin inbox: reply to students as the persona they're talking to. Works on phones too. */
export function InboxScreen() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [open, setOpen] = useState<StaffThread | null>(null);
  const [broadcast, setBroadcast] = useState(false);
  return (
    <AdminShell section="inbox" phone="allow">
      {(_me, desktop) => {
        const list = (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={unreadOnly ? "unread" : "all"}
                onValueChange={(v) => {
                  if (v) setUnreadOnly(v === "unread");
                }}
                aria-label="Filter conversations"
              >
                <ToggleGroupItem value="all" className={choiceItem}>
                  All
                </ToggleGroupItem>
                <ToggleGroupItem value="unread" className={choiceItem} data-testid="inbox-unread">
                  Unread
                </ToggleGroupItem>
              </ToggleGroup>
              <Button size="sm" onClick={() => setBroadcast(true)} data-testid="open-broadcast">
                <Megaphone data-icon="inline-start" aria-hidden /> Message students
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <StaffThreadList unreadOnly={unreadOnly} selected={open ? threadKey(open) : null} onSelect={setOpen} />
            </div>
          </div>
        );
        const conversation = open ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex h-14 shrink-0 items-center gap-3 border-b px-3 sm:px-4">
              {!desktop ? (
                <Button variant="ghost" size="icon" onClick={() => setOpen(null)} aria-label="All conversations">
                  <ArrowLeft aria-hidden />
                </Button>
              ) : null}
              <PersonAvatar name={open.student.name} login={open.student.github_login} url={open.student.avatar_url} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold">{open.student.name}</h2>
                <p className="text-muted-foreground flex items-center gap-1.5 truncate text-xs">
                  You reply as <PersonaAvatar persona={open.persona} size="sm" className="size-4" /> {open.persona.name} · {open.persona.title}
                </p>
              </div>
            </div>
            <ConversationView
              key={threadKey(open)}
              target={{ personaId: open.persona.id, enrollmentId: open.enrollment_id }}
              other={{ name: open.student.name, avatar: <PersonAvatar name={open.student.name} login={open.student.github_login} url={open.student.avatar_url} size="sm" /> }}
            />
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-6 p-6">
            <InfoNote id="inbox" title="The team inbox">
              Every chat between a student and a persona lands here. You reply as that persona, so the student sees their team lead or
              product manager answer. Message students sends one note to a whole cohort. Questions about payments are answered under
              Applications, not here.
            </InfoNote>
            <div className="flex flex-1 items-center justify-center">
              <EmptyState icon={Inbox} title="Pick a conversation">
                Replies go out as the persona the student is talking to. New messages appear here live.
              </EmptyState>
            </div>
          </div>
        );
        return (
          <>
            {desktop ? (
              <div className="flex min-h-0 flex-1">
                <aside aria-label="Conversations" className="flex w-96 shrink-0 flex-col border-r">
                  {list}
                </aside>
                <section aria-label="Conversation" className="flex min-w-0 flex-1 flex-col">
                  {conversation}
                </section>
              </div>
            ) : open ? (
              conversation
            ) : (
              list
            )}
            <BroadcastDialog open={broadcast} onOpenChange={setBroadcast} />
          </>
        );
      }}
    </AdminShell>
  );
}
