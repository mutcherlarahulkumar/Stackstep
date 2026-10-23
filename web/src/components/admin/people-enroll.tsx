"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, FileUp, UserPlus } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { type EnrollSettings } from "@/lib/api/client";
import { type Cohort, type ImportResult, type Me } from "@/lib/api/schemas";
import { MAX_IMPORT_ROWS, normalizeLogin, parseRoster, TIMEZONES, todayISO, validLogin, type ImportRow } from "@/lib/people";
import { useSession } from "@/lib/session";

import { ListSkeleton } from "../app/state";
import { useFlows } from "./catalog-queries";
import { splitError } from "./form-errors";

const NONE = "none";

export function usePrograms() {
  const { api } = useSession();
  return useQuery({ queryKey: ["programs"], queryFn: () => api.programs(), staleTime: 300_000 });
}

export function useCohorts() {
  const { api } = useSession();
  return useQuery({ queryKey: ["cohorts"], queryFn: () => api.cohorts() });
}

export function useColleges() {
  const { api } = useSession();
  return useQuery({ queryKey: ["colleges"], queryFn: () => api.colleges() });
}

type Settings = { cohortId: string; programSlug: string; startDate: string; timezone: string; flowId: string };

const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "Asia/Kolkata";
  }
};

function initialSettings(isAdmin: boolean, cohorts: readonly Cohort[]): Settings {
  const first = cohorts.find((c) => c.seats_used < c.seats_total);
  return {
    cohortId: isAdmin ? NONE : (first?.id ?? NONE),
    programSlug: "",
    startDate: "",
    timezone: TIMEZONES.includes(browserZone()) ? browserZone() : "Asia/Kolkata",
    flowId: NONE,
  };
}

function toApi(s: Settings): EnrollSettings {
  const cohort = s.cohortId === NONE ? null : s.cohortId;
  return {
    cohort_id: cohort,
    program_slug: cohort ? undefined : s.programSlug,
    start_date: s.startDate || null,
    timezone: s.timezone,
    flow_id: s.flowId === NONE ? null : s.flowId,
  };
}

