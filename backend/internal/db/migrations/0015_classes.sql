-- Live classes (feature 23). Only the schedule is stored; what happens in the room (chat,
-- questions, hands, drawing, media) lives in the API's memory and is gone when the class ends.
CREATE TABLE classes (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title            text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
    description      text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
    starts_at        timestamptz NOT NULL,
    duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 15 AND 240),
    audience         text NOT NULL CHECK (audience IN ('all', 'flow', 'cohort')),
    flow_id          uuid REFERENCES flows (id),
    cohort_id        uuid REFERENCES cohorts (id),
    college_id       uuid REFERENCES colleges (id),
    host_id          uuid NOT NULL REFERENCES users (id),
    status           text NOT NULL CHECK (status IN ('scheduled', 'live', 'ended', 'cancelled')),
    started_at       timestamptz,
    ended_at         timestamptz,
    created_at       timestamptz NOT NULL
);
CREATE INDEX classes_starts_idx ON classes (starts_at DESC);
ALTER TABLE mails ADD CONSTRAINT mails_class_fk FOREIGN KEY (class_id) REFERENCES classes (id) ON DELETE SET NULL;
