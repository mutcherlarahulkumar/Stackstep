"use client";

import { CalendarX2, MessageCircle, RefreshCw, SquareKanban } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type Enrollment, type Me } from "@/lib/api/schemas";
import { useSession } from "@/lib/session";

import { AppHeader } from "../app/app-header";
import { ConnectionBanner } from "../app/connection-banner";
import { RequireSession } from "../app/guard";
import { EmptyState } from "../app/state";
import { BoardPanel } from "./board-panel";
import { ChatPanel } from "./chat-panel";
import { useWorkspace } from "./use-workspace";

export function WorkspaceScreen() {
  return <RequireSession audience="student">{(me) => (me.enrollment ? <Workspace me={me} enrollment={me.enrollment} /> : <NoEnrollment me={me} />)}</RequireSession>;
}

function dayCaption(e: Enrollment): string {
  if (e.status === "paused") return "Internship paused";
  if (e.day_number === 0) return `Starts ${e.start_date}`;
  return `Day ${e.day_number} of ${e.program.days}`;
}

function Workspace({ me, enrollment }: { me: Me; enrollment: Enrollment }) {
  const ws = useWorkspace();
  const [tab, setTab] = useState<"chat" | "tasks">("chat");
  const [openTask, setOpenTask] = useState<string | null>(null);
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
          <span className="text-muted-foreground truncate text-sm whitespace-nowrap">{dayCaption(enrollment)}</span>
          <Progress value={progress} className="hidden w-28 sm:block" aria-label={`Internship progress, ${progress}%`} />
        </div>
      </AppHeader>
      <ConnectionBanner status={ws.socket} />
      <main id="main" className="min-h-0 flex-1">
        {/* Desktop: chat and board side by side. */}
        <div className="hidden h-full lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(22rem,2fr)]">
          <section aria-label="Chat" className="flex min-h-0 flex-col border-r">
            <PanelTitle icon={MessageCircle} title="Team lead" />
            <ChatPanel ws={ws} onOpenTask={setOpenTask} />
          </section>
          <section aria-label="Task board" className="flex min-h-0 flex-col">
            <PanelTitle icon={SquareKanban} title="Your board" />
            <BoardPanel ws={ws} openTaskId={openTask} onOpenTask={setOpenTask} />
          </section>
        </div>
        {/* Phones and tablets: one panel at a time. */}
        <Tabs value={tab} onValueChange={(v) => setTab(v === "tasks" ? "tasks" : "chat")} className="flex h-full flex-col gap-0 lg:hidden">
          <div className="border-b px-4 py-2">
            <TabsList className="w-full">
              <TabsTrigger value="chat">
                <MessageCircle aria-hidden /> Chat
              </TabsTrigger>
              <TabsTrigger value="tasks">
                <SquareKanban aria-hidden /> Tasks
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
            <ChatPanel ws={ws} onOpenTask={openFromChat} />
          </TabsContent>
          <TabsContent value="tasks" className="flex min-h-0 flex-1 flex-col">
            <BoardPanel ws={ws} openTaskId={openTask} onOpenTask={setOpenTask} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function PanelTitle({ icon: Icon, title }: { icon: typeof MessageCircle; title: string }) {
  return (
    <h2 className="flex h-11 shrink-0 items-center gap-2 border-b px-6 text-sm font-medium">
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
          You&apos;re signed in as @{me.user.github_login}, but you aren&apos;t enrolled in a program right now. If your college enrolled you, ask
          your placement cell to check the email on your GitHub account.
        </EmptyState>
      </main>
    </div>
  );
}
