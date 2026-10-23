"use client";

import { ArrowLeft, CalendarX2, MessageCircle, RefreshCw, SquareKanban } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type Enrollment, type Me, type Persona } from "@/lib/api/schemas";
import { totalUnread } from "@/lib/inbox";
import { useStudentThreads } from "@/lib/inbox-queries";
import { RealtimeProvider, useSocketStatus } from "@/lib/realtime-context";
import { useSession } from "@/lib/session";
import { useIsDesktop } from "@/lib/use-desktop";

import { AppHeader } from "../app/app-header";
import { ConnectionBanner } from "../app/connection-banner";
import { RequireSession } from "../app/guard";
import { PersonaAvatar } from "../app/persona-avatar";
import { EmptyState } from "../app/state";
import { ConversationView } from "../chat/conversation";
import { AI_THREAD, StudentThreadList } from "../chat/thread-list";
import { AIHelper } from "../ai/ai-helper";
import { WalletChips } from "../ai/wallet-chips";
import { BoardPanel } from "./board-panel";
import { useWorkspace } from "./use-workspace";

export function WorkspaceScreen() {
  return (
    <RequireSession audience="student">
      {(me) =>
        me.enrollment ? (
          <RealtimeProvider>
            <Workspace me={me} enrollment={me.enrollment} />
          </RealtimeProvider>
        ) : (
          <NoEnrollment me={me} />
        )
      }
    </RequireSession>
  );
}

function dayCaption(e: Enrollment): string {
  if (e.status === "paused") return "Internship paused";
  if (e.day_number === 0) return `Starts ${e.start_date}`;
  return `Day ${e.day_number} of ${e.program.days}`;
}

