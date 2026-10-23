package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

const userCols = "u.id, u.github_id, u.github_login, u.name, u.email, u.avatar_url, u.role, u.college_id"

func scanUser(row pgx.Row) (domain.User, error) {
	var u domain.User
	var role string
	if err := row.Scan(&u.ID, &u.GitHubID, &u.GitHubLogin, &u.Name, &u.Email, &u.AvatarURL, &role, &u.CollegeID); err != nil {
		return domain.User{}, notFound(err)
	}
	u.Role = domain.Role(role)
	if !u.Role.Valid() {
		return domain.User{}, fmt.Errorf("user %s has unknown role %q", u.ID, role)
	}
	return u, nil
}

// GetUser loads a user by id.
func GetUser(ctx context.Context, q Q, id uuid.UUID) (domain.User, error) {
	return scanUser(q.QueryRow(ctx, "SELECT "+userCols+" FROM users u WHERE u.id = $1", id))
}

// GetUserByLogin loads a user by GitHub login, case-insensitively.
func GetUserByLogin(ctx context.Context, q Q, login string) (domain.User, error) {
	return scanUser(q.QueryRow(ctx, "SELECT "+userCols+" FROM users u WHERE lower(u.github_login) = lower($1)", login))
}

// GitHubUpsert is the data written on each GitHub sign-in.
type GitHubUpsert struct {
	GitHubID       int64
	Login          string
	Name           string
	Email          *string
	AvatarURL      *string
	PromoteToAdmin bool
}

// UpsertGitHubUser creates or refreshes the user for a GitHub account.
// Existing roles are kept, except bootstrap admins who are promoted.
func UpsertGitHubUser(ctx context.Context, q Q, in GitHubUpsert, now time.Time) (domain.User, error) {
	role := domain.RoleStudent
	if in.PromoteToAdmin {
		role = domain.RoleAdmin
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = in.Login
	}
	if len([]rune(name)) > 200 {
		name = string([]rune(name)[:200])
	}
	// A login taken by a different GitHub account means that account was renamed on GitHub:
	// park the stale login so the unique index doesn't block the new owner.
	if _, err := q.Exec(ctx, `UPDATE users SET github_login = left(github_login, 30) || '~' || left(id::text, 8)
		WHERE lower(github_login) = lower($2) AND github_id IS NOT NULL AND github_id <> $1`, in.GitHubID, in.Login); err != nil {
		return domain.User{}, err
	}
	// Users pre-created by an admin (no GitHub id yet) are linked on first sign-in.
	if _, err := q.Exec(ctx, `UPDATE users SET github_id = $1 WHERE lower(github_login) = lower($2) AND github_id IS NULL`,
		in.GitHubID, in.Login); err != nil {
		return domain.User{}, err
	}
	row := q.QueryRow(ctx, `
		INSERT INTO users AS u (github_id, github_login, name, email, avatar_url, role, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
		ON CONFLICT (github_id) DO UPDATE SET
			github_login = EXCLUDED.github_login,
			name = EXCLUDED.name,
			email = COALESCE(EXCLUDED.email, u.email),
			avatar_url = EXCLUDED.avatar_url,
			role = CASE WHEN $8 THEN 'admin' ELSE u.role END,
			updated_at = EXCLUDED.updated_at
		RETURNING `+userCols,
		in.GitHubID, in.Login, name, in.Email, in.AvatarURL, string(role), now, in.PromoteToAdmin)
	return scanUser(row)
}
