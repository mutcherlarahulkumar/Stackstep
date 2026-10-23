-- Feature 04: points for finished tasks, AI credits, and the AI helper's conversations.

-- One row per finished task; points never change once awarded.
CREATE TABLE points_ledger (
    task_id       uuid PRIMARY KEY REFERENCES tasks (id),
    enrollment_id uuid NOT NULL REFERENCES enrollments (id),
    points        integer NOT NULL CHECK (points BETWEEN 0 AND 1000),
    on_time       boolean NOT NULL,
    created_at    timestamptz NOT NULL
);
CREATE INDEX points_ledger_enrollment_idx ON points_ledger (enrollment_id);

CREATE TABLE ai_conversations (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id uuid NOT NULL REFERENCES enrollments (id),
    task_id       uuid REFERENCES tasks (id),
    title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
    created_at    timestamptz NOT NULL,
    updated_at    timestamptz NOT NULL
);
CREATE INDEX ai_conversations_enrollment_idx ON ai_conversations (enrollment_id, updated_at DESC, id DESC);

CREATE TABLE ai_messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Insertion order: turns written in the same instant still read back in order.
    seq             bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    conversation_id uuid NOT NULL REFERENCES ai_conversations (id),
    enrollment_id   uuid NOT NULL REFERENCES enrollments (id),
    role            text NOT NULL CHECK (role IN ('student', 'assistant')),
    -- Student messages: pending while the model answers, then answered or failed (refunded).
    status          text NOT NULL CHECK (status IN ('pending', 'answered', 'failed', 'ok')),
    kind            text NOT NULL CHECK (kind IN ('question', 'follow_up', 'answer')),
    body            text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 12000),
    -- The structured parts of a first question, kept for display.
    parts           jsonb,
    client_id       uuid,
    tokens_in       integer NOT NULL DEFAULT 0,
    tokens_out      integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL,
    CONSTRAINT ai_messages_client_id_key UNIQUE (enrollment_id, client_id)
);
CREATE INDEX ai_messages_conversation_idx ON ai_messages (conversation_id, seq);
CREATE INDEX ai_messages_enrollment_day_idx ON ai_messages (enrollment_id, created_at) WHERE role = 'student';

CREATE TABLE credit_ledger (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    enrollment_id uuid NOT NULL REFERENCES enrollments (id),
    delta         integer NOT NULL CHECK (delta <> 0 AND delta BETWEEN -1000 AND 1000),
    reason        text NOT NULL CHECK (reason IN ('welcome', 'task_done', 'admin_grant', 'admin_revoke', 'ai_question', 'ai_refund')),
    task_id       uuid REFERENCES tasks (id),
    ai_message_id uuid REFERENCES ai_messages (id) ON DELETE SET NULL,
    note          text NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
    created_by    uuid REFERENCES users (id),
    created_at    timestamptz NOT NULL
);
CREATE INDEX credit_ledger_enrollment_idx ON credit_ledger (enrollment_id, id DESC);
CREATE UNIQUE INDEX credit_ledger_one_welcome ON credit_ledger (enrollment_id) WHERE reason = 'welcome';
CREATE UNIQUE INDEX credit_ledger_one_per_task ON credit_ledger (task_id) WHERE reason = 'task_done';
CREATE UNIQUE INDEX credit_ledger_one_spend ON credit_ledger (ai_message_id) WHERE reason = 'ai_question';
CREATE UNIQUE INDEX credit_ledger_one_refund ON credit_ledger (ai_message_id) WHERE reason = 'ai_refund';
