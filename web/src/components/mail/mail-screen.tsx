"use client";

import { Award, ArrowLeft, ClipboardCheck, Clock, Inbox, Mail as MailIcon, Megaphone, PartyPopper, SquareKanban, Video, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { messageFor } from "@/lib/api/errors";
import { type Mail, type MailKind, type Me } from "@/lib/api/schemas";
import { useLetter, useMailbox, useMailFrames } from "@/lib/mail-queries";
import { RealtimeProvider } from "@/lib/realtime-context";
import { useIsDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";

import { AppHeader } from "../app/app-header";
import { RequireSession } from "../app/guard";
import { outline, Prose, readingMinutes } from "../app/prose";
import { EmptyState, ErrorState, ListSkeleton } from "../app/state";
import { HelpWidget } from "../help/help-widget";

export const MAIL_STYLE: Record<MailKind, { label: string; icon: LucideIcon; tone: string }> = {
  announcement: { label: "Announcement", icon: Megaphone, tone: "bg-violet-500/12 text-violet-700 dark:text-violet-300" },
  welcome: { label: "Welcome", icon: PartyPopper, tone: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" },
  review: { label: "Review", icon: ClipboardCheck, tone: "bg-sky-500/12 text-sky-700 dark:text-sky-300" },
  certificate: { label: "Certificate", icon: Award, tone: "bg-amber-500/14 text-amber-800 dark:text-amber-300" },
  class: { label: "Live class", icon: Video, tone: "bg-rose-500/12 text-rose-700 dark:text-rose-300" },
};

export function MailScreen() {
  return (
    <RequireSession audience="student">
      {(me) =>
        me.enrollment ? (
          <RealtimeProvider>
            <MailView me={me} />
          </RealtimeProvider>
        ) : (
          <MailView me={me} />
        )
      }
    </RequireSession>
  );
}

function when(d: Date, now: Date): string {
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function MailView({ me }: { me: Me }) {
  const box = useMailbox();
  const desktop = useIsDesktop();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [picked, setPicked] = useState<string | null>(null);
  useMailFrames(setPicked);
  const items = useMemo(() => (box.data?.pages ?? []).flatMap((p) => p.items), [box.data]);
  const unread = box.data?.pages[0]?.unread ?? 0;
  const shown = filter === "unread" ? items.filter((m) => !m.read || m.id === picked) : items;
  const selected = picked ?? (desktop ? (items[0]?.id ?? null) : null);
  const [now] = useState(() => new Date());

  const list = (
    <nav aria-label="Mailbox" className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b p-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          Mail
          {unread > 0 ? (
            <Badge className="tabular-nums" data-testid="mail-unread">
              {unread} new
            </Badge>
          ) : null}
        </h1>
        <ToggleGroup type="single" size="sm" variant="outline" value={filter} onValueChange={(v) => v && setFilter(v === "unread" ? "unread" : "all")}>
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="unread" data-testid="mail-filter-unread">
            Unread
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {box.isPending ? (
          <div className="p-3">
            <ListSkeleton rows={5} className="h-16" />
          </div>
        ) : box.isError ? (
          <div className="p-3">
            <ErrorState message={messageFor(box.error)} onRetry={() => void box.refetch()} />
          </div>
        ) : shown.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={Inbox} title={filter === "unread" ? "You're all caught up" : "No mail yet"}>
              Announcements from your mentors, review results and your welcome letter land here.
            </EmptyState>
          </div>
        ) : (
          <ul className="divide-y">
            {shown.map((m) => (
              <li key={m.id}>
                <MailRow m={m} now={now} active={m.id === selected} onOpen={() => setPicked(m.id)} />
              </li>
            ))}
            {box.hasNextPage ? (
              <li className="p-3">
                <Button variant="outline" size="sm" className="w-full" onClick={() => void box.fetchNextPage()} disabled={box.isFetchingNextPage}>
                  Load older mail
                </Button>
              </li>
            ) : null}
          </ul>
        )}
      </div>
    </nav>
  );

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader user={me.user}>
        <span className="bg-border hidden h-5 w-px sm:block" aria-hidden />
        <Button asChild variant="ghost" size="sm">
          <Link href={me.enrollment ? "/workspace" : "/"}>
            <ArrowLeft data-icon="inline-start" aria-hidden /> {me.enrollment ? "Workspace" : "Home"}
          </Link>
        </Button>
      </AppHeader>
      <main id="main" className="min-h-0 flex-1">
        {desktop === null ? null : desktop ? (
          <div className="grid h-full grid-cols-[24rem_minmax(0,1fr)]">
            <div className="flex min-h-0 flex-col border-r">{list}</div>
            <section aria-label="Letter" className="min-h-0 overflow-y-auto">
              {selected ? <Letter key={selected} id={selected} /> : <NoLetter />}
            </section>
          </div>
        ) : selected ? (
          <section aria-label="Letter" className="h-full overflow-y-auto">
            <Button variant="ghost" size="sm" className="m-2" onClick={() => setPicked(null)}>
              <ArrowLeft data-icon="inline-start" aria-hidden /> All mail
            </Button>
            <Letter key={selected} id={selected} />
          </section>
        ) : (
          <div className="flex h-full flex-col">{list}</div>
        )}
      </main>
      <HelpWidget />
    </div>
  );
}

function MailRow({ m, now, active, onOpen }: { m: Mail; now: Date; active: boolean; onOpen: () => void }) {
  const style = MAIL_STYLE[m.kind];
  const Icon = style.icon;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? "true" : undefined}
      data-testid={`mail-row-${m.subject}`}
      className={cn(
        "hover:bg-accent/60 focus-visible:ring-ring/60 relative flex w-full gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset",
        active && "bg-accent",
      )}
    >
      {!m.read ? <span className="bg-primary absolute top-1/2 left-1.5 size-2 -translate-y-1/2 rounded-full" aria-label="Unread" /> : null}
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", style.tone)}>
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn("truncate text-sm", m.read ? "font-medium" : "font-semibold")}>{m.subject}</span>
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{when(m.created_at, now)}</span>
        </span>
        <span className="text-muted-foreground block truncate text-xs">{m.from_name}</span>
        <span className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{m.preview}</span>
      </span>
    </button>
  );
}

