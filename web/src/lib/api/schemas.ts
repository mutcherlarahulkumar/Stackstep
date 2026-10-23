/**
 * Runtime schemas for every payload in api/openapi.yaml. Responses are parsed with these
 * before use, so a contract drift fails at the boundary with a clear error instead of
 * surfacing as `undefined` in the UI. Unknown enum values are rejected; unknown extra
 * fields are ignored so the server can add fields without breaking older clients.
 */
import { z } from "zod";

const timestamp = z.iso.datetime({ offset: true }).transform((s) => new Date(s));
const date = z.iso.date();

export const ROLES = ["student", "college_admin", "admin"] as const;
export const TASK_TYPES = ["feature", "bug_fix", "dsa", "doc_reading", "quiz", "git_chore", "code_review", "standup", "blog"] as const;
export const TASK_STATUSES = ["todo", "in_progress", "in_review", "changes_requested", "done", "cancelled"] as const;
export const ENROLLMENT_STATUSES = ["active", "paused", "completed", "cancelled"] as const;
export const REVIEW_MODES = ["manual", "self"] as const;
export const PERSONA_COLORS = ["violet", "blue", "emerald", "amber", "rose", "cyan", "slate"] as const;
export const FLOW_VERSION_STATUSES = ["draft", "published", "retired"] as const;
export const AUTHORS = ["student", "persona"] as const;
export const ERROR_CODES = [
  "bad_request",
  "payload_too_large",
  "unauthenticated",
  "forbidden",
  "not_found",
  "validation_failed",
  "invalid_transition",
  "version_conflict",
  "enrollment_not_active",
  "no_active_enrollment",
  "rate_limited",
  "invalid_state",
  "invalid_code",
  "not_configured",
  "insufficient_credits",
  "ai_unavailable",
  "internal",
] as const;
export const CREDIT_REASONS = ["welcome", "task_done", "admin_grant", "admin_revoke", "ai_question", "ai_refund"] as const;
export const CreditReason = z.enum(CREDIT_REASONS);
export type CreditReason = z.infer<typeof CreditReason>;
export const CERTIFICATE_STATUSES = ["valid", "revoked"] as const;
export const CertificateStatus = z.enum(CERTIFICATE_STATUSES);
export const COHORT_KINDS = ["group", "college"] as const;
export const CohortKind = z.enum(COHORT_KINDS);
export type CohortKind = z.infer<typeof CohortKind>;
export type CertificateStatus = z.infer<typeof CertificateStatus>;

export const Role = z.enum(ROLES);
export const TaskType = z.enum(TASK_TYPES);
export const TaskStatus = z.enum(TASK_STATUSES);
export const EnrollmentStatus = z.enum(ENROLLMENT_STATUSES);
export const ErrorCode = z.enum(ERROR_CODES);
export const ReviewMode = z.enum(REVIEW_MODES);
export const PersonaColor = z.enum(PERSONA_COLORS);
export const FlowVersionStatus = z.enum(FLOW_VERSION_STATUSES);
export const Author = z.enum(AUTHORS);

export type Role = z.infer<typeof Role>;
export type TaskType = z.infer<typeof TaskType>;
export type TaskStatus = z.infer<typeof TaskStatus>;
export type EnrollmentStatus = z.infer<typeof EnrollmentStatus>;
export type ErrorCode = z.infer<typeof ErrorCode>;
export type ReviewMode = z.infer<typeof ReviewMode>;
export type PersonaColor = z.infer<typeof PersonaColor>;
export type FlowVersionStatus = z.infer<typeof FlowVersionStatus>;
export type Author = z.infer<typeof Author>;

export const User = z.object({
  id: z.uuid(),
  github_login: z.string().min(1).max(39),
  name: z.string().min(1),
  email: z.string().nullable(),
  avatar_url: z.string().nullable(),
  role: Role,
  college_id: z.uuid().nullable(),
});
export type User = z.output<typeof User>;

export const Enrollment = z.object({
  id: z.uuid(),
  program: z.object({
    slug: z.string(),
    days: z.union([z.literal(30), z.literal(60)]),
    track: z.enum(["frontend", "fullstack"]),
  }),
  start_date: date,
  end_date: date,
  timezone: z.string(),
  status: EnrollmentStatus,
  day_number: z.int().min(0).max(60),
  flow: z.object({ flow_id: z.uuid(), version_id: z.uuid(), name: z.string(), version: z.int().min(1) }).nullable(),
});
export type Enrollment = z.output<typeof Enrollment>;

export const Me = z.object({ user: User, enrollment: Enrollment.nullable() });
export type Me = z.output<typeof Me>;

