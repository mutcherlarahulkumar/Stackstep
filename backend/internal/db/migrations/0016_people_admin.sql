-- People admin (feature 25): last seen, sign out everywhere, daily attendance and staff notes.
ALTER TABLE users ADD COLUMN last_seen_at timestamptz;
-- Access tokens issued before this moment are refused; set by "sign out everywhere".
ALTER TABLE users ADD COLUMN signed_out_at timestamptz;

-- One row per student per day they opened Stackstep. The seat is the order they arrived in
-- that day, across everyone (1 is the first one in).
CREATE TABLE attendance (
    user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    day           date NOT NULL,
    seat          integer NOT NULL CHECK (seat >= 1),
    first_seen_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, day)
);
CREATE INDEX attendance_day_idx ON attendance (day);

-- Private notes staff keep about a person, kept like a to-do list.
CREATE TABLE staff_notes (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    author_id  uuid NOT NULL REFERENCES users (id),
    body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    done_at    timestamptz,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);
CREATE INDEX staff_notes_subject_idx ON staff_notes (subject_id, created_at DESC);