function Workspace({ me, enrollment }: { me: Me; enrollment: Enrollment }) {
  const ws = useWorkspace();
  const threads = useStudentThreads();
  const socket = useSocketStatus();
  // One layout at a time, so each conversation is mounted (and marked read) once.
  const desktop = useIsDesktop();
  const [tab, setTab] = useState<"chat" | "tasks">("chat");
  const [openTask, setOpenTask] = useState<string | null>(null);
  // Desktop always shows a conversation (the newest by default); phones start on the list.
  const [picked, setPicked] = useState<string | null>(null);
  const [phoneThread, setPhoneThread] = useState<string | null>(null);
  const personas = (threads.data ?? []).map((t) => t.persona);
  const byId = new Map(personas.map((p) => [p.id, p]));
  const aiOpen = picked === AI_THREAD;
  const desktopPersona = aiOpen ? null : ((picked ? byId.get(picked) : undefined) ?? personas[0] ?? null);
  const tasks = ws.state.tasks.status === "ready" ? ws.state.tasks.data : [];
  const phonePersona = phoneThread ? (byId.get(phoneThread) ?? null) : null;
  const unread = totalUnread(threads.data ?? []);

  const openFromChat = (id: string) => {
    setOpenTask(id);
    setTab("tasks");
  };
  const progress = Math.round((enrollment.day_number / enrollment.program.days) * 100);

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader user={me.user}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="bg-border hidden h-5 w-px sm:block" aria-hidden />
          <span className="text-muted-foreground hidden truncate text-sm whitespace-nowrap min-[420px]:inline">
            {dayCaption(enrollment)}
            {enrollment.flow ? <span className="hidden md:inline"> · {enrollment.flow.name}</span> : null}
          </span>
          <Progress value={progress} className="hidden w-28 sm:block" aria-label={`Internship progress, ${progress}%`} />
        </div>
        <div className="ml-auto">
          <WalletChips />
        </div>
      </AppHeader>
      <ConnectionBanner status={socket} />
      <main id="main" className="min-h-0 flex-1">
        {desktop === null ? null : desktop ? (
          /* Desktop: chats, the open conversation and the board side by side. */
          <div className="grid h-full grid-cols-[17rem_minmax(0,3fr)_minmax(22rem,2fr)]">
            <nav aria-label="Chats" className="flex min-h-0 flex-col border-r">
              <PanelTitle icon={MessageCircle} title="Chats" />
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                <StudentThreadList
                  selected={aiOpen ? AI_THREAD : (desktopPersona?.id ?? null)}
                  onSelect={(t) => setPicked(t.persona.id)}
                  onAI={() => setPicked(AI_THREAD)}
                />
              </div>
            </nav>
            <section aria-label="Conversation" className="flex min-h-0 flex-col border-r">
              {aiOpen ? (
                <AIHelper tasks={tasks} />
              ) : desktopPersona ? (
                <>
                  <ConversationHeader persona={desktopPersona} />
                  <ConversationView
                    key={desktopPersona.id}
                    target={{ personaId: desktopPersona.id, enrollmentId: null }}
                    other={{ name: desktopPersona.name, avatar: <PersonaAvatar persona={desktopPersona} size="sm" /> }}
                    onOpenTask={setOpenTask}
                  />
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center p-6">
                  {threads.isPending ? null : (
                    <EmptyState icon={MessageCircle} title="Your team will reach out here">
                      Tickets and updates from your managers show up as chats once your internship starts.
                    </EmptyState>
                  )}
                </div>
              )}
            </section>
            <section aria-label="Task board" className="flex min-h-0 flex-col">
              <PanelTitle icon={SquareKanban} title="Your board" />
              <BoardPanel ws={ws} personas={byId} openTaskId={openTask} onOpenTask={setOpenTask} />
            </section>
          </div>
        ) : (
          /* Phones and tablets: one panel at a time. */
          <Tabs value={tab} onValueChange={(v) => setTab(v === "tasks" ? "tasks" : "chat")} className="flex h-full flex-col gap-0">
            <div className="border-b px-4 py-2">
              <TabsList className="w-full">
                <TabsTrigger value="chat">
                  <MessageCircle aria-hidden /> Chats
                  {unread > 0 ? (
                    <span
                      className="bg-primary text-primary-foreground rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
                      aria-label={`${unread} unread`}
                    >
                      {unread > 99 ? "99+" : unread}
                    </span>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="tasks">
                  <SquareKanban aria-hidden /> Tasks
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
              {phoneThread === AI_THREAD ? (
                <AIHelper tasks={tasks} onBack={() => setPhoneThread(null)} />
              ) : phonePersona ? (
                <>
                  <ConversationHeader persona={phonePersona} onBack={() => setPhoneThread(null)} />
                  <ConversationView
                    key={phonePersona.id}
                    target={{ personaId: phonePersona.id, enrollmentId: null }}
                    other={{ name: phonePersona.name, avatar: <PersonaAvatar persona={phonePersona} size="sm" /> }}
                    onOpenTask={openFromChat}
                  />
                </>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  <StudentThreadList selected={null} onSelect={(t) => setPhoneThread(t.persona.id)} onAI={() => setPhoneThread(AI_THREAD)} />
                </div>
              )}
            </TabsContent>
            <TabsContent value="tasks" className="flex min-h-0 flex-1 flex-col">
              <BoardPanel ws={ws} personas={byId} openTaskId={openTask} onOpenTask={setOpenTask} />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}

function ConversationHeader({ persona, onBack }: { persona: Persona; onBack?: () => void }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b px-3 sm:px-4">
      {onBack ? (
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="All chats">
          <ArrowLeft aria-hidden />
        </Button>
      ) : null}
      <PersonaAvatar persona={persona} />
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold">{persona.name}</h2>
        <p className="text-muted-foreground truncate text-xs">{persona.title}</p>
      </div>
    </div>
  );
}

function PanelTitle({ icon: Icon, title }: { icon: typeof MessageCircle; title: string }) {
  return (
    <h2 className="flex h-14 shrink-0 items-center gap-2 border-b px-4 text-sm font-medium">
      <Icon className="text-muted-foreground size-4" aria-hidden />
      {title}
    </h2>
  );
}

function NoEnrollment({ me }: { me: Me }) {
  const { reloadMe } = useSession();
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader user={me.user} />
      <main id="main" className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={CalendarX2}
          title="No active internship"
          action={
            <Button variant="outline" onClick={() => void reloadMe()}>
              <RefreshCw data-icon="inline-start" aria-hidden /> Check again
            </Button>
          }
        >
          You&apos;re signed in as @{me.user.github_login}, but you aren&apos;t enrolled in a program right now. If your college enrolled you, ask your
          placement cell to check the email on your GitHub account.
        </EmptyState>
      </main>
    </div>
  );
}
