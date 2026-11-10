package store

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

// GetAccount loads a user's consent and onboarding state.
func GetAccount(ctx context.Context, q Q, userID uuid.UUID) (domain.Account, error) {
	var a domain.Account
	err := q.QueryRow(ctx, `SELECT consent_version, consent_at, onboarded_at FROM users WHERE id = $1`, userID).Scan(&a.ConsentVersion, &a.ConsentAt, &a.OnboardedAt)
	return a, notFound(err)
}

// SetConsent records acceptance of a terms version.
func SetConsent(ctx context.Context, q Q, userID uuid.UUID, version int, now time.Time) error {
	_, err := q.Exec(ctx, `UPDATE users SET consent_version = $2, consent_at = $3 WHERE id = $1`, userID, version, now)
	return err
}

// SetOnboarded marks the first-run guide as seen (idempotent; keeps the first time).
func SetOnboarded(ctx context.Context, q Q, userID uuid.UUID, now time.Time) error {
	_, err := q.Exec(ctx, `UPDATE users SET onboarded_at = COALESCE(onboarded_at, $2) WHERE id = $1`, userID, now)
	return err
}
