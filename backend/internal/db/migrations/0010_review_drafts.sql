-- AI review drafts an admin asked for: an audit trail and the per-day limit. The draft text
-- itself is not kept; the admin's edited note is what reaches the student.
CREATE TABLE review_drafts (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id    uuid        NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    staff_id   uuid        NOT NULL REFERENCES users (id),
    approve    boolean     NOT NULL,
    read_pr    boolean     NOT NULL,
    tokens_in  integer     NOT NULL DEFAULT 0,
    tokens_out integer     NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL
);
CREATE INDEX review_drafts_staff_day ON review_drafts (staff_id, created_at);