/** Cohort, program, start date, time zone and flow: shared by one enrollment and an import. */
function SettingsFields({
  me,
  value,
  onChange,
  errors,
  cohorts,
  idPrefix,
}: {
  me: Me;
  value: Settings;
  onChange: (s: Settings) => void;
  errors: Record<string, string | undefined>;
  cohorts: readonly Cohort[];
  idPrefix: string;
}) {
  const programs = usePrograms();
  const flows = useFlows();
  const isAdmin = me.user.role === "admin";
  const cohort = cohorts.find((c) => c.id === value.cohortId) ?? null;
  const days = cohort?.program.days ?? programs.data?.find((p) => p.slug === value.programSlug)?.days ?? null;
  const flowChoices = (flows.data ?? []).filter((f) => !f.archived && f.published_version !== null && (days === null || f.days === days));
  const zones = TIMEZONES.includes(value.timezone) ? TIMEZONES : [value.timezone, ...TIMEZONES];
  const set = (patch: Partial<Settings>) => onChange({ ...value, ...patch });
  // The server allows starts up to 30 days back; computed once so render stays pure.
  const [minStart] = useState(() => todayISO(new Date(Date.now() - 30 * 86_400_000)));
  return (
    <>
      <Field data-invalid={!!errors.cohort_id}>
        <FieldLabel htmlFor={`${idPrefix}-cohort`}>Cohort</FieldLabel>
        <Select value={value.cohortId} onValueChange={(v) => set({ cohortId: v, flowId: NONE })}>
          <SelectTrigger id={`${idPrefix}-cohort`} className="w-full" aria-invalid={!!errors.cohort_id}>
            <SelectValue placeholder="Pick a cohort" />
          </SelectTrigger>
          <SelectContent>
            {isAdmin ? <SelectItem value={NONE}>No cohort (independent student)</SelectItem> : null}
            {cohorts.map((c) => (
              <SelectItem key={c.id} value={c.id} disabled={c.seats_used >= c.seats_total}>
                {c.name} · {c.program.slug} · {c.seats_used}/{c.seats_total} seats
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.cohort_id ? (
          <FieldError>{errors.cohort_id}</FieldError>
        ) : cohort ? (
          <FieldDescription>
            {cohort.college_name ?? "Independent group"} · starts {cohort.start_date}
          </FieldDescription>
        ) : null}
      </Field>
      {cohort === null ? (
        <Field data-invalid={!!errors.program_slug}>
          <FieldLabel htmlFor={`${idPrefix}-program`}>Program</FieldLabel>
          <Select value={value.programSlug} onValueChange={(v) => set({ programSlug: v, flowId: NONE })}>
            <SelectTrigger id={`${idPrefix}-program`} className="w-full" aria-invalid={!!errors.program_slug}>
              <SelectValue placeholder={programs.isPending ? "Loading…" : "Pick a program"} />
            </SelectTrigger>
            <SelectContent>
              {(programs.data ?? []).map((p) => (
                <SelectItem key={p.slug} value={p.slug}>
                  {p.slug} · {p.days} days · {p.track}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.program_slug ? <FieldError>{errors.program_slug}</FieldError> : null}
        </Field>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!errors.start_date}>
          <FieldLabel htmlFor={`${idPrefix}-start`}>Start date</FieldLabel>
          <Input
            id={`${idPrefix}-start`}
            type="date"
            value={value.startDate}
            min={minStart}
            onChange={(e) => set({ startDate: e.target.value })}
            aria-invalid={!!errors.start_date}
          />
          {errors.start_date ? <FieldError>{errors.start_date}</FieldError> : <FieldDescription>{cohort ? "Leave empty to use the cohort's date." : "Day 1 of the internship."}</FieldDescription>}
        </Field>
        <Field data-invalid={!!errors.timezone}>
          <FieldLabel htmlFor={`${idPrefix}-tz`}>Time zone</FieldLabel>
          <Select value={value.timezone} onValueChange={(v) => set({ timezone: v })}>
            <SelectTrigger id={`${idPrefix}-tz`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {zones.map((z) => (
                <SelectItem key={z} value={z}>
                  {z}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.timezone ? <FieldError>{errors.timezone}</FieldError> : null}
        </Field>
      </div>
      <Field data-invalid={!!errors.flow_id}>
        <FieldLabel htmlFor={`${idPrefix}-flow`}>Flow (optional)</FieldLabel>
        <Select value={value.flowId} onValueChange={(v) => set({ flowId: v })}>
          <SelectTrigger id={`${idPrefix}-flow`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No flow yet — assign tasks by hand</SelectItem>
            {flowChoices.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name} · {f.days} days
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.flow_id ? <FieldError>{errors.flow_id}</FieldError> : <FieldDescription>Schedules the flow&apos;s tasks day by day from the start date.</FieldDescription>}
      </Field>
    </>
  );
}

export function EnrollPanel({ me }: { me: Me }) {
  const cohorts = useCohorts();
  if (cohorts.isPending) return <ListSkeleton rows={3} className="h-40" />;
  const list = cohorts.data ?? [];
  if (me.user.role !== "admin" && list.length === 0) {
    return (
      <Alert>
        <CircleAlert aria-hidden />
        <AlertTitle>No cohorts for your college yet</AlertTitle>
        <AlertDescription>A platform admin creates cohorts. Once there is one, you can enroll students into it here.</AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <EnrollOne me={me} cohorts={list} />
      <ImportRoster me={me} cohorts={list} />
    </div>
  );
}

function EnrollOne({ me, cohorts }: { me: Me; cohorts: readonly Cohort[] }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const id = useId();
  const [login, setLogin] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [settings, setSettings] = useState<Settings>(() => initialSettings(me.user.role === "admin", cohorts));
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const e: Record<string, string | undefined> = {};
    if (!validLogin(login)) e.github_login = "Enter a GitHub username: letters, digits and single hyphens.";
    if (settings.cohortId === NONE && !settings.programSlug) e.program_slug = "Pick a program.";
    if (settings.cohortId === NONE && !settings.startDate) e.start_date = "Pick a start date.";
    setErrors(e);
    setFormError(null);
    if (Object.values(e).some(Boolean)) return;
    setBusy(true);
    try {
      const res = await api.enroll({ github_login: normalizeLogin(login), name: name.trim() || undefined, email: email.trim() || undefined }, toApi(settings));
      toast.success(`Enrolled @${res.student.user.github_login}`, {
        description: res.user_created ? "They get access the first time they sign in with GitHub." : "They'll see it next time they open Stackstep.",
      });
      setLogin("");
      setName("");
      setEmail("");
      void qc.invalidateQueries({ queryKey: ["cohorts"] });
      void qc.invalidateQueries({ queryKey: ["students"] });
      void qc.invalidateQueries({ queryKey: ["overview"] });
      void qc.invalidateQueries({ queryKey: ["colleges"] });
    } catch (err) {
      const { fields, form } = splitError(err);
      setErrors(fields);
      setFormError(form);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="size-4" aria-hidden /> Enroll a student
        </CardTitle>
        <CardDescription>By GitHub username. They don&apos;t need to have signed in yet — access is linked the first time they do.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id={`${id}-form`}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <FieldGroup>
            {formError ? (
              <Alert variant="destructive">
                <CircleAlert aria-hidden />
                <AlertTitle>Couldn&apos;t enroll</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}
            <Field data-invalid={!!errors.github_login}>
              <FieldLabel htmlFor={`${id}-login`}>GitHub username</FieldLabel>
              <Input
                id={`${id}-login`}
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="asha-dev"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={!!errors.github_login}
              />
              {errors.github_login ? <FieldError>{errors.github_login}</FieldError> : null}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor={`${id}-name`}>Name (optional)</FieldLabel>
                <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" aria-invalid={!!errors.name} />
                {errors.name ? <FieldError>{errors.name}</FieldError> : <FieldDescription>Replaced by their GitHub name on sign-in.</FieldDescription>}
              </Field>
              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor={`${id}-email`}>Email (optional)</FieldLabel>
                <Input id={`${id}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" aria-invalid={!!errors.email} />
                {errors.email ? <FieldError>{errors.email}</FieldError> : null}
              </Field>
            </div>
            <SettingsFields me={me} value={settings} onChange={setSettings} errors={errors} cohorts={cohorts} idPrefix={id} />
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter>
        <Button type="submit" form={`${id}-form`} disabled={busy} data-testid="enroll-submit">
          {busy ? <Spinner data-icon="inline-start" /> : <UserPlus data-icon="inline-start" aria-hidden />} Enroll
        </Button>
      </CardFooter>
    </Card>
  );
}

const SAMPLE = "github_login,name,email\nasha-dev,Asha Rao,asha@example.com\nravi-dev,Ravi Teja,";

function ImportRoster({ me, cohorts }: { me: Me; cohorts: readonly Cohort[] }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const id = useId();
  const [text, setText] = useState("");
  const [settings, setSettings] = useState<Settings>(() => initialSettings(me.user.role === "admin", cohorts));
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const rows = text.trim() ? parseRoster(text) : [];
  const good = rows.filter((r) => r.problem === null);
  const tooMany = good.length > MAX_IMPORT_ROWS;

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1_000_000) {
      toast.error("That file is over 1 MB. Split it into smaller files.");
      return;
    }
    setText(await file.text());
    setResult(null);
  };

  const submit = async () => {
    const e: Record<string, string | undefined> = {};
    if (good.length === 0) e.rows = "Add at least one valid row.";
    if (tooMany) e.rows = `Import at most ${MAX_IMPORT_ROWS} students at once.`;
    if (settings.cohortId === NONE && !settings.programSlug) e.program_slug = "Pick a program.";
    if (settings.cohortId === NONE && !settings.startDate) e.start_date = "Pick a start date.";
    setErrors(e);
    setFormError(null);
    if (Object.values(e).some(Boolean)) return;
    setBusy(true);
    try {
      const res = await api.importEnrollments(
        good.map((r) => ({ github_login: r.github_login, name: r.name || undefined, email: r.email || undefined })),
        toApi(settings),
      );
      setResult(res);
      const failed = res.items.length - res.created;
      if (failed === 0) toast.success(`Enrolled ${res.created} ${res.created === 1 ? "student" : "students"}`);
      else toast.warning(`Enrolled ${res.created} of ${res.items.length}`, { description: "See the rows that need attention below." });
      for (const k of ["cohorts", "students", "overview", "colleges"]) void qc.invalidateQueries({ queryKey: [k] });
    } catch (err) {
      const { fields, form } = splitError(err);
      setErrors(fields);
      setFormError(form);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileUp className="size-4" aria-hidden /> Import a roster
        </CardTitle>
        <CardDescription>
          Paste or upload a CSV with a <code className="text-xs">github_login</code> column (name and email optional), up to {MAX_IMPORT_ROWS} rows. Each row
          succeeds or fails on its own; running it again is safe.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id={`${id}-form`}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <FieldGroup>
            {formError ? (
              <Alert variant="destructive">
                <CircleAlert aria-hidden />
                <AlertTitle>Couldn&apos;t import</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}
            <Field data-invalid={!!errors.rows}>
              <FieldLabel htmlFor={`${id}-csv`}>Roster</FieldLabel>
              <Textarea
                id={`${id}-csv`}
                rows={6}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setResult(null);
                }}
                placeholder={SAMPLE}
                className="font-mono text-xs"
                spellCheck={false}
                aria-invalid={!!errors.rows}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Input
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="max-w-64"
                  aria-label="Upload a CSV file"
                  onChange={(e) => void readFile(e.target.files?.[0])}
                />
                {rows.length > 0 ? (
                  <span className="text-muted-foreground text-xs tabular-nums" data-testid="roster-count">
                    {good.length} ready{rows.length > good.length ? `, ${rows.length - good.length} to fix` : ""}
                  </span>
                ) : null}
              </div>
              {errors.rows ? <FieldError>{errors.rows}</FieldError> : null}
            </Field>
            {rows.some((r) => r.problem) ? <ProblemRows rows={rows.filter((r) => r.problem)} /> : null}
            <SettingsFields me={me} value={settings} onChange={setSettings} errors={errors} cohorts={cohorts} idPrefix={id} />
          </FieldGroup>
        </form>
        {result ? <ImportResults result={result} /> : null}
      </CardContent>
      <CardFooter>
        <Button type="submit" form={`${id}-form`} disabled={busy || good.length === 0} data-testid="import-submit">
          {busy ? <Spinner data-icon="inline-start" /> : <FileUp data-icon="inline-start" aria-hidden />} Import {good.length > 0 ? good.length : ""}
        </Button>
      </CardFooter>
    </Card>
  );
}

function ProblemRows({ rows }: { rows: ImportRow[] }) {
  return (
    <Alert variant="destructive" data-testid="roster-problems">
      <CircleAlert aria-hidden />
      <AlertTitle>These rows will be skipped</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 list-disc pl-4">
          {rows.slice(0, 8).map((r) => (
            <li key={r.line}>
              Line {r.line}: {r.problem}
              {r.github_login ? ` (${r.github_login})` : ""}
            </li>
          ))}
          {rows.length > 8 ? <li>…and {rows.length - 8} more</li> : null}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function ImportResults({ result }: { result: ImportResult }) {
  return (
    <div className="mt-6 rounded-lg border" data-testid="import-results">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>GitHub</TableHead>
            <TableHead>Result</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.items.map((r, i) => (
            <TableRow key={`${r.github_login}-${i}`}>
              <TableCell className="font-mono text-xs">@{r.github_login}</TableCell>
              <TableCell>
                {r.error ? (
                  <span className="text-destructive text-sm">{Object.values(r.error.fields ?? {})[0] ?? r.error.message}</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <CircleCheck className="text-success size-4" aria-hidden /> Enrolled
                    {r.user_created ? <Badge variant="outline">Not signed in yet</Badge> : null}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
