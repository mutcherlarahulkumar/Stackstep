-- Feature 02: personas, task library, flows, per-persona chat threads, review modes.

CREATE TABLE personas (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
    title       text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 60),
    color       text NOT NULL CHECK (color IN ('violet', 'blue', 'emerald', 'amber', 'rose', 'cyan', 'slate')),
    auto_reply  boolean NOT NULL DEFAULT false,
    version     integer NOT NULL DEFAULT 1 CHECK (version > 0),
    archived_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX personas_name_key ON personas (lower(name));

-- The default persona existing chats move to. Fixed id so code and seeds can refer to it.
INSERT INTO personas (id, name, title, color, auto_reply)
VALUES ('00000000-0000-4000-8000-000000000001', 'Sam Rivera', 'Team Lead', 'violet', true);

ALTER TABLE tasks DROP CONSTRAINT tasks_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_type_check
    CHECK (type IN ('feature', 'bug_fix', 'dsa', 'doc_reading', 'quiz', 'git_chore', 'code_review', 'standup', 'blog'));

CREATE TABLE task_templates (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type         text NOT NULL CHECK (type IN ('feature', 'bug_fix', 'dsa', 'doc_reading', 'quiz', 'git_chore', 'code_review', 'standup', 'blog')),
    title        text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
    brief        text NOT NULL DEFAULT '' CHECK (char_length(brief) <= 8000),
    persona_id   uuid NOT NULL REFERENCES personas (id),
    review_mode  text NOT NULL CHECK (review_mode IN ('manual', 'self')),
    release_time time NOT NULL,
    due_minutes  integer NOT NULL CHECK (due_minutes BETWEEN 15 AND 10080),
    version      integer NOT NULL DEFAULT 1 CHECK (version > 0),
    archived_at  timestamptz,
    created_by   uuid NOT NULL REFERENCES users (id),
    created_at   timestamptz NOT NULL,
    updated_at   timestamptz NOT NULL
);
CREATE INDEX task_templates_title_idx ON task_templates (lower(title));

CREATE TABLE flows (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 80),
    stream      text NOT NULL CHECK (char_length(stream) BETWEEN 2 AND 40),
    description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
    days        integer NOT NULL CHECK (days IN (30, 60)),
    version     integer NOT NULL DEFAULT 1 CHECK (version > 0),
    archived_at timestamptz,
    created_by  uuid NOT NULL REFERENCES users (id),
    created_at  timestamptz NOT NULL,
    updated_at  timestamptz NOT NULL
);
CREATE UNIQUE INDEX flows_name_key ON flows (lower(name));

CREATE TABLE flow_versions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id      uuid NOT NULL REFERENCES flows (id),
    number       integer NOT NULL CHECK (number > 0),
    status       text NOT NULL CHECK (status IN ('draft', 'published', 'retired')),
    -- Bumped on every draft save; clients send it back as expected_revision.
    revision     integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    published_at timestamptz,
    created_at   timestamptz NOT NULL,
    CONSTRAINT flow_versions_number_key UNIQUE (flow_id, number),
    CONSTRAINT published_has_time CHECK (status = 'draft' OR published_at IS NOT NULL)
);
CREATE UNIQUE INDEX flow_versions_one_draft ON flow_versions (flow_id) WHERE status = 'draft';
CREATE UNIQUE INDEX flow_versions_one_published ON flow_versions (flow_id) WHERE status = 'published';

CREATE TABLE flow_items (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id   uuid NOT NULL REFERENCES flow_versions (id) ON DELETE CASCADE,
    day          integer NOT NULL CHECK (day BETWEEN 1 AND 60),
    position     integer NOT NULL CHECK (position >= 0),
    template_id  uuid REFERENCES task_templates (id),
    type         text NOT NULL CHECK (type IN ('feature', 'bug_fix', 'dsa', 'doc_reading', 'quiz', 'git_chore', 'code_review', 'standup', 'blog')),
    title        text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
    brief        text NOT NULL DEFAULT '' CHECK (char_length(brief) <= 8000),
    persona_id   uuid NOT NULL REFERENCES personas (id),
    review_mode  text NOT NULL CHECK (review_mode IN ('manual', 'self')),
    release_time time NOT NULL,
    due_minutes  integer NOT NULL CHECK (due_minutes BETWEEN 15 AND 10080),
    CONSTRAINT flow_items_slot_key UNIQUE (version_id, day, position)
);

ALTER TABLE enrollments ADD COLUMN flow_version_id uuid REFERENCES flow_versions (id);

ALTER TABLE tasks
    ADD COLUMN review_mode text NOT NULL DEFAULT 'manual' CHECK (review_mode IN ('manual', 'self')),
    ADD COLUMN persona_id uuid REFERENCES personas (id),
    ADD COLUMN flow_item_id uuid REFERENCES flow_items (id);
UPDATE tasks SET persona_id = '00000000-0000-4000-8000-000000000001';
ALTER TABLE tasks ALTER COLUMN persona_id SET NOT NULL;
CREATE INDEX tasks_flow_item_idx ON tasks (flow_item_id) WHERE flow_item_id IS NOT NULL;

-- Messages belong to a (enrollment, persona) conversation; 'lead' becomes 'persona'.
ALTER TABLE chat_messages DROP CONSTRAINT chat_messages_author_check;
UPDATE chat_messages SET author = 'persona' WHERE author = 'lead';
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_author_check CHECK (author IN ('student', 'persona'));
ALTER TABLE chat_messages
    ADD COLUMN persona_id uuid REFERENCES personas (id),
    ADD COLUMN sent_by uuid REFERENCES users (id);
UPDATE chat_messages SET persona_id = '00000000-0000-4000-8000-000000000001';
ALTER TABLE chat_messages ALTER COLUMN persona_id SET NOT NULL;
DROP INDEX chat_messages_thread_idx;
CREATE INDEX chat_messages_thread_idx ON chat_messages (enrollment_id, persona_id, deliver_at DESC, id DESC);

CREATE TABLE chat_threads (
    enrollment_id   uuid NOT NULL REFERENCES enrollments (id),
    persona_id      uuid NOT NULL REFERENCES personas (id),
    student_read_at timestamptz NOT NULL DEFAULT '-infinity',
    staff_read_at   timestamptz NOT NULL DEFAULT '-infinity',
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (enrollment_id, persona_id)
);
INSERT INTO chat_threads (enrollment_id, persona_id)
SELECT DISTINCT enrollment_id, persona_id FROM chat_messages;
