-- Feature 08: consent to the privacy notice and terms, and first-run onboarding.
ALTER TABLE users
    ADD COLUMN consent_version integer NOT NULL DEFAULT 0 CHECK (consent_version >= 0),
    ADD COLUMN consent_at      timestamptz,
    ADD COLUMN onboarded_at    timestamptz;