export const Resource = z.object({ title: z.string().min(1).max(80), url: z.string().min(1).max(2048) });
export type Resource = z.output<typeof Resource>;

export const QuizQuestion = z.object({
  prompt: z.string(),
  options: z.array(z.string()).min(2).max(6),
  /** Null for students until the quiz is finished. */
  answer: z.int().min(0).nullable(),
});
export type QuizQuestion = z.output<typeof QuizQuestion>;

export const Quiz = z.object({ questions: z.array(QuizQuestion).min(1).max(20), pass_percent: z.int().min(1).max(100) });
export type Quiz = z.output<typeof Quiz>;

export const TaskContent = z.object({ resources: z.array(Resource).max(5), quiz: Quiz.nullable() });
export type TaskContent = z.output<typeof TaskContent>;

export const Submission = z.object({ attempt: z.int().min(1), url: z.string().nullable(), note: z.string(), submitted_at: timestamp });
export type Submission = z.output<typeof Submission>;

export const QuizStats = z.object({
  attempts: z.int().min(0).max(3),
  attempts_left: z.int().min(0).max(3),
  best_score: z.int().min(0).max(100),
  passed: z.boolean(),
  last_correct: z.array(z.boolean()),
});
export type QuizStats = z.output<typeof QuizStats>;

export const QuizAttemptResult = z.object({
  attempt: z.int().min(1).max(3),
  score: z.int().min(0).max(100),
  passed: z.boolean(),
  correct: z.array(z.boolean()),
  attempts_left: z.int().min(0).max(2),
});
export type QuizAttemptResult = z.output<typeof QuizAttemptResult>;

export const Task = z.object({
  id: z.uuid(),
  enrollment_id: z.uuid(),
  type: TaskType,
  title: z.string(),
  brief: z.string(),
  status: TaskStatus,
  scheduled_for: timestamp,
  due_at: timestamp,
  version: z.int().min(1),
  created_at: timestamp,
  updated_at: timestamp,
  review_mode: ReviewMode,
  persona_id: z.uuid(),
  from_flow: z.boolean(),
  content: TaskContent,
  submission: Submission.nullable(),
  quiz_result: QuizStats.nullable(),
});
export type Task = z.output<typeof Task>;

export const Message = z.object({
  id: z.uuid(),
  enrollment_id: z.uuid(),
  persona_id: z.uuid(),
  author: Author,
  body: z.string(),
  task_id: z.uuid().nullable(),
  client_id: z.uuid().nullable(),
  sent_at: timestamp,
});
export type Message = z.output<typeof Message>;

export const Student = z.object({
  user: User,
  enrollment: Enrollment,
  open_tasks: z.int().min(0),
  in_review: z.int().min(0),
});
export type Student = z.output<typeof Student>;

export const Persona = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  title: z.string(),
  color: PersonaColor,
  auto_reply: z.boolean(),
  archived: z.boolean(),
  version: z.int().min(1),
});
export type Persona = z.output<typeof Persona>;

/** "HH:MM", 24-hour local time in the student's time zone. */
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const taskSpec = {
  type: TaskType,
  title: z.string(),
  brief: z.string(),
  persona_id: z.uuid(),
  review_mode: ReviewMode,
  release_time: clockTime,
  due_minutes: z.int().min(15).max(10_080),
  release_window: z.int().min(0).max(480),
  content: TaskContent,
};
export const TaskSpec = z.object(taskSpec);
export type TaskSpec = z.output<typeof TaskSpec>;

export const TaskTemplate = z.object({ id: z.uuid(), ...taskSpec, archived: z.boolean(), version: z.int().min(1), updated_at: timestamp });
export type TaskTemplate = z.output<typeof TaskTemplate>;

export const Flow = z.object({
  id: z.uuid(),
  name: z.string(),
  stream: z.string(),
  description: z.string(),
  days: z.union([z.literal(30), z.literal(60)]),
  archived: z.boolean(),
  version: z.int().min(1),
  updated_at: timestamp,
});
export type Flow = z.output<typeof Flow>;

export const FlowSummary = Flow.extend({
  published_version: z.int().min(1).nullable(),
  has_draft: z.boolean(),
  task_count: z.int().min(0),
  active_students: z.int().min(0),
});
export type FlowSummary = z.output<typeof FlowSummary>;

export const FlowItem = z.object({ id: z.uuid(), day: z.int().min(1).max(60), position: z.int().min(0), template_id: z.uuid().nullable(), ...taskSpec });
export type FlowItem = z.output<typeof FlowItem>;

