-- Rolling start: an internship begins the day after the student joins, so cohorts no longer
-- carry a start date. Each cohort instead names the flow its students follow.
ALTER TABLE cohorts ALTER COLUMN start_date DROP NOT NULL;
ALTER TABLE cohorts ADD COLUMN flow_id uuid REFERENCES flows (id);
