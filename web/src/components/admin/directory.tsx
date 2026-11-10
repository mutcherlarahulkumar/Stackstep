"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  Check,
  ExternalLink,
  GraduationCap,
  Inbox,
  LogOut,
  Mail,
  MessageCircle,
  NotebookPen,
  Phone,
  Search,
  Trash2,
  TreePine,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { messageFor } from "@/lib/api/errors";
import { type ApplicationStatus, type Me, type Profile, type StaffNote, type UserKind, type UserRow } from "@/lib/api/schemas";
import { initials } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { AttendanceSeats, AttendanceStats, Forest } from "../attendance/attendance";
import { EmptyState, ErrorState, ListSkeleton } from "../app/state";
import { useFlows } from "./catalog-queries";
import { useCohorts } from "./people-enroll";

const ALL = "all";
const KINDS: { value: UserKind; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "interns", label: "Interns" },
  { value: "applicants", label: "Not enrolled" },
  { value: "today", label: "Seen today" },
  { value: "staff", label: "Staff" },
];
const ROLE_LABEL = { student: "Student", college_admin: "College admin", admin: "Admin" } as const;
const APP_LABEL: Record<ApplicationStatus, string> = {
  draft: "Draft",
  submitted: "Waiting for review",
  flagged: "Needs a fix",
  approved: "Approved",
  rejected: "Rejected",
};