export const FlowVersion = z.object({
  id: z.uuid(),
  number: z.int().min(1),
  status: FlowVersionStatus,
  revision: z.int().min(1),
  published_at: timestamp.nullable(),
  items: z.array(FlowItem),
});
export type FlowVersion = z.output<typeof FlowVersion>;

export const FlowDetail = z.object({ flow: Flow, draft: FlowVersion.nullable(), published: FlowVersion.nullable() });
export type FlowDetail = z.output<typeof FlowDetail>;

export const ItemError = z.object({ code: z.string(), message: z.string(), fields: z.record(z.string(), z.string()).optional() });
export type ItemError = z.output<typeof ItemError>;

export const AssignResult = z.object({
  enrollment_id: z.uuid(),
  generated: z.int().min(0),
  skipped: z.int().min(0),
  cancelled: z.int().min(0),
  error: ItemError.nullable(),
});
export type AssignResult = z.output<typeof AssignResult>;

export const BroadcastResult = z.object({
  sent: z.int().min(0),
  items: z.array(z.object({ enrollment_id: z.uuid(), sent: z.boolean(), error: ItemError.nullable() })),
});
export type BroadcastResult = z.output<typeof BroadcastResult>;

export const Thread = z.object({ enrollment_id: z.uuid(), persona: Persona, last_message: Message.nullable(), unread: z.int().min(0) });
export type Thread = z.output<typeof Thread>;

export const StaffThread = Thread.extend({
  student: z.object({ name: z.string(), github_login: z.string(), avatar_url: z.string().nullable() }),
});
export type StaffThread = z.output<typeof StaffThread>;

const page = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), next_cursor: z.string().nullable() });

export const TaskList = z.object({ items: z.array(Task) });
export const MessagePage = page(Message);
export const StudentPage = page(Student);
export const EnrollmentTasks = z.object({ enrollment: Enrollment, items: z.array(Task) });
export const ThreadList = z.object({ items: z.array(Thread) });
export const QuizAnswerResponse = z.object({ task: Task, result: QuizAttemptResult });
export type QuizAnswerResponse = z.output<typeof QuizAnswerResponse>;
export const StaffThreadPage = page(StaffThread);
export const PersonaList = z.object({ items: z.array(Persona) });
export const TemplatePage = page(TaskTemplate);
export const FlowList = z.object({ items: z.array(FlowSummary) });
export const AssignResultList = z.object({ items: z.array(AssignResult) });
export type StaffThreadPage = z.output<typeof StaffThreadPage>;
export type TemplatePage = z.output<typeof TemplatePage>;
export type MessagePage = z.output<typeof MessagePage>;
export type StudentPage = z.output<typeof StudentPage>;
export type EnrollmentTasks = z.output<typeof EnrollmentTasks>;

/** Web sign-in responses never include the refresh token: it lives in an HttpOnly cookie. */
export const AccessToken = z.object({ access_token: z.string().min(1), access_expires_at: timestamp });

export const ErrorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string(), z.string()).optional(),
    retry_after_seconds: z.int().positive().optional(),
    request_id: z.string().optional(),
  }),
});

export const Frame = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("message"), message: Message }),
  z.object({ type: z.literal("task"), task: Task }),
]);
export type Frame = z.output<typeof Frame>;

export const RuntimeConfig = z.object({ wsUrl: z.string().min(1), devLogin: z.boolean() });
export type RuntimeConfig = z.output<typeof RuntimeConfig>;

export const CreditEntry = z.object({
  id: z.int(),
  delta: z.int(),
  reason: CreditReason,
  note: z.string(),
  task_id: z.uuid().nullable(),
  created_at: timestamp,
});
export type CreditEntry = z.output<typeof CreditEntry>;

export const Wallet = z.object({
  points: z.object({ total: z.int().min(0), finished: z.int().min(0), on_time: z.int().min(0) }),
  credits: z.object({ balance: z.int(), history: z.array(CreditEntry) }),
  ai: z.object({
    enabled: z.boolean(),
    daily_limit: z.int().min(1),
    used_today: z.int().min(0),
    cost_per_question: z.int().min(1),
    next_question_at: timestamp.nullable(),
  }),
});
export type Wallet = z.output<typeof Wallet>;

export const AIConversation = z.object({
  id: z.uuid(),
  task_id: z.uuid().nullable(),
  title: z.string(),
  follow_ups: z.int().min(0),
  created_at: timestamp,
  updated_at: timestamp,
});
export type AIConversation = z.output<typeof AIConversation>;

