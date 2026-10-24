import { type z } from "zod";

import { ApiError, NetworkError, toErrorCode } from "./errors";
import * as S from "./schemas";
import { type CohortKind, type EnrollmentStatus } from "./schemas";

/**
 * Talks to the Go API through the same-origin /api proxy. The access token lives in memory
 * only; the refresh token is an HttpOnly cookie the browser sends to /api/v1/auth/refresh.
 */
export type CreateTaskInput = {
  type: S.TaskType;
  /** Null lets the server pick the default team lead. */
  persona_id: string | null;
  review_mode: S.ReviewMode;
  title: string;
  brief: string;
  scheduled_for: Date | null;
  due_at: Date;
  content: ContentInput;
};

/** Content as sent: quiz answers are always set by the author. */
export type ContentInput = { resources: S.Resource[]; quiz: { questions: { prompt: string; options: string[]; answer: number }[]; pass_percent: number } | null };
export type SubmissionInput = { url: string; note: string };
export type AIQuestionInput = { task_id: string | null; goal: string; tried: string; error: string; code: string };
export type AIFollowUpInput = { tried_since: string; body: string };

export type PersonaInput = { name: string; title: string; color: S.PersonaColor; auto_reply: boolean };
export type TemplateInput = Omit<S.TaskSpec, "content"> & { content: ContentInput };
export type FlowInput = { name: string; stream: string; description: string; days: 30 | 60 };
export type DraftItemInput = TemplateInput & { day: number; template_id: string | null };
export type TemplateFilter = { q?: string; type?: S.TaskType | null; personaId?: string | null; includeArchived?: boolean };

type Method = "GET" | "POST" | "PUT" | "PATCH";
export type PersonInput = { github_login: string; name?: string; email?: string };
export type EnrollSettings = { cohort_id: string | null; program_slug?: string; start_date: string | null; timezone: string; flow_id: string | null };
export type CohortInput = {
  kind: CohortKind;
  name: string;
  college_id: string | null;
  program_slug: string;
  start_date: string;
  timezone: string;
  seats_total: number;
};

type SendOpts = { body?: unknown; query?: Record<string, string | null>; auth?: boolean; retried?: boolean };

type Options = { baseUrl?: string; fetch?: typeof fetch; now?: () => number; timeoutMs?: number };

export class ApiClient {
  private access: string | null = null;
  private accessExpiresAt = 0;
  private refreshing: Promise<boolean> | null = null;
  private readonly base: string;
  private readonly doFetch: typeof fetch;
  private readonly now: () => number;
  private readonly timeoutMs: number;

  private onSessionExpired: (() => void) | null = null;

  /** Registers the callback run when the session can't be recovered. */
  setSessionExpiredHandler(fn: (() => void) | null): void {
    this.onSessionExpired = fn;
  }

