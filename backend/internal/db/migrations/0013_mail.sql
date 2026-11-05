-- In-house mail (feature 21): announcements and system letters land in each user's mailbox
-- instead of notifications. One mail row, one recipient row per reader.
CREATE TABLE announcements (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subject    text NOT NULL CHECK (char_length(subject) BETWEEN 3 AND 120),
    body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 20000),
    audience   text NOT NULL CHECK (audience IN ('all', 'flow', 'cohort', 'class')),
    flow_id    uuid REFERENCES flows (id),
    cohort_id  uuid REFERENCES cohorts (id),
    -- A college admin's announcements only ever reach their own college.
    college_id uuid REFERENCES colleges (id),
    sent_by    uuid NOT NULL REFERENCES users (id),
    recipients integer NOT NULL CHECK (recipients >= 0),
    created_at timestamptz NOT NULL
);
CREATE INDEX announcements_created_idx ON announcements (created_at DESC, id DESC);

CREATE TABLE mails (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind            text NOT NULL CHECK (kind IN ('announcement', 'welcome', 'review', 'certificate', 'class')),
    subject         text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 160),
    body            text NOT NULL CHECK (char_length(body) <= 20000),
    from_name       text NOT NULL CHECK (char_length(from_name) BETWEEN 1 AND 200),
    persona_id      uuid REFERENCES personas (id),
    announcement_id uuid REFERENCES announcements (id) ON DELETE CASCADE,
    task_id         uuid REFERENCES tasks (id) ON DELETE SET NULL,
    class_id        uuid,
    created_at      timestamptz NOT NULL
);

CREATE TABLE mail_recipients (
    -- Mailbox order: letters sent in the same instant still sort the way they were sent.
    seq        bigint GENERATED ALWAYS AS IDENTITY,
    mail_id    uuid NOT NULL REFERENCES mails (id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES users (id),
    created_at timestamptz NOT NULL,
    read_at    timestamptz,
    PRIMARY KEY (mail_id, user_id)
);
CREATE INDEX mail_recipients_inbox_idx ON mail_recipients (user_id, seq DESC);
CREATE INDEX mail_recipients_unread_idx ON mail_recipients (user_id) WHERE read_at IS NULL;