export const AIMessage = z.object({
  id: z.uuid(),
  role: z.enum(["student", "assistant"]),
  status: z.enum(["pending", "answered", "failed", "ok"]),
  kind: z.enum(["question", "follow_up", "answer"]),
  body: z.string(),
  parts: z
    .object({ goal: z.string(), tried: z.string(), error: z.string(), code: z.string(), tried_since: z.string(), question: z.string() })
    .nullable(),
  created_at: timestamp,
});
export type AIMessage = z.output<typeof AIMessage>;

export const AIConversationDetail = z.object({
  conversation: AIConversation,
  messages: z.array(AIMessage),
  follow_ups_left: z.int().min(0),
  follow_up_at: timestamp.nullable(),
  wallet: Wallet,
});
export type AIConversationDetail = z.output<typeof AIConversationDetail>;
export const AIConversationList = z.object({ items: z.array(AIConversation) });

export const Certificate = z.object({
  code: z.string().regex(/^[2-9A-HJKMNP-Z]{12}$/),
  student_name: z.string(),
  github_login: z.string(),
  program_slug: z.string(),
  program_days: z.union([z.literal(30), z.literal(60)]),
  flow_name: z.string().nullable(),
  start_date: date,
  end_date: date,
  points: z.int().min(0),
  tasks_done: z.int().min(0),
  tasks_total: z.int().min(0),
  issued_at: timestamp,
  status: CertificateStatus,
  revoked_at: timestamp.nullable(),
  revoke_reason: z.string().nullable(),
});
export type Certificate = z.output<typeof Certificate>;
export const CertificateList = z.object({ items: z.array(Certificate) });

export const Progress = z.object({
  released: z.int().min(0),
  done: z.int().min(0),
  in_review: z.int().min(0),
  overdue: z.int().min(0),
  on_time: z.int().min(0),
  points: z.int().min(0),
  day_number: z.int().min(0),
  days: z.int(),
  completion_percent: z.int().min(0).max(100),
  bar_percent: z.int(),
  meets_bar: z.boolean(),
  certificate: Certificate.nullable(),
});
export type Progress = z.output<typeof Progress>;

export const OverviewRow = z.object({
  student: Student,
  released: z.int().min(0),
  done: z.int().min(0),
  in_review: z.int().min(0),
  overdue: z.int().min(0),
  completion_percent: z.int().min(0).max(100),
  points: z.int().min(0),
  credits: z.int().min(0),
  last_active_at: timestamp.nullable(),
  inactive: z.boolean(),
  certificate: z.object({ code: z.string(), status: CertificateStatus }).nullable(),
});
export type OverviewRow = z.output<typeof OverviewRow>;

export const Overview = z.object({
  items: z.array(OverviewRow),
  summary: z.object({
    students: z.int().min(0),
    active: z.int().min(0),
    inactive: z.int().min(0),
    certificates: z.int().min(0),
    overdue_tasks: z.int().min(0),
    avg_completion: z.int().min(0).max(100),
  }),
  truncated: z.boolean(),
  inactive_after_hours: z.int(),
  generated_at: timestamp,
});
export type Overview = z.output<typeof Overview>;

export const Program = z.object({ slug: z.string(), days: z.union([z.literal(30), z.literal(60)]), track: z.enum(["frontend", "fullstack"]) });
export type Program = z.output<typeof Program>;
export const ProgramList = z.object({ items: z.array(Program) });

export const College = z.object({
  id: z.uuid(),
  name: z.string(),
  students: z.int().min(0),
  cohorts: z.int().min(0),
  college_admins: z.int().min(0),
  created_at: timestamp,
});
export type College = z.output<typeof College>;
export const CollegeList = z.object({ items: z.array(College) });

export const Cohort = z.object({
  id: z.uuid(),
  kind: CohortKind,
  name: z.string(),
  college_id: z.uuid().nullable(),
  college_name: z.string().nullable(),
  program: Program,
  start_date: date,
  seats_total: z.int().min(1),
  seats_used: z.int().min(0),
});
export type Cohort = z.output<typeof Cohort>;
export const CohortList = z.object({ items: z.array(Cohort) });

export const EnrollResult = z.object({ student: Student, user_created: z.boolean() });
export type EnrollResult = z.output<typeof EnrollResult>;

export const ImportResult = z.object({
  created: z.int().min(0),
  items: z.array(z.object({ github_login: z.string(), student: Student.nullable(), user_created: z.boolean(), error: ItemError.nullable() })),
});
export type ImportResult = z.output<typeof ImportResult>;

export const StaffMember = z.object({ user: User, college_name: z.string().nullable(), signed_in: z.boolean() });
export type StaffMember = z.output<typeof StaffMember>;
export const StaffList = z.object({ items: z.array(StaffMember) });