  constructor(opts: Options = {}) {
    this.base = opts.baseUrl ?? "/api";
    this.doFetch = opts.fetch ?? ((...args) => fetch(...args));
    this.now = opts.now ?? Date.now;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  get hasSession(): boolean {
    return this.access !== null;
  }

  // ---- Session ----

  /** Restores the session from the refresh cookie. False means signed out. */
  restore(): Promise<boolean> {
    return this.refresh();
  }

  async devLogin(githubLogin: string): Promise<void> {
    this.accept(await this.send("POST", "/v1/auth/dev-login", S.AccessToken, { body: { github_login: githubLogin }, auth: false }));
  }

  async logout(): Promise<void> {
    this.access = null;
    this.accessExpiresAt = 0;
    try {
      await this.send("POST", "/v1/auth/logout", null, { auth: false });
    } catch {
      // Best effort: the local session is already gone.
    }
  }

  githubStartUrl(): string {
    return `${this.base}/v1/auth/github/start?client=web`;
  }

  async accessTokenForSocket(): Promise<string | null> {
    return (await this.ensureFresh()) ? this.access : null;
  }

  // ---- Student ----

  me() {
    return this.send("GET", "/v1/me", S.Me);
  }

  acceptTerms(version: number) {
    return this.send("POST", "/v1/me/consent", S.Account, { body: { version } });
  }

  finishOnboarding() {
    return this.send("POST", "/v1/me/onboarded", S.Account);
  }

  /** Everything we hold about the caller, as a JSON file. */
  async exportMyData(): Promise<{ blob: Blob; filename: string }> {
    const res = await this.raw("GET", "/v1/me/export", {});
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "stackstep-my-data.json";
    return { blob: await res.blob(), filename: name };
  }

  async myTasks() {
    return (await this.send("GET", "/v1/me/tasks", S.TaskList)).items;
  }

  async threads() {
    return (await this.send("GET", "/v1/me/threads", S.ThreadList)).items;
  }

  messages(personaId: string, cursor: string | null = null, limit = 50) {
    return this.send("GET", `/v1/me/threads/${seg(personaId)}/messages`, S.MessagePage, { query: { limit: String(limit), cursor } });
  }

  sendMessage(personaId: string, clientId: string, body: string) {
    return this.send("POST", `/v1/me/threads/${seg(personaId)}/messages`, S.Message, { body: { client_id: clientId, body } });
  }

  async markRead(personaId: string): Promise<void> {
    await this.send("POST", `/v1/me/threads/${seg(personaId)}/read`, null);
  }

  transition(taskId: string, to: S.TaskStatus, expectedVersion: number, note = "", submission: SubmissionInput | null = null) {
    return this.send("POST", `/v1/tasks/${seg(taskId)}/transitions`, S.Task, {
      body: { to, expected_version: expectedVersion, note, submission },
    });
  }

  submitQuiz(taskId: string, expectedVersion: number, answers: number[]) {
    return this.send("POST", `/v1/tasks/${seg(taskId)}/quiz`, S.QuizAnswerResponse, { body: { expected_version: expectedVersion, answers } });
  }

  // ---- Points, credits and the AI helper ----

  wallet() {
    return this.send("GET", "/v1/me/wallet", S.Wallet);
  }

  async aiConversations() {
    return (await this.send("GET", "/v1/me/ai/conversations", S.AIConversationList)).items;
  }

  aiConversation(id: string) {
    return this.send("GET", `/v1/me/ai/conversations/${seg(id)}`, S.AIConversationDetail);
  }

  /** Same client id on retry: the server never charges twice. */
  askAI(clientId: string, q: AIQuestionInput) {
    return this.send("POST", "/v1/me/ai/conversations", S.AIConversationDetail, { body: { client_id: clientId, ...q } });
  }

  followUpAI(conversationId: string, clientId: string, f: AIFollowUpInput) {
    return this.send("POST", `/v1/me/ai/conversations/${seg(conversationId)}/messages`, S.AIConversationDetail, { body: { client_id: clientId, ...f } });
  }

  staffWallet(enrollmentId: string) {
    return this.send("GET", `/v1/admin/enrollments/${seg(enrollmentId)}/wallet`, S.Wallet);
  }

  grantCredits(enrollmentId: string, delta: number, note: string) {
    return this.send("POST", `/v1/admin/enrollments/${seg(enrollmentId)}/credits`, S.Wallet, { body: { delta, note } });
  }

  async staffAIConversations(enrollmentId: string) {
    return (await this.send("GET", `/v1/admin/enrollments/${seg(enrollmentId)}/ai/conversations`, S.AIConversationList)).items;
  }

  staffAIConversation(enrollmentId: string, conversationId: string) {
    return this.send("GET", `/v1/admin/enrollments/${seg(enrollmentId)}/ai/conversations/${seg(conversationId)}`, S.AIConversationDetail);
  }

  // ---- Progress and certificates ----

  progress() {
    return this.send("GET", "/v1/me/progress", S.Progress);
  }

  async certificates() {
    return (await this.send("GET", "/v1/me/certificates", S.CertificateList)).items;
  }

  staffProgress(enrollmentId: string) {
    return this.send("GET", `/v1/admin/enrollments/${seg(enrollmentId)}/progress`, S.Progress);
  }

  issueCertificate(enrollmentId: string) {
    return this.send("POST", `/v1/admin/enrollments/${seg(enrollmentId)}/certificate`, S.Certificate);
  }

  revokeCertificate(code: string, reason: string) {
    return this.send("POST", `/v1/admin/certificates/${seg(code)}/revoke`, S.Certificate, { body: { reason } });
  }

  /** Public: works signed out. */
  verifyCertificate(code: string) {
    return this.send("GET", `/v1/certificates/${seg(code)}`, S.Certificate, { auth: false });
  }

  // ---- Review queue ----

  reviews(personaId: string | null) {
    return this.send("GET", "/v1/admin/reviews", S.ReviewQueue, { query: { persona_id: personaId } });
  }

  // ---- People ----

  async colleges() {
    return (await this.send("GET", "/v1/admin/colleges", S.CollegeList)).items;
  }

  createCollege(name: string) {
    return this.send("POST", "/v1/admin/colleges", S.College, { body: { name } });
  }

  async programs() {
    return (await this.send("GET", "/v1/admin/programs", S.ProgramList)).items;
  }

  async cohorts() {
    return (await this.send("GET", "/v1/admin/cohorts", S.CohortList)).items;
  }

  createCohort(input: CohortInput) {
    return this.send("POST", "/v1/admin/cohorts", S.Cohort, { body: input });
  }

  enroll(person: PersonInput, settings: EnrollSettings) {
    return this.send("POST", "/v1/admin/enrollments", S.EnrollResult, { body: { ...person, ...settings } });
  }

  importEnrollments(rows: PersonInput[], settings: EnrollSettings) {
    return this.send("POST", "/v1/admin/enrollments/import", S.ImportResult, { body: { ...settings, rows } });
  }

  setEnrollmentStatus(enrollmentId: string, status: EnrollmentStatus) {
    return this.send("POST", `/v1/admin/enrollments/${seg(enrollmentId)}/status`, S.Enrollment, { body: { status } });
  }

  async staff() {
    return (await this.send("GET", "/v1/admin/staff", S.StaffList)).items;
  }

  grantStaff(person: PersonInput, role: "admin" | "college_admin", collegeId: string | null) {
    return this.send("POST", "/v1/admin/staff", S.StaffMember, { body: { ...person, role, college_id: collegeId } });
  }

  revokeStaff(userId: string) {
    return this.send("POST", `/v1/admin/staff/${seg(userId)}/revoke`, S.StaffMember);
  }

  // ---- Placement overview ----

  overview(q: string) {
    return this.send("GET", "/v1/admin/overview", S.Overview, { query: { q: q || null } });
  }

  /** The overview as a CSV file (auth header, so it can't be a plain link). */
  async exportOverview(q: string): Promise<{ blob: Blob; filename: string }> {
    const res = await this.raw("GET", "/v1/admin/overview/export", { q: q || null });
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "stackstep-cohort.csv";
    return { blob: await res.blob(), filename: name };
  }

  // ---- Admin ----

  students(q = "", cursor: string | null = null, limit = 30) {
    return this.send("GET", "/v1/admin/students", S.StudentPage, { query: { limit: String(limit), q: q || null, cursor } });
  }

  enrollmentTasks(enrollmentId: string) {
    return this.send("GET", `/v1/admin/enrollments/${seg(enrollmentId)}/tasks`, S.EnrollmentTasks);
  }

  createTask(enrollmentId: string, input: CreateTaskInput) {
    return this.send("POST", `/v1/admin/enrollments/${seg(enrollmentId)}/tasks`, S.Task, {
      body: {
        type: input.type,
        persona_id: input.persona_id,
        review_mode: input.review_mode,
        title: input.title,
        brief: input.brief,
        scheduled_for: input.scheduled_for?.toISOString() ?? null,
        due_at: input.due_at.toISOString(),
        content: input.content,
      },
    });
  }

  // ---- Inbox ----

  staffThreads(opts: { personaId?: string | null; unreadOnly?: boolean; cursor?: string | null; limit?: number } = {}) {
    return this.send("GET", "/v1/admin/threads", S.StaffThreadPage, {
      query: {
        limit: String(opts.limit ?? 30),
        persona_id: opts.personaId ?? null,
        unread: opts.unreadOnly ? "true" : null,
        cursor: opts.cursor ?? null,
      },
    });
  }

  staffMessages(enrollmentId: string, personaId: string, cursor: string | null = null, limit = 50) {
    return this.send("GET", `/v1/admin/threads/${seg(enrollmentId)}/${seg(personaId)}/messages`, S.MessagePage, {
      query: { limit: String(limit), cursor },
    });
  }

  staffSend(enrollmentId: string, personaId: string, clientId: string, body: string) {
    return this.send("POST", `/v1/admin/threads/${seg(enrollmentId)}/${seg(personaId)}/messages`, S.Message, { body: { client_id: clientId, body } });
  }

  async staffMarkRead(enrollmentId: string, personaId: string): Promise<void> {
    await this.send("POST", `/v1/admin/threads/${seg(enrollmentId)}/${seg(personaId)}/read`, null);
  }

  broadcast(personaId: string, clientId: string, enrollmentIds: string[], body: string) {
    return this.send("POST", "/v1/admin/broadcasts", S.BroadcastResult, {
      body: { persona_id: personaId, client_id: clientId, enrollment_ids: enrollmentIds, body },
    });
  }

  // ---- Catalog ----

  async personas(includeArchived = false) {
    return (await this.send("GET", "/v1/admin/personas", S.PersonaList, { query: { include_archived: includeArchived ? "true" : null } })).items;
  }

  createPersona(input: PersonaInput) {
    return this.send("POST", "/v1/admin/personas", S.Persona, { body: input });
  }

  updatePersona(id: string, input: PersonaInput & { archived: boolean }, expectedVersion: number) {
    return this.send("PATCH", `/v1/admin/personas/${seg(id)}`, S.Persona, { body: { ...input, expected_version: expectedVersion } });
  }

  templates(f: TemplateFilter = {}, cursor: string | null = null, limit = 50) {
    return this.send("GET", "/v1/admin/task-templates", S.TemplatePage, {
      query: {
        limit: String(limit),
        q: f.q || null,
        type: f.type ?? null,
        persona_id: f.personaId ?? null,
        include_archived: f.includeArchived ? "true" : null,
        cursor,
      },
    });
  }

  createTemplate(input: TemplateInput) {
    return this.send("POST", "/v1/admin/task-templates", S.TaskTemplate, { body: input });
  }

  updateTemplate(id: string, input: TemplateInput & { archived: boolean }, expectedVersion: number) {
    return this.send("PATCH", `/v1/admin/task-templates/${seg(id)}`, S.TaskTemplate, { body: { ...input, expected_version: expectedVersion } });
  }

  async flows(includeArchived = false) {
    return (await this.send("GET", "/v1/admin/flows", S.FlowList, { query: { include_archived: includeArchived ? "true" : null } })).items;
  }

  flow(id: string) {
    return this.send("GET", `/v1/admin/flows/${seg(id)}`, S.FlowDetail);
  }

  createFlow(input: FlowInput) {
    return this.send("POST", "/v1/admin/flows", S.FlowDetail, { body: input });
  }

  updateFlow(id: string, input: FlowInput & { archived: boolean }, expectedVersion: number) {
    return this.send("PATCH", `/v1/admin/flows/${seg(id)}`, S.Flow, { body: { ...input, expected_version: expectedVersion } });
  }

  /** Replaces the draft's items. `expectedRevision` 0 starts a new draft from the published version. */
  saveDraft(id: string, expectedRevision: number, items: DraftItemInput[]) {
    return this.send("PUT", `/v1/admin/flows/${seg(id)}/draft`, S.FlowDetail, { body: { expected_revision: expectedRevision, items } });
  }

  publishFlow(id: string, expectedRevision: number) {
    return this.send("POST", `/v1/admin/flows/${seg(id)}/publish`, S.FlowDetail, { body: { expected_revision: expectedRevision } });
  }

  duplicateFlow(id: string, name: string, stream: string) {
    return this.send("POST", `/v1/admin/flows/${seg(id)}/duplicate`, S.FlowDetail, { body: { name, stream } });
  }

  async assignFlowToMany(flowId: string, enrollmentIds: string[]) {
    return (await this.send("POST", `/v1/admin/flows/${seg(flowId)}/assign`, S.AssignResultList, { body: { enrollment_ids: enrollmentIds } })).items;
  }

  assignFlow(enrollmentId: string, flowId: string) {
    return this.send("PUT", `/v1/admin/enrollments/${seg(enrollmentId)}/flow`, S.AssignResult, { body: { flow_id: flowId } });
  }

  // ---- Transport ----

  private accept(t: z.output<typeof S.AccessToken>) {
    this.access = t.access_token;
    this.accessExpiresAt = t.access_expires_at.getTime();
  }

  private async ensureFresh(): Promise<boolean> {
    if (this.access && this.accessExpiresAt - this.now() > 30_000) return true;
    return this.refresh();
  }

  /**
   * Single-flight: concurrent callers share one refresh, because rotating the same refresh
   * token twice is treated as theft by the server and signs the user out everywhere.
   */
  private refresh(): Promise<boolean> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<boolean> {
    try {
      this.accept(await this.send("POST", "/v1/auth/refresh", S.AccessToken, { auth: false }));
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        this.access = null;
        this.accessExpiresAt = 0;
        return false;
      }
      throw e;
    }
  }

