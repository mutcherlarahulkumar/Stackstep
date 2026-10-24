-- Review rubric results, recorded on the hand-in they judge.
ALTER TABLE task_submissions
    ADD COLUMN rubric      boolean[],
    ADD COLUMN reviewed_at timestamptz,
    ADD COLUMN reviewed_by uuid REFERENCES users (id);
