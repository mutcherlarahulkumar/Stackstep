-- Team room, review lab, badges and public portfolios (features 27 to 30).

-- The team room is one more conversation per student, held by a reserved persona. Every
-- persona speaks in it; speaker_id says who (NULL is the AI teammate, Stackbot).
INSERT INTO personas (id, name, title, color, auto_reply)
VALUES ('00000000-0000-4000-8000-0000000000f0', 'Team room', 'Your whole team', 'slate', true)
ON CONFLICT (id) DO NOTHING;
ALTER TABLE chat_messages ADD COLUMN speaker_id uuid REFERENCES personas (id);
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_speaker_team
    CHECK (speaker_id IS NULL OR (persona_id = '00000000-0000-4000-8000-0000000000f0' AND author = 'persona'));

-- One graded review of a practice pull request. task_id is set when it was a task.
CREATE TABLE review_lab_attempts (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    exercise   text NOT NULL CHECK (char_length(exercise) BETWEEN 1 AND 80),
    task_id    uuid REFERENCES tasks (id),
    verdict    text NOT NULL CHECK (verdict IN ('comment', 'approve', 'request_changes')),
    summary    text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 4000),
    comments   jsonb NOT NULL,
    found      integer NOT NULL CHECK (found >= 0),
    total      integer NOT NULL CHECK (total > 0 AND found <= total),
    score      integer NOT NULL CHECK (score BETWEEN 0 AND 100),
    passed     boolean NOT NULL,
    created_at timestamptz NOT NULL
);
CREATE INDEX review_lab_attempts_user_idx ON review_lab_attempts (user_id, exercise, created_at DESC);
CREATE INDEX review_lab_attempts_task_idx ON review_lab_attempts (task_id) WHERE task_id IS NOT NULL;

-- Badges a student has earned, kept so the date never moves and each is celebrated once.
CREATE TABLE badges (
    enrollment_id uuid NOT NULL REFERENCES enrollments (id),
    badge         text NOT NULL CHECK (char_length(badge) BETWEEN 1 AND 40),
    earned_at     timestamptz NOT NULL,
    PRIMARY KEY (enrollment_id, badge)
);

-- A student's public portfolio is off until they turn it on.
ALTER TABLE users
    ADD COLUMN portfolio_public boolean NOT NULL DEFAULT false,
    ADD COLUMN portfolio_headline text NOT NULL DEFAULT '' CHECK (char_length(portfolio_headline) <= 120);