  /** An authenticated request whose body isn't JSON (downloads). Throws like send(). */
  private async raw(method: Method, path: string, query: Record<string, string | null> = {}, retried = false): Promise<Response> {
    if (!(await this.ensureFresh())) {
      this.onSessionExpired?.();
      throw new ApiError(401, "unauthenticated", "Please sign in again.");
    }
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== null) qs.set(k, v);
    const headers: Record<string, string> = { "X-Client": "web" };
    if (this.access) headers.Authorization = `Bearer ${this.access}`;
    let res: Response;
    try {
      res = await this.doFetch(`${this.base}${path}${qs.size ? `?${qs.toString()}` : ""}`, {
        method,
        headers,
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new NetworkError(e instanceof Error ? e.message : "fetch failed");
    }
    if (res.status === 401 && !retried) {
      this.access = null;
      if (await this.refresh()) return this.raw(method, path, query, true);
      this.onSessionExpired?.();
    }
    if (!res.ok) throw await toApiError(res);
    return res;
  }

  private async send<T extends z.ZodType>(method: Method, path: string, schema: T, opts?: SendOpts): Promise<z.output<T>>;
  private async send(method: Method, path: string, schema: null, opts?: SendOpts): Promise<null>;
  private async send<T extends z.ZodType>(method: Method, path: string, schema: T | null, opts: SendOpts = {}): Promise<z.output<T> | null> {
    const auth = opts.auth ?? true;
    if (auth && !(await this.ensureFresh())) {
      this.onSessionExpired?.();
      throw new ApiError(401, "unauthenticated", "Please sign in again.");
    }
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== null) qs.set(k, v);
    const url = `${this.base}${path}${qs.size ? `?${qs.toString()}` : ""}`;
    const headers: Record<string, string> = { Accept: "application/json", "X-Client": "web" };
    if (auth && this.access) headers.Authorization = `Bearer ${this.access}`;
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
      res = await this.doFetch(url, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new NetworkError(e instanceof Error ? e.message : "fetch failed");
    }

    if (res.status === 401 && auth && !opts.retried) {
      this.access = null;
      if (await this.refresh()) return this.send(method, path, schema as T, { ...opts, retried: true });
      this.onSessionExpired?.();
    }
    if (res.status === 204 || schema === null) {
      if (res.ok) return null;
    } else if (res.ok) {
      const parsed = schema.safeParse(await res.json().catch(() => undefined));
      if (!parsed.success) throw new NetworkError(`unexpected response shape for ${path}: ${parsed.error.message}`);
      return parsed.data;
    }
    throw await toApiError(res);
  }
}

/** Encodes one path segment. */
const seg = (s: string) => encodeURIComponent(s);

async function toApiError(res: Response): Promise<Error> {
  if (res.status >= 502 && res.status <= 504) return new NetworkError(`HTTP ${res.status}`);
  const parsed = S.ErrorEnvelope.safeParse(await res.json().catch(() => undefined));
  if (!parsed.success) return new ApiError(res.status, null, `Unexpected response (${res.status}).`);
  const e = parsed.data.error;
  return new ApiError(res.status, toErrorCode(e.code), e.message, e.fields ?? {}, e.retry_after_seconds ?? null);
}
