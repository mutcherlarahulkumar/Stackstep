-- Feature 05: completion certificates with public verification.

CREATE TABLE certificates (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Public, unguessable (60 bits), shown on the certificate and used to verify it.
    code          text NOT NULL UNIQUE CHECK (code ~ '^[2-9A-HJKMNP-Z]{12}$'),
    enrollment_id uuid NOT NULL REFERENCES enrollments (id),
    -- A snapshot: later edits to the student or program never change an issued certificate.
    student_name  text NOT NULL CHECK (char_length(student_name) BETWEEN 1 AND 200),
    github_login  text NOT NULL,
    program_slug  text NOT NULL,
    program_days  integer NOT NULL CHECK (program_days IN (30, 60)),
    flow_name     text,
    start_date    date NOT NULL,
    end_date      date NOT NULL,
    points        integer NOT NULL CHECK (points >= 0),
    tasks_done    integer NOT NULL CHECK (tasks_done >= 0),
    tasks_total   integer NOT NULL CHECK (tasks_total >= 0),
    issued_by     uuid NOT NULL REFERENCES users (id),
    issued_at     timestamptz NOT NULL,
    revoked_at    timestamptz,
    revoked_by    uuid REFERENCES users (id),
    revoke_reason text CHECK (revoke_reason IS NULL OR char_length(revoke_reason) BETWEEN 1 AND 300),
    CONSTRAINT revoked_has_reason CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL))
);
-- One valid certificate per internship; a revoked one can be replaced.
CREATE UNIQUE INDEX certificates_one_valid ON certificates (enrollment_id) WHERE revoked_at IS NULL;
