"use client";

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Inbox, Megaphone, MessageSquarePlus, Search, UsersRound } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { messageFor } from "@/lib/api/errors";
import { type Frame, type InboxStudent, type Persona, type StaffThread } from "@/lib/api/schemas";
import { inboxTimeLabel, previewLine, threadKey } from "@/lib/inbox";
import { useFrames } from "@/lib/realtime-context";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { choiceItem } from "../app/choice";
import { InfoNote } from "../app/info-note";
import { PersonaAvatar, PersonAvatar } from "../app/persona-avatar";
import { EmptyState, ErrorState, ListSkeleton } from "../app/state";
import { ConversationView } from "../chat/conversation";
import { StaffThreadList } from "../chat/thread-list";
import { AdminShell } from "./admin-shell";
import { BroadcastDialog } from "./broadcast-dialog";
import { useAllPersonas, useFlows } from "./catalog-queries";
import { useCohorts } from "./people-enroll";

const ANY = "any";

type Open = { student: InboxStudent["student"]; enrollmentId: string; persona: Persona };

/**
 * The team inbox, student first: every student (by flow, cohort or name), then the personas
 * they talk to, then the conversation. "Latest" keeps the old most-recent-chats view.
 */
export function InboxScreen() {
  const [mode, setMode] = useState<"students" | "latest">("students");
  const [student, setStudent] = useState<InboxStudent | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [broadcast, setBroadcast] = useState(false);
  // A profile's Chats button links here with the student (?student=<login>&enrollment=<id>).
  const params = useSearchParams();
  const linkedLogin = params.get("student") ?? "";
  const linkedEnrollment = params.get("enrollment");
  // The link opens its student once; Back or a mode switch must not snap back to them.
  const [usedLink, setUsedLink] = useState<string | null>(null);
  return (
    <AdminShell section="inbox" phone="allow">
      {(_me, desktop) => {
        const header = (
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={mode}
              onValueChange={(v) => {
                if (v === "students" || v === "latest") setMode(v);
              }}
              aria-label="Inbox view"
            >
              <ToggleGroupItem value="students" className={choiceItem} data-testid="inbox-mode-students">
                Students
              </ToggleGroupItem>
              <ToggleGroupItem value="latest" className={choiceItem} data-testid="inbox-mode-latest">
                Latest chats
              </ToggleGroupItem>
            </ToggleGroup>
            <Button size="sm" variant="outline" onClick={() => setBroadcast(true)} data-testid="open-broadcast">
              <Megaphone data-icon="inline-start" aria-hidden /> Broadcast
            </Button>
          </div>
        );
        const pickThread = (t: StaffThread) => {
          setStudent(null);
          setOpen({ student: t.student, enrollmentId: t.enrollment_id, persona: t.persona });
        };
        const left =
          mode === "students" ? (
            <StudentColumn
              initialSearch={usedLink === linkedEnrollment ? "" : linkedLogin}
              autoPick={usedLink === linkedEnrollment ? null : linkedEnrollment}
              selected={student?.enrollment_id ?? open?.enrollmentId ?? null}
              onPick={(s) => {
                setStudent(s);
                setOpen(null);
              }}
              onAutoPicked={setUsedLink}
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <StaffThreadList unreadOnly={false} selected={open ? threadKey({ enrollment_id: open.enrollmentId, persona: open.persona }) : null} onSelect={pickThread} />
            </div>
          );
        const personas = student ? (
          <PersonaColumn
            key={student.enrollment_id}
            student={student}
            selected={open?.persona.id ?? null}
            onBack={desktop ? undefined : () => setStudent(null)}
            onPick={(p) => setOpen({ student: student.student, enrollmentId: student.enrollment_id, persona: p })}
          />
        ) : null;
        const conversation = open ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex h-14 shrink-0 items-center gap-3 border-b px-3 sm:px-4">
              {!desktop ? (
                <Button variant="ghost" size="icon" onClick={() => setOpen(null)} aria-label="Back">
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
              key={`${open.enrollmentId}:${open.persona.id}`}
              target={{ personaId: open.persona.id, enrollmentId: open.enrollmentId }}
              other={{ name: open.student.name, avatar: <PersonAvatar name={open.student.name} login={open.student.github_login} url={open.student.avatar_url} size="sm" /> }}
            />
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-6 p-6">
            <InfoNote id="inbox" title="The team inbox">
              Every student is listed here, with the ones waiting on a reply first. Pick a student to see each persona they talk to, then
              answer as that persona, so the student hears from their team lead or product manager. You can also start a new chat as any
              persona. Broadcast sends one chat message to many students; for something to keep, send an Announcement to their mail.
            </InfoNote>
            <div className="flex flex-1 items-center justify-center">
              <EmptyState icon={Inbox} title={student ? "Pick a persona" : "Pick a student"}>
                {student ? `Choose who ${student.student.name.split(" ")[0]} is talking to, or start a new chat.` : "Students waiting on a reply are at the top. New messages appear live."}
              </EmptyState>
            </div>
          </div>
        );
        return (
          <>
            {desktop ? (
              <div className="flex min-h-0 flex-1">
                <aside aria-label="Students" className="flex w-80 shrink-0 flex-col border-r">
                  {header}
                  {left}
                </aside>
                {personas ? (
                  <aside aria-label="Conversations" className="bg-muted/20 flex w-72 shrink-0 flex-col border-r">
                    {personas}
                  </aside>
                ) : null}
                <section aria-label="Conversation" className="flex min-w-0 flex-1 flex-col">
                  {conversation}
                </section>
              </div>
            ) : open ? (
              conversation
            ) : personas ? (
              personas
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                {header}
                {left}
              </div>
            )}
            <BroadcastDialog open={broadcast} onOpenChange={setBroadcast} />
          </>
        );
      }}
    </AdminShell>
  );
}

function useInboxStudents(f: { flowId: string; cohortId: string; q: string }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const key = ["inbox-students", f] as const;
  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => api.inboxStudents({ flowId: f.flowId === ANY ? null : f.flowId, cohortId: f.cohortId === ANY ? null : f.cohortId, q: f.q, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_offset ?? undefined,
  });
  // A student writing (or a reconnect) reorders the list: refetch it.
  useFrames(
    useCallback(
      (fr: Frame) => {
        if (fr.type === "ready" || (fr.type === "message" && fr.message.author === "student")) void qc.invalidateQueries({ queryKey: ["inbox-students"] });
      },
      [qc],
    ),
  );
  return query;
}

function StudentColumn({
  selected,
  onPick,
  initialSearch = "",
  autoPick = null,
  onAutoPicked,
}: {
  selected: string | null;
  onPick: (s: InboxStudent) => void;
  initialSearch?: string;
  autoPick?: string | null;
  onAutoPicked?: (enrollmentId: string) => void;
}) {
  const flows = useFlows();
  const cohorts = useCohorts();
  const [flowId, setFlowId] = useState(ANY);
  const [cohortId, setCohortId] = useState(ANY);
  const [search, setSearch] = useState(initialSearch);
  const q = useDeferredValue(search);
  const list = useInboxStudents({ flowId, cohortId, q });
  const items = useMemo(() => (list.data?.pages ?? []).flatMap((p) => p.items), [list.data]);
  // Open the linked student as soon as their row loads; the parent then marks the link used.
  useEffect(() => {
    if (!autoPick) return;
    const hit = items.find((s) => s.enrollment_id === autoPick);
    if (hit) {
      onPick(hit);
      onAutoPicked?.(autoPick);
    }
  }, [items, autoPick, onPick, onAutoPicked]);
  const [now] = useState(() => new Date());
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b p-3">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students" aria-label="Search students" className="h-8 pl-8" data-testid="inbox-search" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={flowId} onValueChange={setFlowId}>
            <SelectTrigger className="h-8 w-full" aria-label="Filter by flow" data-testid="inbox-flow">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Every flow</SelectItem>
              {(flows.data ?? [])
                .filter((f) => !f.archived)
                .map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select value={cohortId} onValueChange={setCohortId}>
            <SelectTrigger className="h-8 w-full" aria-label="Filter by cohort" data-testid="inbox-cohort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Every cohort</SelectItem>
              {(cohorts.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.isPending ? (
          <div className="p-3">
            <ListSkeleton rows={6} className="h-14" />
          </div>
        ) : list.isError ? (
          <div className="p-3">
            <ErrorState message={messageFor(list.error)} onRetry={() => void list.refetch()} />
          </div>
        ) : items.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={UsersRound} title="No students here">
              {q || flowId !== ANY || cohortId !== ANY ? "Nobody matches. Clear a filter to see more." : "Students appear once they're enrolled."}
            </EmptyState>
          </div>
        ) : (
          <ul className="divide-y" data-testid="inbox-students">
            {items.map((s) => (
              <li key={s.enrollment_id}>
                <button
                  type="button"
                  onClick={() => onPick(s)}
                  aria-current={selected === s.enrollment_id ? "true" : undefined}
                  className={cn(
                    "hover:bg-accent/60 focus-visible:ring-ring/60 flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset",
                    selected === s.enrollment_id && "bg-accent",
                  )}
                  data-testid={`inbox-student-${s.student.github_login}`}
                >
                  <PersonAvatar name={s.student.name} login={s.student.github_login} url={s.student.avatar_url} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate text-sm", s.unread > 0 ? "font-semibold" : "font-medium")}>{s.student.name}</span>
                      <span className="text-muted-foreground shrink-0 text-xs">{s.last_at ? inboxTimeLabel(s.last_at, now) : ""}</span>
                    </span>
                    <span className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">
                        {s.status === "paused" ? "Paused" : s.day_number > 0 ? `Day ${s.day_number}` : "Starts soon"}
                        {s.flow_name ? ` · ${s.flow_name}` : s.cohort_name ? ` · ${s.cohort_name}` : ""}
                      </span>
                      {s.unread > 0 ? (
                        <Badge className="h-5 min-w-5 justify-center px-1.5 tabular-nums" aria-label={`${s.unread} unread`}>
                          {s.unread}
                        </Badge>
                      ) : s.threads === 0 ? (
                        <span className="shrink-0">No chats yet</span>
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {list.hasNextPage ? (
              <li className="p-3">
                <Button variant="outline" size="sm" className="w-full" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                  More students
                </Button>
              </li>
            ) : null}
          </ul>
        )}
      </div>
    </div>
  );
}

/** One student's conversations, one per persona, plus a way to start a chat as any other. */
function PersonaColumn({ student, selected, onPick, onBack }: { student: InboxStudent; selected: string | null; onPick: (p: Persona) => void; onBack?: () => void }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const personas = useAllPersonas();
  const threads = useQuery({
    queryKey: ["student-threads", student.enrollment_id],
    queryFn: async () => (await api.staffThreads({ enrollmentId: student.enrollment_id, limit: 50 })).items,
  });
  useFrames(
    useCallback(
      (f: Frame) => {
        if ((f.type === "message" || f.type === "ready") && (f.type === "ready" || f.message.enrollment_id === student.enrollment_id)) {
          void qc.invalidateQueries({ queryKey: ["student-threads", student.enrollment_id] });
        }
      },
      [qc, student.enrollment_id],
    ),
  );
  const [now] = useState(() => new Date());
  const talking = threads.data ?? [];
  const others = (personas.data ?? []).filter((p) => !p.archived && !talking.some((t) => t.persona.id === p.id));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b p-3">
        {onBack ? (
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="All students">
            <ArrowLeft aria-hidden />
          </Button>
        ) : null}
        <PersonAvatar name={student.student.name} login={student.student.github_login} url={student.student.avatar_url} />
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{student.student.name}</h2>
          <p className="text-muted-foreground truncate text-xs">@{student.student.github_login}</p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {threads.isPending ? (
          <ListSkeleton rows={3} className="h-14" />
        ) : threads.isError ? (
          <ErrorState message={messageFor(threads.error)} onRetry={() => void threads.refetch()} />
        ) : (
          <>
            <p className="text-muted-foreground px-2 pt-1 pb-2 text-xs font-medium">Talking with</p>
            {talking.length === 0 ? <p className="text-muted-foreground px-2 pb-3 text-sm">No chats yet.</p> : null}
            <ul className="flex flex-col gap-1" data-testid="student-personas">
              {talking.map((t) => (
                <li key={t.persona.id}>
                  <button
                    type="button"
                    onClick={() => onPick(t.persona)}
                    aria-current={selected === t.persona.id ? "true" : undefined}
                    className={cn("hover:bg-accent focus-visible:ring-ring/60 flex w-full items-center gap-3 rounded-lg p-2 text-left outline-none focus-visible:ring-2", selected === t.persona.id && "bg-accent")}
                    data-testid={`student-persona-${t.persona.name}`}
                  >
                    <PersonaAvatar persona={t.persona} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate text-sm", t.unread > 0 ? "font-semibold" : "font-medium")}>{t.persona.name}</span>
                        <span className="text-muted-foreground shrink-0 text-xs">{t.last_message ? inboxTimeLabel(t.last_message.sent_at, now) : ""}</span>
                      </span>
                      <span className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">{t.last_message ? previewLine(t.last_message.body, 60) : t.persona.title}</span>
                        {t.unread > 0 ? <Badge className="h-5 min-w-5 justify-center px-1.5 tabular-nums">{t.unread}</Badge> : null}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {others.length > 0 ? (
              <>
                <p className="text-muted-foreground px-2 pt-4 pb-2 text-xs font-medium">Start a chat as</p>
                <ul className="flex flex-col gap-1">
                  {others.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => onPick(p)}
                        className="hover:bg-accent focus-visible:ring-ring/60 flex w-full items-center gap-3 rounded-lg p-2 text-left outline-none focus-visible:ring-2"
                        data-testid={`start-as-${p.name}`}
                      >
                        <PersonaAvatar persona={p} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {p.name} <span className="text-muted-foreground text-xs">· {p.title}</span>
                        </span>
                        <MessageSquarePlus className="text-muted-foreground size-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
      </div>
      <p className="text-muted-foreground flex items-center gap-1 border-t px-3 py-2 text-xs">
        <ChevronRight className="size-3" aria-hidden /> Replies go out as the persona you pick.
      </p>
    </div>
  );
}
