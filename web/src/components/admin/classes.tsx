"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, CircleAlert, Copy, Radio, Video } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { messageFor } from "@/lib/api/errors";
import { type Audience, type LiveClass } from "@/lib/api/schemas";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { DatePicker } from "../app/date-picker";
import { InfoNote } from "../app/info-note";
import { PAGE, PageHeader } from "../app/page-header";
import { EmptyState, ErrorState, ListSkeleton } from "../app/state";
import { AdminShell } from "./admin-shell";
import { audienceLabel } from "./announcements";
import { useFlows } from "./catalog-queries";
import { splitError } from "./form-errors";
import { useCohorts } from "./people-enroll";

export function ClassesScreen() {
  return <AdminShell section="classes" phone="gate">{() => <Classes />}</AdminShell>;
}

function useClasses() {
  const { api } = useSession();
  return useQuery({ queryKey: ["classes"], queryFn: () => api.staffClasses(), refetchInterval: 30_000 });
}

/** Local date (YYYY-MM-DD) and time (HH:MM) to an ISO instant. */
export function localInstant(date: string, time: string): string | null {
  if (!date || !/^\d{2}:\d{2}$/.test(time)) return null;
  const d = new Date(`${date}T${time}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function Classes() {
  const q = useClasses();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={cn(PAGE, "gap-6")}>
        <PageHeader title="Live classes" description="Teach live: share your screen, draw on it, talk, and take questions." />
        <InfoNote id="classes" title="How live classes work">
          Schedule a class for everyone, one flow or one cohort. Invited students get a letter in their mail and the class on their calendar. When
          it&apos;s time, open the room and press Start presenting: your voice goes out straight away, and you can share your screen and draw on
          it. Students chat, ask and upvote questions, react and raise a hand; you let them speak. Nothing in the room is recorded or stored.
          Turn a good question or message into an announcement with the megaphone, and it lands in every invitee&apos;s mail. As an admin you
          can open any class, take over presenting and end it.
        </InfoNote>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <ScheduleForm />
          <section aria-label="Classes" className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">Upcoming and past</h2>
            {q.isPending ? (
              <ListSkeleton rows={3} className="h-24" />
            ) : q.isError ? (
              <ErrorState message={messageFor(q.error)} onRetry={() => void q.refetch()} />
            ) : q.data.length === 0 ? (
              <EmptyState icon={Video} title="No classes yet">
                Schedule your first one. Students are invited by mail the moment you save it.
              </EmptyState>
            ) : (
              q.data.map((c) => <ClassCard key={c.id} c={c} />)
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

const STATUS: Record<LiveClass["status"], { label: string; tone: string }> = {
  scheduled: { label: "Scheduled", tone: "" },
  live: { label: "Live now", tone: "bg-rose-600 text-white" },
  ended: { label: "Ended", tone: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelled", tone: "bg-muted text-muted-foreground line-through" },
};

function ClassCard({ c }: { c: LiveClass }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const set = useMutation({
    mutationFn: (status: "ended" | "cancelled") => api.setClassStatus(c.id, status),
    onSuccess: (x) => {
      toast.success(x.status === "cancelled" ? `Cancelled ${x.title}` : `Ended ${x.title}`);
      void qc.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (e) => toast.error(messageFor(e)),
  });
  const open = c.status === "scheduled" || c.status === "live";
  return (
    <Card size="sm" data-testid={`class-${c.title}`}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("gap-1.5", STATUS[c.status].tone)}>
            {c.status === "live" ? <span className="size-1.5 animate-pulse rounded-full bg-white" aria-hidden /> : null}
            {STATUS[c.status].label}
          </Badge>
          {c.in_room > 0 ? <span className="text-muted-foreground text-xs">{c.in_room} in the room</span> : null}
        </div>
        <CardTitle className="text-base">{c.title}</CardTitle>
        <CardDescription>
          {c.starts_at.toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {c.duration_minutes} min ·{" "}
          {audienceLabel(c)} · {c.host_name}
        </CardDescription>
      </CardHeader>
      {open ? (
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild size="sm" data-testid="class-open-room">
            <Link href={`/classes/${c.id}`}>
              <Radio data-icon="inline-start" aria-hidden /> Open the room
            </Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(`${window.location.origin}/classes/${c.id}`);
              toast.success("Link copied");
            }}
          >
            <Copy data-icon="inline-start" aria-hidden /> Copy link
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" disabled={set.isPending} onClick={() => set.mutate(c.status === "live" ? "ended" : "cancelled")}>
            {c.status === "live" ? "End now" : "Cancel"}
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}

function ScheduleForm() {
  const { api } = useSession();
  const qc = useQueryClient();
  const id = useId();
  const flows = useFlows();
  const cohorts = useCohorts();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("18:00");
  const [duration, setDuration] = useState("60");
  const [audience, setAudience] = useState<Audience>("all");
  const [flowId, setFlowId] = useState("");
  const [cohortId, setCohortId] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      api.scheduleClass({
        title,
        description,
        starts_at: localInstant(date, time) ?? "",
        duration_minutes: Number(duration),
        audience,
        flow_id: audience === "flow" ? flowId : null,
        cohort_id: audience === "cohort" ? cohortId : null,
      }),
    onSuccess: (c) => {
      toast.success(`Scheduled ${c.title}. Invitations are in the students' mail.`);
      setTitle("");
      setDescription("");
      void qc.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (e) => {
      const { fields, form } = splitError(e);
      setErrors(fields);
      setFormError(form);
    },
  });
  const submit = () => {
    const e: Record<string, string | undefined> = {};
    if (title.trim().length < 3) e.title = "Give the class a title of at least 3 characters.";
    if (!localInstant(date, time)) e.starts_at = "Pick the day and time.";
    if (audience === "flow" && !flowId) e.flow_id = "Pick the flow.";
    if (audience === "cohort" && !cohortId) e.cohort_id = "Pick the cohort.";
    setErrors(e);
    setFormError(null);
    if (Object.values(e).some(Boolean)) return;
    save.mutate();
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarPlus className="text-primary size-5" aria-hidden /> Schedule a class
        </CardTitle>
        <CardDescription>Times are in your time zone.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <FieldGroup>
            {formError ? (
              <Alert variant="destructive">
                <CircleAlert aria-hidden />
                <AlertTitle>Couldn&apos;t schedule it</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}
            <Field data-invalid={!!errors.title}>
              <FieldLabel htmlFor={`${id}-title`}>Title</FieldLabel>
              <Input id={`${id}-title`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Git branching, live" aria-invalid={!!errors.title} />
              {errors.title ? <FieldError>{errors.title}</FieldError> : null}
            </Field>
            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor={`${id}-desc`}>What it covers (optional)</FieldLabel>
              <Textarea id={`${id}-desc`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Bring a repo with two branches." />
              {errors.description ? <FieldError>{errors.description}</FieldError> : null}
            </Field>
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem_8rem]">
              <Field data-invalid={!!errors.starts_at}>
                <FieldLabel htmlFor={`${id}-date`}>Day</FieldLabel>
                <DatePicker id={`${id}-date`} value={date} onChange={setDate} invalid={!!errors.starts_at} />
                {errors.starts_at ? <FieldError>{errors.starts_at}</FieldError> : null}
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-time`}>Time</FieldLabel>
                <Input id={`${id}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </Field>
              <Field data-invalid={!!errors.duration_minutes}>
                <FieldLabel htmlFor={`${id}-dur`}>Length</FieldLabel>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger id={`${id}-dur`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["30", "45", "60", "90", "120"].map((m) => (
                      <SelectItem key={m} value={m}>
                        {m} min
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${id}-aud`}>Invite</FieldLabel>
                <Select value={audience} onValueChange={(v) => setAudience(v === "flow" || v === "cohort" ? v : "all")}>
                  <SelectTrigger id={`${id}-aud`} className="w-full" data-testid="class-audience">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Everyone</SelectItem>
                    <SelectItem value="flow">Students on a flow</SelectItem>
                    <SelectItem value="cohort">Students in a cohort</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {audience === "flow" ? (
                <Field data-invalid={!!errors.flow_id}>
                  <FieldLabel htmlFor={`${id}-flow`}>Flow</FieldLabel>
                  <Select value={flowId} onValueChange={setFlowId}>
                    <SelectTrigger id={`${id}-flow`} className="w-full">
                      <SelectValue placeholder="Pick a flow" />
                    </SelectTrigger>
                    <SelectContent>
                      {(flows.data ?? [])
                        .filter((f) => !f.archived)
                        .map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {errors.flow_id ? <FieldError>{errors.flow_id}</FieldError> : null}
                </Field>
              ) : audience === "cohort" ? (
                <Field data-invalid={!!errors.cohort_id}>
                  <FieldLabel htmlFor={`${id}-cohort`}>Cohort</FieldLabel>
                  <Select value={cohortId} onValueChange={setCohortId}>
                    <SelectTrigger id={`${id}-cohort`} className="w-full">
                      <SelectValue placeholder="Pick a cohort" />
                    </SelectTrigger>
                    <SelectContent>
                      {(cohorts.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.cohort_id ? <FieldError>{errors.cohort_id}</FieldError> : null}
                </Field>
              ) : null}
            </div>
            <FieldDescription>Invited students get a letter in their mail and the class on their calendar.</FieldDescription>
            <Button type="submit" disabled={save.isPending} data-testid="class-schedule">
              {save.isPending ? <Spinner data-icon="inline-start" /> : <CalendarPlus data-icon="inline-start" aria-hidden />} Schedule and invite
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
