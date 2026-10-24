-- Feature 08: review queue and hand-in checks.

-- Finding the same link handed in for another task.
CREATE INDEX task_submissions_url_idx ON task_submissions (url) WHERE url IS NOT NULL;
-- The review queue: everything waiting, oldest first.
CREATE INDEX tasks_in_review_idx ON tasks (updated_at) WHERE status = 'in_review';
