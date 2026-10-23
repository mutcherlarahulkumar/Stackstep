package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

// EnrollmentStats are the placement numbers for one enrollment.
type EnrollmentStats struct {
	Released, Done, InReview, Overdue int
	Points, Credits                   int
	LastActiveAt                      *time.Time
	CertificateCode                   *string
	CertificateRevoked                bool
}

// OverviewStats loads stats for many enrollments in one round trip. Activity is the
// student's latest chat message, task move or AI question. Credits include the welcome
// grant even before the student first opens their wallet (it is granted lazily).
func OverviewStats(ctx context.Context, q Q, enrollmentIDs []uuid.UUID, now time.Time) (map[uuid.UUID]EnrollmentStats, error) {
	out := make(map[uuid.UUID]EnrollmentStats, len(enrollmentIDs))
	if len(enrollmentIDs) == 0 {
		return out, nil
	}
	rows, err := q.Query(ctx, `
		SELECT e.id, t.released, t.done, t.in_review, t.overdue,
		       COALESCE((SELECT sum(points) FROM points_ledger pl WHERE pl.enrollment_id = e.id), 0)::int,
		       (COALESCE((SELECT sum(delta) FROM credit_ledger cl WHERE cl.enrollment_id = e.id), 0)
		        + CASE WHEN EXISTS (SELECT 1 FROM credit_ledger w WHERE w.enrollment_id = e.id AND w.reason = 'welcome') THEN 0 ELSE $3 END)::int,
		       GREATEST(
		         (SELECT max(m.created_at) FROM chat_messages m WHERE m.enrollment_id = e.id AND m.author = 'student'),
		         (SELECT max(ev.created_at) FROM task_events ev JOIN tasks tk ON tk.id = ev.task_id WHERE tk.enrollment_id = e.id AND ev.actor_id = e.user_id),
		         (SELECT max(a.created_at) FROM ai_messages a WHERE a.enrollment_id = e.id AND a.role = 'student')
		       ),
		       cert.code, cert.revoked_at IS NOT NULL
		FROM enrollments e
		CROSS JOIN LATERAL (
		  SELECT count(*) FILTER (WHERE status <> 'cancelled')::int AS released,
		         count(*) FILTER (WHERE status = 'done')::int AS done,
		         count(*) FILTER (WHERE status = 'in_review')::int AS in_review,
		         count(*) FILTER (WHERE status IN ('todo', 'in_progress', 'changes_requested') AND due_at < $2)::int AS overdue
		  FROM tasks WHERE enrollment_id = e.id AND scheduled_for <= $2
		) t
		LEFT JOIN LATERAL (
		  SELECT code, revoked_at FROM certificates c WHERE c.enrollment_id = e.id
		  ORDER BY (revoked_at IS NULL) DESC, issued_at DESC LIMIT 1
		) cert ON true
		WHERE e.id = ANY($1)`, enrollmentIDs, now, domain.WelcomeCredits)
	if err != nil {
		return nil, fmt.Errorf("overview stats: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		var s EnrollmentStats
		if err := rows.Scan(&id, &s.Released, &s.Done, &s.InReview, &s.Overdue, &s.Points, &s.Credits, &s.LastActiveAt, &s.CertificateCode, &s.CertificateRevoked); err != nil {
			return nil, fmt.Errorf("scan overview stats: %w", err)
		}
		out[id] = s
	}
	return out, rows.Err()
}
