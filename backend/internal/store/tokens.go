package store

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// RefreshToken is a stored refresh token row.
type RefreshToken struct {
	ID        uuid.UUID
	FamilyID  uuid.UUID
	UserID    uuid.UUID
	ExpiresAt time.Time
	RevokedAt *time.Time
}

// InsertRefreshToken stores the hash of a new refresh token.
func InsertRefreshToken(ctx context.Context, q Q, family, user uuid.UUID, hash []byte, expires, now time.Time) error {
	_, err := q.Exec(ctx, `INSERT INTO refresh_tokens (family_id, user_id, token_hash, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5)`, family, user, hash, expires, now)
	return err
}

// GetRefreshTokenForUpdate loads and locks a refresh token by hash.
func GetRefreshTokenForUpdate(ctx context.Context, q Q, hash []byte) (RefreshToken, error) {
	var t RefreshToken
	err := q.QueryRow(ctx, `SELECT id, family_id, user_id, expires_at, revoked_at FROM refresh_tokens
		WHERE token_hash = $1 FOR UPDATE`, hash).Scan(&t.ID, &t.FamilyID, &t.UserID, &t.ExpiresAt, &t.RevokedAt)
	return t, notFound(err)
}

// RevokeRefreshToken revokes one token.
func RevokeRefreshToken(ctx context.Context, q Q, id uuid.UUID, now time.Time) error {
	_, err := q.Exec(ctx, "UPDATE refresh_tokens SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL", id, now)
	return err
}

// RevokeRefreshFamily revokes every token in a family (used on reuse detection and logout).
func RevokeRefreshFamily(ctx context.Context, q Q, family uuid.UUID, now time.Time) error {
	_, err := q.Exec(ctx, "UPDATE refresh_tokens SET revoked_at = $2 WHERE family_id = $1 AND revoked_at IS NULL", family, now)
	return err
}

// InsertLoginCode stores a one-time mobile login code bound to a PKCE challenge.
func InsertLoginCode(ctx context.Context, q Q, hash []byte, user uuid.UUID, challenge string, expires time.Time) error {
	_, err := q.Exec(ctx, `INSERT INTO login_codes (code_hash, user_id, code_challenge, expires_at) VALUES ($1, $2, $3, $4)`,
		hash, user, challenge, expires)
	return err
}

// ConsumeLoginCode marks a code used and returns its user and challenge. Expired or used codes are not found.
func ConsumeLoginCode(ctx context.Context, q Q, hash []byte, now time.Time) (uuid.UUID, string, error) {
	var user uuid.UUID
	var challenge string
	err := q.QueryRow(ctx, `UPDATE login_codes SET used_at = $2
		WHERE code_hash = $1 AND used_at IS NULL AND expires_at > $2
		RETURNING user_id, code_challenge`, hash, now).Scan(&user, &challenge)
	return user, challenge, notFound(err)
}
