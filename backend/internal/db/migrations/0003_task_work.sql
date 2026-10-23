-- Feature 03: task content (links, quizzes), surprise release windows, submissions, quiz attempts.

ALTER TABLE task_templates
    ADD COLUMN content jsonb NOT NULL DEFAULT '{"resources": [], "quiz": null}',
    ADD COLUMN release_window integer NOT NULL DEFAULT 0 CHECK (release_window BETWEEN 0 AND 480);

ALTER TABLE flow_items
    ADD COLUMN content jsonb NOT NULL DEFAULT '{"resources": [], "quiz": null}',
    ADD COLUMN release_window integer NOT NULL DEFAULT 0 CHECK (release_window BETWEEN 0 AND 480);

ALTER TABLE tasks
    ADD COLUMN content jsonb NOT NULL DEFAULT '{"resources": [], "quiz": null}';

-- Every hand-in, in order. The latest one is what the reviewer sees.
CREATE TABLE task_submissions (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_id      uuid NOT NULL REFERENCES tasks (id),
    attempt      integer NOT NULL CHECK (attempt > 0),
    url          text CHECK (url IS NULL OR char_length(url) <= 2048),
    note         text NOT NULL DEFAULT '' CHECK (char_length(note) <= 4000),
    submitted_by uuid NOT NULL REFERENCES users (id),
    created_at   timestamptz NOT NULL,
    CONSTRAINT task_submissions_attempt_key UNIQUE (task_id, attempt),
    CONSTRAINT submission_not_empty CHECK (url IS NOT NULL OR note <> '')
);

CREATE TABLE quiz_attempts (
    task_id    uuid NOT NULL REFERENCES tasks (id),
    attempt    integer NOT NULL CHECK (attempt BETWEEN 1 AND 3),
    answers    integer[] NOT NULL,
    score      integer NOT NULL CHECK (score BETWEEN 0 AND 100),
    passed     boolean NOT NULL,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (task_id, attempt)
);
