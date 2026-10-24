export const user = (o: Record<string, unknown> = {}) => ({
  id: "6f1c1d5e-1a7b-4c3e-9c0a-1b2c3d4e5f60",
  github_login: "asha-dev",
  name: "Asha Rao",
  email: null,
  avatar_url: null,
  role: "student",
  college_id: null,
  ...o,
});

export const enrollment = (o: Record<string, unknown> = {}) => ({
  id: "7a1c1d5e-1a7b-4c3e-9c0a-1b2c3d4e5f61",
  program: { slug: "frontend-30", days: 30, track: "frontend" },
  start_date: "2026-11-02",
  end_date: "2026-12-01",
  timezone: "Asia/Kolkata",
  status: "active",
  day_number: 3,
  flow: null,
  ...o,
});

export const LEAD_ID = "00000000-0000-4000-8000-000000000001";
export const MANAGER_ID = "00000000-0000-4000-8000-0000000000a1";

export const persona = (o: Record<string, unknown> = {}) => ({
  id: LEAD_ID,
  name: "Sam Rivera",
  title: "Team Lead",
  color: "violet",
  auto_reply: true,
  archived: false,
  version: 1,
  ...o,
});

let n = 1000;
export const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

export const task = (o: Record<string, unknown> = {}) => ({
  id: uuid(),
  enrollment_id: "7a1c1d5e-1a7b-4c3e-9c0a-1b2c3d4e5f61",
  type: "feature",
  title: "Add filtering",
  brief: "",
  status: "todo",
  scheduled_for: "2026-11-04T04:30:00Z",
  due_at: "2026-11-04T12:00:00Z",
  version: 1,
  created_at: "2026-11-04T04:30:00Z",
  updated_at: "2026-11-04T04:30:00Z",
  review_mode: "manual",
  persona_id: LEAD_ID,
  from_flow: false,
  content: { resources: [], quiz: null },
  submission: null,
  quiz_result: null,
  shared_note: null,
  ...o,
});

export const message = (o: Record<string, unknown> = {}) => ({
  id: uuid(),
  enrollment_id: "7a1c1d5e-1a7b-4c3e-9c0a-1b2c3d4e5f61",
  persona_id: LEAD_ID,
  author: "persona",
  body: "Hi",
  task_id: null,
  client_id: null,
  sent_at: "2026-11-04T04:30:00Z",
  ...o,
});

export const tokens = () => ({ access_token: "access-1", access_expires_at: "2999-01-01T00:00:00Z" });

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const flowJson = (o: Record<string, unknown> = {}) => ({
  id: "00000000-0000-4000-8000-0000000000f1",
  name: "React Frontend · 30 days",
  stream: "React",
  description: "",
  days: 30,
  archived: false,
  version: 1,
  updated_at: "2026-11-01T00:00:00Z",
  ...o,
});

export const thread = (o: Record<string, unknown> = {}) => ({
  enrollment_id: "7a1c1d5e-1a7b-4c3e-9c0a-1b2c3d4e5f61",
  persona: persona(),
  last_message: null,
  unread: 0,
  ...o,
});
