package store

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

// PortfolioSettings is whether a user's portfolio is public, and its headline.
type PortfolioSettings struct {
	Public   bool
	Headline string
}

// GetPortfolioSettings loads a user's portfolio settings.
func GetPortfolioSettings(ctx context.Context, q Q, userID uuid.UUID) (PortfolioSettings, error) {
	var s PortfolioSettings
	err := q.QueryRow(ctx, `SELECT portfolio_public, portfolio_headline FROM users WHERE id = $1`, userID).Scan(&s.Public, &s.Headline)
	return s, notFound(err)
}

// SetPortfolioSettings saves a user's portfolio settings.
func SetPortfolioSettings(ctx context.Context, q Q, userID uuid.UUID, s PortfolioSettings) error {
	_, err := q.Exec(ctx, `UPDATE users SET portfolio_public = $2, portfolio_headline = $3 WHERE id = $1`, userID, s.Public, s.Headline)
	return err
}

// LatestEnrollmentForUser is the user's open internship, or else their most recent one.
func LatestEnrollmentForUser(ctx context.Context, q Q, userID uuid.UUID) (domain.Enrollment, error) {
	return scanEnrollment(q.QueryRow(ctx, enrollmentSelect+` WHERE e.user_id = $1 AND e.status <> 'cancelled'
		ORDER BY (e.status IN ('active', 'paused')) DESC, e.start_date DESC LIMIT 1`, userID))
}

// PortfolioItem is a finished task shown on a portfolio.
type PortfolioItem struct {
	Title  string
	Type   domain.TaskType
	DoneAt time.Time
	URL    string
}

// PortfolioWork lists an enrollment's finished tasks, newest first, with their hand-in links.
func PortfolioWork(ctx context.Context, q Q, enrollmentID uuid.UUID, limit int) ([]PortfolioItem, error) {
	rows, err := q.Query(ctx, `
		SELECT t.title, t.type, d.at,
		       COALESCE((SELECT s.url FROM task_submissions s WHERE s.task_id = t.id ORDER BY s.attempt DESC LIMIT 1), '')
		FROM tasks t
		JOIN LATERAL (SELECT max(ev.created_at) AS at FROM task_events ev WHERE ev.task_id = t.id AND ev.to_status = 'done') d ON true
		WHERE t.enrollment_id = $1 AND t.status = 'done' AND d.at IS NOT NULL
		ORDER BY d.at DESC LIMIT $2`, enrollmentID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PortfolioItem{}
	for rows.Next() {
		var it PortfolioItem
		var typ string
		if err := rows.Scan(&it.Title, &typ, &it.DoneAt, &it.URL); err != nil {
			return nil, err
		}
		it.Type = domain.TaskType(typ)
		out = append(out, it)
	}
	return out, rows.Err()
}
