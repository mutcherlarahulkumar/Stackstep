"use client";

import { BookCopy, CalendarRange, ChartColumn, ClipboardCheck, Inbox, UserPlus, Route, Send, UserRoundCog, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";

import { type Me } from "@/lib/api/schemas";
import { totalUnread } from "@/lib/inbox";
import { useStaffThreads } from "@/lib/inbox-queries";
import { RealtimeProvider, useSocketStatus } from "@/lib/realtime-context";
import { cn } from "@/lib/utils";

import { AppHeader } from "../app/app-header";
import { ConnectionBanner } from "../app/connection-banner";
import { RequireSession } from "../app/guard";
import { DesktopGate } from "./desktop-gate";
import { useIsDesktop } from "@/lib/use-desktop";

export type Section = "report" | "overview" | "people" | "reviews" | "students" | "inbox" | "flows" | "library" | "personas" | "assign";

const DESKTOP_NAV: { id: Section; href: string; label: string; icon: LucideIcon }[] = [
  { id: "students", href: "/admin", label: "Students", icon: Users },
  { id: "reviews", href: "/admin/reviews", label: "Reviews", icon: ClipboardCheck },
  { id: "overview", href: "/admin/overview", label: "Overview", icon: ChartColumn },
  { id: "report", href: "/admin/report", label: "Report", icon: CalendarRange },
  { id: "people", href: "/admin/people", label: "People", icon: UserPlus },
  { id: "inbox", href: "/admin/inbox", label: "Inbox", icon: Inbox },
  { id: "flows", href: "/admin/flows", label: "Flows", icon: Route },
  { id: "library", href: "/admin/library", label: "Task library", icon: BookCopy },
  { id: "personas", href: "/admin/personas", label: "Personas", icon: UserRoundCog },
];

const SR_TITLE: Partial<Record<Section, string>> = { students: "Students", inbox: "Inbox" };

/** What phones get: allocation and the inbox. Everything else is desktop only. */
const PHONE_NAV: typeof DESKTOP_NAV = [
  { id: "assign", href: "/admin/assign", label: "Assign", icon: Send },
  { id: "inbox", href: "/admin/inbox", label: "Inbox", icon: Inbox },
];

/**
 * Frame for every admin page: session guard, one live socket, section nav. Pages marked
 * `phone="gate"` show the desktop prompt below 1024 px.
 */
export function AdminShell({ section, phone, children }: { section: Section; phone: "gate" | "allow"; children: (me: Me, desktop: boolean) => ReactNode }) {
  return (
    <RequireSession audience="staff">
      {(me) => (
        <RealtimeProvider>
          <Frame me={me} section={section} phone={phone}>
            {children}
          </Frame>
        </RealtimeProvider>
      )}
    </RequireSession>
  );
}

function Frame({ me, section, phone, children }: { me: Me; section: Section; phone: "gate" | "allow"; children: (me: Me, desktop: boolean) => ReactNode }) {
  const desktop = useIsDesktop();
  const socket = useSocketStatus();
  const inbox = useStaffThreads(false);
  const unread = totalUnread(inbox.data?.pages.flatMap((p) => p.items) ?? []);
  const nav = desktop ? DESKTOP_NAV : PHONE_NAV;
  return (
    <div className="flex h-dvh flex-col print:h-auto">
      <AppHeader user={me.user}>
        {desktop === null ? null : (
          <nav aria-label="Admin sections" className="-mb-px flex h-14 min-w-0 items-stretch gap-1 overflow-x-auto">
            {nav.map((n) => {
              const active = n.id === section;
              return (
                <Link
                  key={n.id}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "text-muted-foreground hover:text-foreground focus-visible:ring-ring flex shrink-0 items-center gap-2 border-b-2 border-transparent px-2.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset",
                    active && "border-primary text-foreground",
                  )}
                >
                  <n.icon className="size-4" aria-hidden />
                  <span className={cn(!desktop && n.id !== section && "sr-only sm:not-sr-only")}>{n.label}</span>
                  {n.id === "inbox" && unread > 0 ? (
                    <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[11px] font-semibold tabular-nums" aria-label={`${unread} unread`}>
                      {unread > 99 ? "99+" : unread}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        )}
      </AppHeader>
      <div className="print:hidden">
        <ConnectionBanner status={socket} />
      </div>
      <main id="main" className="animate-enter flex min-h-0 flex-1 flex-col print:block">
        {/* Pages with a visible title render their own h1; the rest get a screen-reader one. */}
        {SR_TITLE[section] ? <h1 className="sr-only">{SR_TITLE[section]}</h1> : null}
        {desktop === null ? null : !desktop && phone === "gate" ? <DesktopGate /> : children(me, desktop)}
      </main>
    </div>
  );
}
