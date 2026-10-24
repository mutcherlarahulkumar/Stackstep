package store

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

// AddHandInChecks attaches reviewer warnings to tasks that have a submission. Staff only.
func AddHandInChecks(ctx context.Context, q Q, tasks []domain.Task) error {
	ids := make([]uuid.UUID, 0, len(tasks))
	idx := map[uuid.UUID]int{}
	for i, t := range tasks {
		if t.Submission != nil && t.Submission.URL != "" {
			ids = append(ids, t.ID)
			idx[t.ID] = i
		}
	}
	if len(ids) == 0 {
		return nil
	}
	rows, err := q.Query(ctx, `
		WITH latest AS (
		  SELECT DISTINCT ON (task_id) task_id, url FROM task_submissions WHERE task_id = ANY($1) ORDER BY task_id, attempt DESC
		)
		SELECT l.task_id, u.github_login,
		       (SELECT count(DISTINCT s2.task_id) FROM task_submissions s2 WHERE s2.url = l.url AND s2.task_id <> l.task_id)::int
		FROM latest l
		JOIN tasks t ON t.id = l.task_id
		JOIN enrollments e ON e.id = t.enrollment_id
		JOIN users u ON u.id = e.user_id
		WHERE l.url IS NOT NULL`, ids)
	if err != nil {
		return fmt.Errorf("hand-in checks: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		var login string
		var reused int
		if err := rows.Scan(&id, &login, &reused); err != nil {
			return err
		}
		sub := tasks[idx[id]].Submission
		checks := []domain.HandInCheck{}
		if c := domain.CheckGitHubOwner(sub.URL, login); c != nil {
			checks = append(checks, *c)
		}
		if c := domain.ReusedLinkCheck(reused); c != nil {
			checks = append(checks, *c)
		}
		sub.Checks = checks
	}
	return rows.Err()
}

// ReviewRow is one hand-in waiting for review.
type ReviewRow struct {
	Task    domain.Task
	Student domain.User
}

// ReviewQueue lists tasks in review, oldest first, optionally for one college.
func ReviewQueue(ctx context.Context, q Q, college *uuid.UUID, persona *uuid.UUID, limit int) ([]ReviewRow, error) {
	rows, err := q.Query(ctx, `
		SELECT t.id, t.enrollment_id, t.type, t.title, t.brief, t.status, t.scheduled_for, t.due_at, t.created_by, t.version, t.created_at,
		       t.updated_at, t.review_mode, t.persona_id, t.flow_item_id, t.content, `+userCols+`
		FROM tasks t
		JOIN enrollments e ON e.id = t.enrollment_id
		JOIN users u ON u.id = e.user_id
		LEFT JOIN cohorts c ON c.id = e.cohort_id
		WHERE t.status = 'in_review' AND e.status IN ('active', 'paused')
		  AND ($1::uuid IS NULL OR COALESCE(c.college_id, u.college_id) = $1)
		  AND ($2::uuid IS NULL OR t.persona_id = $2)
		ORDER BY t.updated_at, t.id
		LIMIT $3`, college, persona, limit)
	if err != nil {
		return nil, fmt.Errorf("review queue: %w", err)
	}
	defer rows.Close()
	out := []ReviewRow{}
	for rows.Next() {
		var r ReviewRow
		t, err := scanTaskWithUser(rows, &r.Student)
		if err != nil {
			return nil, err
		}
		r.Task = t
		out = append(out, r)
	}
	return out, rows.Err()
}
