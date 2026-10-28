-- Feature 15: students apply for a cohort and pay by UPI; an admin checks the proof and enrolls them.

-- A cohort takes applications when it has a fee and applications are open.
ALTER TABLE cohorts
    ADD COLUMN fee_inr           integer CHECK (fee_inr BETWEEN 1 AND 10000000),
    ADD COLUMN applications_open boolean NOT NULL DEFAULT false;

-- Where applicants pay: one row, edited by platform admins.
CREATE TABLE payment_settings (
    id         boolean PRIMARY KEY DEFAULT true CHECK (id),
    upi_id     text        NOT NULL DEFAULT '' CHECK (char_length(upi_id) <= 100),
    payee_name text        NOT NULL DEFAULT '' CHECK (char_length(payee_name) <= 100),
    note       text        NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
    qr_image   bytea,
    qr_type    text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES users (id)
);
INSERT INTO payment_settings DEFAULT VALUES;

CREATE TABLE applications (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid        NOT NULL REFERENCES users (id),
    cohort_id     uuid        NOT NULL REFERENCES cohorts (id),
    status        text        NOT NULL CHECK (status IN ('draft', 'submitted', 'flagged', 'approved', 'rejected')),
    full_name     text        NOT NULL,
    phone         text        NOT NULL,
    date_of_birth date        NOT NULL,
    college       text        NOT NULL,
    course        text        NOT NULL,
    branch        text        NOT NULL,
    grad_year     integer     NOT NULL,
    fee_inr       integer     NOT NULL,          -- the cohort's fee when chosen
    paid_inr      integer     NOT NULL DEFAULT 0, -- confirmed by an admin
    flag          text,
    flag_note     text        NOT NULL DEFAULT '',
    decided_by    uuid REFERENCES users (id),
    decided_at    timestamptz,
    enrollment_id uuid REFERENCES enrollments (id),
    version       integer     NOT NULL DEFAULT 1,
    created_at    timestamptz NOT NULL,
    updated_at    timestamptz NOT NULL,
    unread_staff  boolean     NOT NULL DEFAULT false,
    unread_student boolean    NOT NULL DEFAULT false,
    CONSTRAINT flagged_has_flag CHECK ((status = 'flagged') = (flag IS NOT NULL))
);
-- One application in progress per student.
CREATE UNIQUE INDEX applications_one_open ON applications (user_id) WHERE status IN ('draft', 'submitted', 'flagged');
CREATE INDEX applications_queue ON applications (status, updated_at);

CREATE TABLE payment_proofs (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id uuid        NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
    seq            bigint GENERATED ALWAYS AS IDENTITY, -- upload order when timestamps tie
    image          bytea       NOT NULL,
    image_type     text        NOT NULL,
    sha256         text        NOT NULL,
    utr            text        NOT NULL,
    amount_inr     integer     NOT NULL,
    uploaded_at    timestamptz NOT NULL
);
CREATE INDEX payment_proofs_app ON payment_proofs (application_id, uploaded_at);
CREATE INDEX payment_proofs_sha ON payment_proofs (sha256);
CREATE INDEX payment_proofs_utr ON payment_proofs (utr);

CREATE TABLE application_messages (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id uuid        NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
    seq            bigint GENERATED ALWAYS AS IDENTITY, -- send order when timestamps tie
    author         text        NOT NULL CHECK (author IN ('applicant', 'staff', 'system')),
    sent_by        uuid REFERENCES users (id),
    body           text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
    client_id      uuid UNIQUE,
    created_at     timestamptz NOT NULL
);
CREATE INDEX application_messages_app ON application_messages (application_id, created_at);
