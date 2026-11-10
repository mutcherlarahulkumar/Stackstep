"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Megaphone, Send } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { messageFor } from "@/lib/api/errors";
import { type Announcement, type Audience, type Me } from "@/lib/api/schemas";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { InfoNote } from "../app/info-note";
import { PAGE, PageHeader } from "../app/page-header";
import { Prose } from "../app/prose";
import { EmptyState, ErrorState, ListSkeleton } from "../app/state";
import { AdminShell } from "./admin-shell";
import { useFlows } from "./catalog-queries";
import { splitError } from "./form-errors";
import { useCohorts } from "./people-enroll";

export const SUBJECT_MAX = 120;
export const BODY_MAX = 20000;

export function AnnouncementsScreen() {
  return <AdminShell section="announcements" phone="gate">{(me) => <Announcements me={me} />}</AdminShell>;
}

export function audienceLabel(a: Pick<Announcement, "audience" | "flow_name" | "cohort_name">): string {
  switch (a.audience) {
    case "all":
      return "Everyone";
    case "flow":
      return a.flow_name ? `On ${a.flow_name}` : "One flow";
    case "cohort":
      return a.cohort_name ? `In ${a.cohort_name}` : "One cohort";
    case "class":
      return "Class invitees";
  }
}

function useAnnouncements() {
  const { api } = useSession();
  return useQuery({ queryKey: ["announcements"], queryFn: () => api.announcements() });
}

