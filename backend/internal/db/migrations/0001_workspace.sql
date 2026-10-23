-- Feature 01: workspace core (users, programs, cohorts, enrollments, tasks, chat, auth).

CREATE TABLE colleges (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 2 AND 200),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    github_id    bigint UNIQUE,
    github_login text NOT NULL CHECK (char_length(github_login) BETWEEN 1 AND 39),
    name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
    email        text CHECK (email IS NULL OR char_length(email) <= 320),
    avatar_url   text CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 2048),
    role         text NOT NULL CHECK (role IN ('student', 'college_admin', 'admin')),
    college_id   uuid REFERENCES colleges (id),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT college_admin_has_college CHECK (role <> 'college_admin' OR college_id IS NOT NULL)
);
CREATE UNIQUE INDEX users_github_login_key ON users (lower(github_login));

CREATE TABLE programs (
    id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug    text NOT NULL UNIQUE,
    days    integer NOT NULL CHECK (days IN (30, 60)),
    track   text NOT NULL CHECK (track IN ('frontend', 'fullstack')),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE TABLE cohorts (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind        text NOT NULL CHECK (kind IN ('group', 'college')),
    name        text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 200),
    college_id  uuid REFERENCES colleges (id),
    program_id  uuid NOT NULL REFERENCES programs (id),
    start_date  date NOT NULL,
    seats_total integer NOT NULL CHECK (seats_total BETWEEN 1 AND 100000),
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT college_cohort_has_college CHECK (kind <> 'college' OR college_id IS NOT NULL)
);

CREATE TABLE enrollments (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users (id),
    program_id uuid NOT NULL REFERENCES programs (id),
    cohort_id  uuid REFERENCES cohorts (id),
    start_date date NOT NULL,
    end_date   date NOT NULL,
    timezone   text NOT NULL DEFAULT 'Asia/Kolkata',
    status     text NOT NULL CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT enrollment_dates CHECK (end_date >= start_date)
);
-- One open internship per user.
CREATE UNIQUE INDEX enrollments_one_open_per_user ON enrollments (user_id) WHERE status IN ('active', 'paused');
CREATE INDEX enrollments_cohort_idx ON enrollments (cohort_id);

CREATE TABLE tasks (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id uuid NOT NULL REFERENCES enrollments (id),
    type          text NOT NULL CHECK (type IN ('feature', 'bug_fix', 'dsa', 'doc_reading', 'quiz', 'git_chore', 'code_review', 'standup')),
    title         text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
    brief         text NOT NULL DEFAULT '' CHECK (char_length(brief) <= 8000),
    status        text NOT NULL CHECK (status IN ('todo', 'in_progress', 'in_review', 'changes_requested', 'done', 'cancelled')),
    scheduled_for timestamptz NOT NULL,
    due_at        timestamptz NOT NULL,
    created_by    uuid NOT NULL REFERENCES users (id),
    version       integer NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at    timestamptz NOT NULL,
    updated_at    timestamptz NOT NULL,
    CONSTRAINT task_due_after_schedule CHECK (due_at > scheduled_for)
);
CREATE INDEX tasks_enrollment_schedule_idx ON tasks (enrollment_id, scheduled_for);

CREATE TABLE task_events (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_id     uuid NOT NULL REFERENCES tasks (id),
    actor_id    uuid NOT NULL REFERENCES users (id),
    from_status text,
    to_status   text NOT NULL,
    note        text CHECK (note IS NULL OR char_length(note) <= 2000),
    created_at  timestamptz NOT NULL
);
CREATE INDEX task_events_task_idx ON task_events (task_id, id);

CREATE TABLE chat_messages (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id uuid NOT NULL REFERENCES enrollments (id),
    author        text NOT NULL CHECK (author IN ('student', 'lead')),
    body          text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
    task_id       uuid REFERENCES tasks (id),
    client_id     uuid,
    created_at    timestamptz NOT NULL,
    deliver_at    timestamptz NOT NULL,
    delivered_at  timestamptz,
    CONSTRAINT chat_messages_client_id_key UNIQUE (enrollment_id, client_id)
);
CREATE INDEX chat_messages_thread_idx ON chat_messages (enrollment_id, deliver_at DESC, id DESC);
CREATE INDEX chat_messages_pending_idx ON chat_messages (deliver_at) WHERE delivered_at IS NULL;

CREATE TABLE refresh_tokens (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id   uuid NOT NULL,
    user_id     uuid NOT NULL REFERENCES users (id),
    token_hash  bytea NOT NULL UNIQUE,
    expires_at  timestamptz NOT NULL,
    revoked_at  timestamptz,
    created_at  timestamptz NOT NULL
);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

CREATE TABLE login_codes (
    code_hash      bytea PRIMARY KEY,
    user_id        uuid NOT NULL REFERENCES users (id),
    code_challenge text NOT NULL,
    expires_at     timestamptz NOT NULL,
    used_at        timestamptz
);

INSERT INTO programs (slug, days, track) VALUES
    ('frontend-30', 30, 'frontend'),
    ('fullstack-60', 60, 'fullstack');