function NoLetter() {
  return (
    <div className="grid h-full place-items-center p-8">
      <EmptyState icon={MailIcon} title="Pick a letter">
        Your mail opens here.
      </EmptyState>
    </div>
  );
}

function Letter({ id }: { id: string }) {
  const q = useLetter(id);
  if (q.isPending) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <ListSkeleton rows={4} className="h-10" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <ErrorState message={messageFor(q.error)} onRetry={() => void q.refetch()} />
      </div>
    );
  }
  const m = q.data;
  const style = MAIL_STYLE[m.kind];
  const Icon = style.icon;
  const body = m.body ?? "";
  const toc = outline(body);
  return (
    <article className="animate-in fade-in slide-in-from-bottom-2 mx-auto flex max-w-5xl gap-10 px-5 py-8 duration-300 sm:px-10" data-testid="mail-letter">
      <div className="min-w-0 flex-1">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", style.tone)}>
          <Icon className="size-3.5" aria-hidden /> {style.label}
        </span>
        <h2 className="mt-3 text-3xl leading-tight font-semibold tracking-tight text-balance">{m.subject}</h2>
        <p className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span>
            From <span className="text-foreground font-medium">{m.from_name}</span>
          </span>
          <span aria-hidden>·</span>
          <time dateTime={m.created_at.toISOString()}>{m.created_at.toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</time>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden /> {readingMinutes(body)} min read
          </span>
        </p>
        <hr className="via-border my-6 h-px border-0 bg-gradient-to-r from-transparent to-transparent" />
        <Prose>{body}</Prose>
        {m.class_id ? (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
            <p className="text-sm">The room opens a few minutes before the class. Join from here or your calendar.</p>
            <Button asChild data-testid="mail-join-class">
              <Link href={`/classes/${m.class_id}`}>
                <Video data-icon="inline-start" aria-hidden /> Join the class
              </Link>
            </Button>
          </div>
        ) : null}
        {m.task_id ? (
          <div className="bg-muted/40 mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
            <p className="text-sm">This letter is about a task on your board.</p>
            <Button asChild data-testid="mail-open-task">
              <Link href={`/workspace?task=${m.task_id}`}>
                <SquareKanban data-icon="inline-start" aria-hidden /> Open the task
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
      {toc.length >= 3 ? (
        <aside className="sticky top-6 hidden w-52 shrink-0 self-start xl:block" aria-label="On this page">
          <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">On this page</p>
          <ul className="space-y-1.5 border-l text-sm">
            {toc.map((h) => (
              <li key={h.id} className={cn(h.depth === 3 && "pl-3")}>
                <a href={`#${h.id}`} className="text-muted-foreground hover:text-foreground -ml-px block border-l border-transparent pl-3 hover:border-current">
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </article>
  );
}
