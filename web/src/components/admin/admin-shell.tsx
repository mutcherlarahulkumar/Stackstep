"use client";

import { useQuery } from "@tanstack/react-query";
import { BookCopy, Building2, ChartColumn, ChevronDown, ClipboardCheck, Inbox, QrCode, ReceiptIndianRupee, Route, Send, Settings2, UserPlus, UserRoundCog, Users, UsersRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { type Me } from "@/lib/api/schemas";
import { totalUnread } from "@/lib/inbox";
import { useStaffThreads } from "@/lib/inbox-queries";
import { RealtimeProvider, useSocketStatus } from "@/lib/realtime-context";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { AppHeader } from "../app/app-header";
import { ConnectionBanner } from "../app/connection-banner";
import { RequireSession } from "../app/guard";
import { SectionBoundary } from "../app/section-boundary";
import { DesktopGate } from "./desktop-gate";
import { useIsDesktop } from "@/lib/use-desktop";
import { useBrowserNotifications, useUnreadTitle } from "@/lib/use-notifications";

import { personaMap, useAllPersonas } from "./catalog-queries";

export type Section = "report" | "overview" | "people" | "reviews" | "students" | "inbox" | "flows" | "library" | "personas" | "assign" | "applications" | "payments" | "colleges" | "cohorts";

type NavItem = { id: Section; href: string; label: string; icon: LucideIcon };

/** Daily work, left to right. Insights holds the overview and the weekly report. */
const DESKTOP_NAV: NavItem[] = [
  { id: "students", href: "/admin", label: "Students", icon: Users },
  { id: "reviews", href: "/admin/reviews", label: "Reviews", icon: ClipboardCheck },
  { id: "applications", href: "/admin/applications", label: "Applications", icon: ReceiptIndianRupee },
  { id: "inbox", href: "/admin/inbox", label: "Inbox", icon: Inbox },
  { id: "overview", href: "/admin/overview", label: "Insights", icon: ChartColumn },
];

/** Set up once, change rarely: behind one menu so the bar stays short. */
const SETUP_NAV: (NavItem & { hint: string })[] = [
  { id: "people", href: "/admin/people", label: "People", icon: UserPlus, hint: "Enroll students by hand, manage staff" },
  { id: "colleges", href: "/admin/colleges", label: "Colleges", icon: Building2, hint: "Institutions you work with" },
  { id: "cohorts", href: "/admin/cohorts", label: "Cohorts", icon: UsersRound, hint: "Batches, seats, fees and admissions" },
  { id: "payments", href: "/admin/payments", label: "Payments", icon: QrCode, hint: "UPI ID and QR students pay to" },
  { id: "flows", href: "/admin/flows", label: "Flows", icon: Route, hint: "Day by day courses" },
  { id: "library", href: "/admin/library", label: "Task library", icon: BookCopy, hint: "Reusable tasks" },
  { id: "personas", href: "/admin/personas", label: "Personas", icon: UserRoundCog, hint: "Your team characters" },
];

/** Sections that light up a top-level item. */
const ACTIVE_FOR: Partial<Record<Section, Section>> = { report: "overview" };

const SR_TITLE: Partial<Record<Section, string>> = { students: "Students", inbox: "Inbox" };

/** What phones get: allocation and the inbox. Everything else is desktop only. */
const PHONE_NAV: NavItem[] = [
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
  const waiting = useReviewCount(desktop === true);
  const applicants = useApplicationCount(desktop === true);
  const personas = personaMap(useAllPersonas().data);
  useUnreadTitle(unread);
  useBrowserNotifications("staff", (id) => personas.get(id)?.name);
  return (
    <div className="flex h-dvh flex-col print:h-auto">
      <AppHeader user={me.user}>
        {desktop === null ? null : (
          <nav aria-label="Admin sections" className="-mb-px flex h-14 min-w-0 items-stretch gap-1 overflow-x-auto">
            {nav.map((n) => {
              const active = n.id === (ACTIVE_FOR[section] ?? section);
              const count = n.id === "inbox" ? unread : n.id === "reviews" ? waiting : n.id === "applications" ? applicants : 0;
              return (
                <Link key={n.id} href={n.href} aria-current={active ? "page" : undefined} className={cn(NAV_LINK, active && "border-b-primary text-foreground")}>
                  <n.icon className="size-4" aria-hidden />
                  <span className={cn(!desktop && n.id !== section && "sr-only sm:not-sr-only")}>{n.label}</span>
                  {count > 0 ? (
                    <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[11px] font-semibold tabular-nums" aria-label={n.id === "inbox" ? `${count} unread` : `${count} waiting`}>
                      {count > 99 ? "99+" : count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
            {desktop ? <SetupMenu section={section} /> : null}
          </nav>
        )}
      </AppHeader>
      <div className="print:hidden">
        <ConnectionBanner status={socket} />
      </div>
      <main id="main" className="animate-enter flex min-h-0 flex-1 flex-col print:block">
        {/* Pages with a visible title render their own h1; the rest get a screen-reader one. */}
        {SR_TITLE[section] ? <h1 className="sr-only">{SR_TITLE[section]}</h1> : null}
        {desktop === null ? null : !desktop && phone === "gate" ? (
          <DesktopGate />
        ) : (
          <SectionBoundary key={section} label="This page">
            {children(me, desktop)}
          </SectionBoundary>
        )}
      </main>
    </div>
  );
}

const NAV_LINK =
  // Equal borders top and bottom keep the label on the header's centre line; the bottom one turns into the active underline.
  "text-muted-foreground hover:text-foreground focus-visible:ring-ring flex shrink-0 items-center gap-2 border-y-2 border-transparent px-2.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset";

/** Hand-ins waiting, for the Reviews badge (desktop only; the queue refreshes every minute). */
function useReviewCount(enabled: boolean): number {
  const { api } = useSession();
  const q = useQuery({ queryKey: ["reviews", "all"], queryFn: () => api.reviews(null), enabled, refetchInterval: 60_000 });
  return q.data?.items.length ?? 0;
}

/** Payments waiting to be checked, for the Applications badge. */
function useApplicationCount(enabled: boolean): number {
  const { api } = useSession();
  const q = useQuery({ queryKey: ["applications", "count"], queryFn: () => api.applications("submitted"), enabled, refetchInterval: 60_000 });
  return q.data?.waiting ?? 0;
}

function SetupMenu({ section }: { section: Section }) {
  const active = SETUP_NAV.some((n) => n.id === section);
  const current = SETUP_NAV.find((n) => n.id === section);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(NAV_LINK, "cursor-pointer", active && "border-b-primary text-foreground")} data-testid="nav-setup">
        <Settings2 className="size-4" aria-hidden />
        {current ? `Setup · ${current.label}` : "Setup"}
        <ChevronDown className="size-3.5 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {SETUP_NAV.map((n) => (
          <DropdownMenuItem key={n.id} asChild>
            <Link href={n.href} aria-current={n.id === section ? "page" : undefined} className="flex items-start gap-2.5">
              <n.icon className="mt-0.5" aria-hidden />
              <span className="flex flex-col">
                <span className="font-medium">{n.label}</span>
                <span className="text-muted-foreground text-xs">{n.hint}</span>
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