/** "just now", "5 min ago", "3 h ago", "2 days ago" or a date. */
export function seenAgo(at: Date | null, now = Date.now()): string {
  if (!at) return "Never signed in";
  const min = Math.round((now - at.getTime()) / 60_000);
  if (min < 2) return "Active now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} ${d === 1 ? "day" : "days"} ago`;
  return at.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

function useDirectory(f: { q: string; kind: UserKind; cohortId: string | null; flowId: string | null }) {
  const { api } = useSession();
  return useInfiniteQuery({
    queryKey: ["users", f],
    queryFn: ({ pageParam }) => api.users({ ...f, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (p) => p.next_cursor,
  });
}

function useProfile(id: string | null) {
  const { api } = useSession();
  return useQuery({ queryKey: ["profile", id], queryFn: () => api.profile(id ?? ""), enabled: !!id });
}

/** Everyone in one place: filter by kind, cohort and flow, search, and open a full profile. */
export function Directory({ me }: { me: Me }) {
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());
  const [kind, setKind] = useState<UserKind>("all");
  const [cohortId, setCohortId] = useState<string | null>(null);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const dir = useDirectory({ q: query, kind, cohortId, flowId });
  const cohorts = useCohorts();
  const flows = useFlows();
  const rows = (dir.data?.pages ?? []).flatMap((p) => p.items);
  const [now] = useState(() => Date.now());

  return (
    <div className="flex flex-col gap-4" data-testid="directory">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, GitHub login or email" className="pl-8" aria-label="Search people" data-testid="directory-search" />
        </div>
        <Select value={cohortId ?? ALL} onValueChange={(v) => setCohortId(v === ALL ? null : v)}>
          <SelectTrigger className="w-48" aria-label="Cohort" data-testid="directory-cohort">
            <SelectValue placeholder="Any cohort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any cohort</SelectItem>
            {(cohorts.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={flowId ?? ALL} onValueChange={(v) => setFlowId(v === ALL ? null : v)}>
          <SelectTrigger className="w-48" aria-label="Flow" data-testid="directory-flow">
            <SelectValue placeholder="Any flow" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any flow</SelectItem>
            {(flows.data ?? []).map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ToggleGroup type="single" size="sm" variant="outline" value={kind} onValueChange={(v) => v && setKind(KINDS.find((k) => k.value === v)?.value ?? "all")} className="flex-wrap justify-start" aria-label="Show">
        {KINDS.map((k) => (
          <ToggleGroupItem key={k.value} value={k.value} data-testid={`directory-kind-${k.value}`}>
            {k.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {dir.isPending ? (
        <ListSkeleton rows={6} className="h-14" />
      ) : dir.isError ? (
        <ErrorState message={messageFor(dir.error)} onRetry={() => void dir.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Users} title="Nobody matches">
          Try another filter, or clear the search.
        </EmptyState>
      ) : (
        <ul className="bg-card divide-y rounded-xl border">
          {rows.map((r) => (
            <li key={r.user.id}>
              <PersonRow r={r} now={now} onOpen={() => setOpen(r.user.id)} />
            </li>
          ))}
          {dir.hasNextPage ? (
            <li className="p-2">
              <Button variant="ghost" className="w-full" disabled={dir.isFetchingNextPage} onClick={() => void dir.fetchNextPage()}>
                Show more
              </Button>
            </li>
          ) : null}
        </ul>
      )}
      <ProfileSheet id={open} me={me} onClose={() => setOpen(null)} />
    </div>
  );
}

function PersonRow({ r, now, onOpen }: { r: UserRow; now: number; onOpen: () => void }) {
  const online = r.last_seen_at && now - r.last_seen_at.getTime() < 5 * 60_000;
  return (
    <button type="button" onClick={onOpen} className="hover:bg-accent/50 focus-visible:ring-ring/60 flex w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset" data-testid={`person-${r.user.github_login}`}>
      <span className="relative">
        <Avatar className="size-10">
          {r.user.avatar_url ? <AvatarImage src={r.user.avatar_url} alt="" /> : null}
          <AvatarFallback>{initials(r.user.name, r.user.github_login)}</AvatarFallback>
        </Avatar>
        {online ? <span className="ring-card absolute right-0 bottom-0 size-2.5 rounded-full bg-emerald-500 ring-2" aria-label="Online" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{r.user.name}</span>
          <span className="text-muted-foreground truncate text-xs">@{r.user.github_login}</span>
          {r.user.role !== "student" ? <Badge variant="secondary">{ROLE_LABEL[r.user.role]}</Badge> : null}
        </span>
        <span className="text-muted-foreground block truncate text-xs">
          {r.enrollment
            ? [r.cohort?.name ?? "No cohort", r.enrollment.flow?.name, r.enrollment.status === "active" ? `Day ${r.enrollment.day_number}` : r.enrollment.status].filter(Boolean).join(" · ")
            : r.applications > 0
              ? `${r.applications} ${r.applications === 1 ? "application" : "applications"}, not enrolled`
              : r.user.role === "student"
                ? "Signed in, no internship"
                : (r.college_name ?? "Stackstep staff")}
        </span>
      </span>
      <span className="text-muted-foreground shrink-0 text-xs">{seenAgo(r.last_seen_at, now)}</span>
    </button>
  );
}

/** A person's full profile, like tapping a contact's name in a chat app. */
function ProfileSheet({ id, me, onClose }: { id: string | null; me: Me; onClose: () => void }) {
  const q = useProfile(id);
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg" data-testid="profile">
        {q.isPending ? (
          <div className="p-6">
            <SheetHeader className="sr-only">
              <SheetTitle>Loading profile</SheetTitle>
              <SheetDescription>One moment</SheetDescription>
            </SheetHeader>
            <ListSkeleton rows={5} className="h-16" />
          </div>
        ) : q.isError ? (
          <div className="p-6">
            <SheetHeader className="sr-only">
              <SheetTitle>Profile</SheetTitle>
              <SheetDescription>It didn&apos;t load</SheetDescription>
            </SheetHeader>
            <ErrorState message={messageFor(q.error)} onRetry={() => void q.refetch()} />
          </div>
        ) : (
          <ProfileBody p={q.data} me={me} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ icon: Icon, title, children, action }: { icon: typeof Users; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-t px-6 py-5" aria-label={title}>
      <h3 className="text-muted-foreground mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
        <Icon className="size-3.5" aria-hidden /> {title}
        <span className="ml-auto normal-case">{action}</span>
      </h3>
      {children}
    </section>
  );
}

function ProfileBody({ p, me, onClose }: { p: Profile; me: Me; onClose: () => void }) {
  const [now] = useState(() => Date.now());
  const [forest, setForest] = useState(false);
  const open = p.enrollments.find((e) => e.enrollment.status === "active" || e.enrollment.status === "paused");
  const current = open ?? p.enrollments[0];
  const app = p.applications[0];
  return (
    <>
      <div className="from-primary/15 bg-gradient-to-b to-transparent px-6 pt-10 pb-6 text-center">
        <Avatar className="ring-background mx-auto size-24 shadow-lg ring-4">
          {p.user.avatar_url ? <AvatarImage src={p.user.avatar_url} alt="" /> : null}
          <AvatarFallback className="text-2xl">{initials(p.user.name, p.user.github_login)}</AvatarFallback>
        </Avatar>
        <SheetHeader className="mt-4 items-center p-0">
          <SheetTitle className="text-2xl">{p.user.name}</SheetTitle>
          <SheetDescription>
            @{p.user.github_login} · {seenAgo(p.last_seen_at, now)}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-2 flex justify-center gap-1.5">
          <Badge variant="outline">{ROLE_LABEL[p.user.role]}</Badge>
          {current ? <Badge variant={current.enrollment.status === "active" ? "default" : "secondary"}>{current.enrollment.status === "active" ? `Day ${current.enrollment.day_number}` : current.enrollment.status}</Badge> : null}
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <QuickAction icon={GitHubIcon} label="GitHub" href={p.github_url} external testId="profile-github" />
          {open ? <QuickAction icon={MessageCircle} label="Chats" href={`/admin/inbox?student=${encodeURIComponent(p.user.github_login)}&enrollment=${open.enrollment.id}`} testId="profile-chats" /> : <QuickAction icon={Inbox} label="Applications" href="/admin/applications" />}
          {p.user.email ? <QuickAction icon={Mail} label="Email" href={`mailto:${p.user.email}`} external /> : <QuickAction icon={CalendarClock} label="Joined" text={p.created_at.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })} />}
        </div>
      </div>

      <NotesSection p={p} />

      {p.attendance ? (
        <Section
          icon={TreePine}
          title="Attendance"
          action={
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setForest(true)} data-testid="profile-forest">
              Show the forest
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <AttendanceStats a={p.attendance} />
            <AttendanceSeats a={p.attendance} compact />
          </div>
          <Dialog open={forest} onOpenChange={setForest}>
            <DialogContent className="sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>{p.user.name.split(" ")[0]}&apos;s forest</DialogTitle>
                <DialogDescription>A green tree for every day present, a bare one for every day missed.</DialogDescription>
              </DialogHeader>
              <Forest a={p.attendance} />
            </DialogContent>
          </Dialog>
        </Section>
      ) : null}

      <Section icon={GraduationCap} title="Internships">
        {p.enrollments.length === 0 ? (
          <p className="text-muted-foreground text-sm">No internship yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {p.enrollments.map((e) => (
              <li key={e.enrollment.id} className="bg-muted/40 rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {e.cohort_name ?? "No cohort"}
                  {e.college_name ? <span className="text-muted-foreground font-normal"> · {e.college_name}</span> : null}
                </p>
                <p className="text-muted-foreground text-xs">
                  {e.enrollment.program.days}-day {e.enrollment.program.track} · {e.enrollment.flow?.name ?? "No flow"} · {e.enrollment.start_date} to {e.enrollment.end_date} · {e.enrollment.status}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={Inbox} title="Applications">
        {p.applications.length === 0 ? (
          <p className="text-muted-foreground text-sm">Never applied.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {p.applications.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {a.cohort_name}
                  <span className="text-muted-foreground block text-xs">{a.created_at.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}</span>
                </span>
                <Badge variant="outline">{APP_LABEL[a.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={Users} title="About">
        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">GitHub</dt>
          <dd>
            <a href={p.github_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline">
              github.com/{p.user.github_login} <ExternalLink className="size-3" aria-hidden />
            </a>
          </dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd>{p.user.email ?? "Not shared"}</dd>
          {app ? (
            <>
              <dt className="text-muted-foreground">Phone</dt>
              <dd className="flex items-center gap-1">
                <Phone className="size-3" aria-hidden /> {app.phone}
              </dd>
              <dt className="text-muted-foreground">College</dt>
              <dd>{app.college}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Joined</dt>
          <dd>{p.created_at.toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}</dd>
          <dt className="text-muted-foreground">Last seen</dt>
          <dd>{p.last_seen_at ? p.last_seen_at.toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Never"}</dd>
          {p.signed_out_at ? (
            <>
              <dt className="text-muted-foreground">Signed out</dt>
              <dd>{p.signed_out_at.toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} by staff</dd>
            </>
          ) : null}
        </dl>
      </Section>

      {me.user.role === "admin" && me.user.id !== p.user.id ? <SignOutSection p={p} onDone={onClose} /> : null}
    </>
  );
}

function QuickAction({ icon: Icon, label, href, external, text, testId }: { icon: ComponentType<{ className?: string }>; label: string; href?: string; external?: boolean; text?: string; testId?: string }) {
  const inner = (
    <>
      <Icon className="text-primary size-5" aria-hidden />
      <span className="text-xs font-medium">{label}</span>
      {text ? <span className="text-muted-foreground text-[10px]">{text}</span> : null}
    </>
  );
  const cls = "bg-card hover:bg-accent flex flex-col items-center gap-1 rounded-xl border py-3 transition-colors";
  if (!href) return <div className={cls}>{inner}</div>;
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls} data-testid={testId}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={cls} data-testid={testId}>
      {inner}
    </Link>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

/** Staff notes as a small to-do list. Attendance sits on top so it's always in view. */
function NotesSection({ p }: { p: Profile }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const refresh = () => void qc.invalidateQueries({ queryKey: ["profile", p.user.id] });
  const add = useMutation({
    mutationFn: (body: string) => api.addStaffNote(p.user.id, body),
    onSuccess: () => {
      setDraft("");
      refresh();
    },
    onError: (e) => toast.error(messageFor(e)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draft.trim()) add.mutate(draft);
  };
  const open = p.notes.filter((n) => !n.done).length;
  return (
    <Section icon={NotebookPen} title="Notes" action={<span className="text-muted-foreground text-xs">{open} open</span>}>
      {p.attendance ? (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/8 px-3 py-2 text-sm" data-testid="profile-attendance-note">
          <TreePine className="size-4 text-emerald-600" aria-hidden />
          Present {p.attendance.present} of {p.attendance.present + p.attendance.missed} days, streak {p.attendance.streak}
        </div>
      ) : null}
      <form onSubmit={submit} className="flex flex-col gap-2">
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a note or a to-do. Only staff see it." rows={2} maxLength={2000} aria-label="New note" data-testid="note-input" />
        <Button type="submit" size="sm" className="self-end" disabled={!draft.trim() || add.isPending} data-testid="note-add">
          {add.isPending ? <Spinner data-icon="inline-start" /> : null} Add note
        </Button>
      </form>
      {p.notes.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {p.notes.map((n) => (
            <NoteItem key={n.id} n={n} onChanged={refresh} />
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

function NoteItem({ n, onChanged }: { n: StaffNote; onChanged: () => void }) {
  const { api } = useSession();
  const toggle = useMutation({ mutationFn: () => api.editStaffNote(n.id, { done: !n.done }), onSuccess: onChanged, onError: (e) => toast.error(messageFor(e)) });
  const del = useMutation({ mutationFn: () => api.deleteStaffNote(n.id), onSuccess: onChanged, onError: (e) => toast.error(messageFor(e)) });
  return (
    <li className="group hover:bg-muted/50 flex items-start gap-2.5 rounded-lg p-2" data-testid="note">
      <Checkbox checked={n.done} onCheckedChange={() => toggle.mutate()} disabled={toggle.isPending} aria-label={n.done ? "Mark as open" : "Mark as done"} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm break-words whitespace-pre-wrap", n.done && "text-muted-foreground line-through")}>{n.body}</p>
        <p className="text-muted-foreground text-[11px]">
          {n.author_name} · {n.created_at.toLocaleDateString([], { day: "numeric", month: "short" })}
          {n.done ? (
            <span className="ml-1 inline-flex items-center gap-0.5">
              <Check className="size-3" aria-hidden /> done
            </span>
          ) : null}
        </p>
      </div>
      <Button size="icon-sm" variant="ghost" className="opacity-60 group-hover:opacity-100" aria-label="Delete note" onClick={() => del.mutate()} disabled={del.isPending}>
        <Trash2 aria-hidden />
      </Button>
    </li>
  );
}

function SignOutSection({ p, onDone }: { p: Profile; onDone: () => void }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const out = useMutation({
    mutationFn: () => api.signOutEverywhere(p.user.id),
    onSuccess: () => {
      toast.success(`${p.user.name} is signed out everywhere`);
      void qc.invalidateQueries({ queryKey: ["profile", p.user.id] });
      void qc.invalidateQueries({ queryKey: ["users"] });
      onDone();
    },
    onError: (e) => toast.error(messageFor(e)),
  });
  return (
    <section className="border-t px-6 py-5" aria-label="Danger zone">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="text-destructive w-full" data-testid="profile-sign-out">
            <LogOut data-icon="inline-start" aria-hidden /> Sign out everywhere
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign {p.user.name} out everywhere?</AlertDialogTitle>
            <AlertDialogDescription>
              Every browser and phone they use is signed out now. Next time they come back they sign in with GitHub again. Their work and chats stay as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => out.mutate()} data-testid="profile-sign-out-confirm">
              Sign out everywhere
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <p className="text-muted-foreground mt-2 text-xs">Use it when a device is lost, an account is shared, or someone left.</p>
    </section>
  );
}
