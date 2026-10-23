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
export const TASK_TYPES = ["feature", "bug_fix", "dsa", "doc_reading", "quiz", "git_chore", "code_review", "standup"] as const;
export const TASK_STATUSES = ["todo", "in_progress", "in_review", "changes_requested", "done", "cancelled"] as const;
export const ENROLLMENT_STATUSES = ["active", "paused", "completed", "cancelled"] as const;
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
  "internal",
] as const;

export const Role = z.enum(ROLES);
export const TaskType = z.enum(TASK_TYPES);
export const TaskStatus = z.enum(TASK_STATUSES);
export const EnrollmentStatus = z.enum(ENROLLMENT_STATUSES);
export const ErrorCode = z.enum(ERROR_CODES);

export type Role = z.infer<typeof Role>;
export type TaskType = z.infer<typeof TaskType>;
export type TaskStatus = z.infer<typeof TaskStatus>;
export type EnrollmentStatus = z.infer<typeof EnrollmentStatus>;
export type ErrorCode = z.infer<typeof ErrorCode>;

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
});
export type Enrollment = z.output<typeof Enrollment>;

export const Me = z.object({ user: User, enrollment: Enrollment.nullable() });
export type Me = z.output<typeof Me>;

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
});
export type Task = z.output<typeof Task>;

export const Message = z.object({
  id: z.uuid(),
  author: z.enum(["student", "lead"]),
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

const page = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), next_cursor: z.string().nullable() });

export const TaskList = z.object({ items: z.array(Task) });
export const MessagePage = page(Message);
export const StudentPage = page(Student);
export const EnrollmentTasks = z.object({ enrollment: Enrollment, items: z.array(Task) });
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
