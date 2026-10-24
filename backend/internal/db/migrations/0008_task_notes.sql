-- A student's private notes on a task; shared ones are shown to reviewers.
CREATE TABLE task_notes (
    task_id    uuid PRIMARY KEY REFERENCES tasks (id) ON DELETE CASCADE,
    body       text        NOT NULL CHECK (char_length(body) <= 20000),
    shared     boolean     NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL
);
