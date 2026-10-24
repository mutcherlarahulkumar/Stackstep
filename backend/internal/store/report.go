package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// WeekStats is what one enrollment did in a week, plus where it belongs.
type WeekStats struct {
	Cohort   *string // cohort name; nil for independent students
	College  *string
	Done     int // tasks finished (points awarded) in the week
	OnTime   int
	Points   int
	HandIns  int // submissions sent in the week
	Messages int // student chat messages in the week
	Issued   bool
}

// WeeklyStats loads week numbers for many enrollments; from is inclusive, to exclusive.
func WeeklyStats(ctx context.Context, q Q, enrollmentIDs []uuid.UUID, from, to time.Time) (map[uuid.UUID]WeekStats, error) {
	out := make(map[uuid.UUID]WeekStats, len(enrollmentIDs))
	if len(enrollmentIDs) == 0 {
		return out, nil
	}
	rows, err := q.Query(ctx, `
		SELECT e.id, c.name, col.name,
		       (SELECT count(*) FROM points_ledger p WHERE p.enrollment_id = e.id AND p.created_at >= $2 AND p.created_at < $3)::int,
		       (SELECT count(*) FROM points_ledger p WHERE p.enrollment_id = e.id AND p.on_time AND p.created_at >= $2 AND p.created_at < $3)::int,
		       COALESCE((SELECT sum(points) FROM points_ledger p WHERE p.enrollment_id = e.id AND p.created_at >= $2 AND p.created_at < $3), 0)::int,
		       (SELECT count(*) FROM task_submissions s JOIN tasks t ON t.id = s.task_id WHERE t.enrollment_id = e.id AND s.created_at >= $2 AND s.created_at < $3)::int,
		       (SELECT count(*) FROM chat_messages m WHERE m.enrollment_id = e.id AND m.author = 'student' AND m.created_at >= $2 AND m.created_at < $3)::int,
		       EXISTS (SELECT 1 FROM certificates ce WHERE ce.enrollment_id = e.id AND ce.issued_at >= $2 AND ce.issued_at < $3 AND ce.revoked_at IS NULL)
		FROM enrollments e
		LEFT JOIN cohorts c ON c.id = e.cohort_id
		LEFT JOIN colleges col ON col.id = c.college_id
		WHERE e.id = ANY($1)`, enrollmentIDs, from, to)
	if err != nil {
		return nil, fmt.Errorf("weekly stats: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		var s WeekStats
		if err := rows.Scan(&id, &s.Cohort, &s.College, &s.Done, &s.OnTime, &s.Points, &s.HandIns, &s.Messages, &s.Issued); err != nil {
			return nil, fmt.Errorf("scan weekly stats: %w", err)
		}
		out[id] = s
	}
	return out, rows.Err()
}