function Announcements({ me }: { me: Me }) {
  const sent = useAnnouncements();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={cn(PAGE, "gap-6")}>
        <PageHeader title="Announcements" description="Write once, land in every student's mail." />
        <InfoNote id="announcements" title="How announcements work">
          An announcement goes to the Mail of every student with an open internship in the group you pick: everyone, one flow or one cohort.
          {me.user.role === "college_admin" ? " As a college admin you only reach your own college's students." : ""} It arrives unread with a
          badge on web and in the app. Write in Markdown; callouts like &quot;&gt; [!TIP]&quot; become coloured boxes, and links open in a new tab.
          For a quick word as a persona, use Broadcast in the Inbox instead.
        </InfoNote>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Composer />
          <section aria-label="Sent announcements" className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">Sent</h2>
            {sent.isPending ? (
              <ListSkeleton rows={3} className="h-24" />
            ) : sent.isError ? (
              <ErrorState message={messageFor(sent.error)} onRetry={() => void sent.refetch()} />
            ) : sent.data.length === 0 ? (
              <EmptyState icon={Megaphone} title="Nothing sent yet">
                Your announcements and how many students read them show up here.
              </EmptyState>
            ) : (
              sent.data.map((a) => <SentCard key={a.id} a={a} />)
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function SentCard({ a }: { a: Announcement }) {
  const pct = a.recipients ? Math.round((a.reads / a.recipients) * 100) : 0;
  return (
    <Card size="sm" data-testid={`announcement-${a.subject}`}>
      <CardHeader>
        <CardTitle className="text-base">{a.subject}</CardTitle>
        <CardDescription>
          {audienceLabel(a)} · {a.sent_by_name} · {a.created_at.toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        <Progress value={pct} className="flex-1" aria-label={`${a.reads} of ${a.recipients} read`} />
        <span className="text-muted-foreground text-xs tabular-nums" data-testid="announcement-reads">
          {a.reads} of {a.recipients} read
        </span>
      </CardContent>
    </Card>
  );
}

function Composer() {
  const { api } = useSession();
  const qc = useQueryClient();
  const id = useId();
  const flows = useFlows();
  const cohorts = useCohorts();
  const [audience, setAudience] = useState<Audience>("all");
  const [flowId, setFlowId] = useState("");
  const [cohortId, setCohortId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: () =>
      api.announce({
        subject,
        body,
        audience,
        flow_id: audience === "flow" ? flowId : null,
        cohort_id: audience === "cohort" ? cohortId : null,
      }),
    onSuccess: (a) => {
      toast.success(`Sent “${a.subject}” to ${a.recipients} ${a.recipients === 1 ? "student" : "students"}`);
      setSubject("");
      setBody("");
      void qc.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e) => {
      const { fields, form } = splitError(e);
      setErrors(fields);
      setFormError(form);
    },
  });
  const submit = () => {
    const e: Record<string, string | undefined> = {};
    const s = subject.trim().replace(/\s+/g, " ");
    if (s.length < 3) e.subject = "Write a subject of at least 3 characters.";
    if (s.length > SUBJECT_MAX) e.subject = `Keep the subject to ${SUBJECT_MAX} characters.`;
    if (!body.trim()) e.body = "Write the announcement.";
    if ([...body].length > BODY_MAX) e.body = `Keep the announcement to ${BODY_MAX} characters.`;
    if (audience === "flow" && !flowId) e.flow_id = "Pick the flow.";
    if (audience === "cohort" && !cohortId) e.cohort_id = "Pick the cohort.";
    setErrors(e);
    setFormError(null);
    if (Object.values(e).some(Boolean)) return;
    send.mutate();
  };
  const liveFlows = (flows.data ?? []).filter((f) => !f.archived && f.published_version !== null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>New announcement</CardTitle>
        <CardDescription>Students see it in Mail straight away.</CardDescription>
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
            {formError || errors.audience ? (
              <Alert variant="destructive">
                <CircleAlert aria-hidden />
                <AlertTitle>Couldn&apos;t send it</AlertTitle>
                <AlertDescription>{formError ?? errors.audience}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${id}-aud`}>Send to</FieldLabel>
                <Select value={audience} onValueChange={(v) => setAudience(v === "flow" || v === "cohort" ? v : "all")}>
                  <SelectTrigger id={`${id}-aud`} className="w-full" data-testid="announce-audience">
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
                    <SelectTrigger id={`${id}-flow`} className="w-full" aria-invalid={!!errors.flow_id}>
                      <SelectValue placeholder={flows.isPending ? "Loading…" : "Pick a flow"} />
                    </SelectTrigger>
                    <SelectContent>
                      {liveFlows.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name} · {f.active_students} active
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
                    <SelectTrigger id={`${id}-cohort`} className="w-full" aria-invalid={!!errors.cohort_id}>
                      <SelectValue placeholder={cohorts.isPending ? "Loading…" : "Pick a cohort"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(cohorts.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} · {c.seats_used} students
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.cohort_id ? <FieldError>{errors.cohort_id}</FieldError> : null}
                </Field>
              ) : null}
            </div>
            <Field data-invalid={!!errors.subject}>
              <div className="flex items-baseline justify-between">
                <FieldLabel htmlFor={`${id}-subject`}>Subject</FieldLabel>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {subject.trim().length}/{SUBJECT_MAX}
                </span>
              </div>
              <Input id={`${id}-subject`} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Demo day on Friday" aria-invalid={!!errors.subject} />
              {errors.subject ? <FieldError>{errors.subject}</FieldError> : null}
            </Field>
            <Field data-invalid={!!errors.body}>
              <FieldLabel htmlFor={`${id}-body`}>Message</FieldLabel>
              <Tabs defaultValue="write">
                <TabsList>
                  <TabsTrigger value="write">Write</TabsTrigger>
                  <TabsTrigger value="preview" disabled={!body.trim()} data-testid="announce-preview">
                    Preview
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="write">
                  <Textarea
                    id={`${id}-body`}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="min-h-56 font-mono text-sm"
                    placeholder={"## What's happening\n\nWrite it like a short note to your students.\n\n> [!TIP]\n> Callouts like this stand out."}
                    aria-invalid={!!errors.body}
                  />
                </TabsContent>
                <TabsContent value="preview">
                  <div className="bg-card max-h-[28rem] overflow-y-auto rounded-lg border p-4">
                    <Prose>{body}</Prose>
                  </div>
                </TabsContent>
              </Tabs>
              {errors.body ? <FieldError>{errors.body}</FieldError> : <FieldDescription>Markdown. Up to {BODY_MAX.toLocaleString()} characters.</FieldDescription>}
            </Field>
            <div className="flex items-center justify-end gap-2">
              <Badge variant="outline" className="font-normal">
                Lands in Mail
              </Badge>
              <Button type="submit" disabled={send.isPending} data-testid="announce-send">
                {send.isPending ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" aria-hidden />} Send announcement
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
