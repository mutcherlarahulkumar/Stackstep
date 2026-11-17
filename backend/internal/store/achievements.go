package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

// AchievementFacts loads what an enrollment's badges and streak are worked out from.
func AchievementFacts(ctx context.Context, q Q, e domain.Enrollment) (domain.AchievementFacts, error) {
	var f domain.AchievementFacts
	// Active days: task moves by the student, their chat messages, quiz and review lab tries.
	rows, err := q.Query(ctx, `
		SELECT DISTINCT (at AT TIME ZONE $3)::date FROM (
			SELECT ev.created_at AS at FROM task_events ev JOIN tasks t ON t.id = ev.task_id
			 WHERE t.enrollment_id = $1 AND ev.actor_id = $2
			UNION ALL
			SELECT created_at FROM chat_messages WHERE enrollment_id = $1 AND author = 'student'
			UNION ALL
			SELECT qa.created_at FROM quiz_attempts qa JOIN tasks t ON t.id = qa.task_id WHERE t.enrollment_id = $1
			UNION ALL
			SELECT created_at FROM review_lab_attempts WHERE user_id = $2 AND created_at >= $4
		) a`, e.ID, e.UserID, e.Location().String(), e.StartDate)
	if err != nil {
		return f, fmt.Errorf("active days: %w", err)
	}
	for rows.Next() {
		var d time.Time
		if err := rows.Scan(&d); err != nil {
			rows.Close()
			return f, err
		}
		f.ActiveDays = append(f.ActiveDays, d)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return f, err
	}

	rows, err = q.Query(ctx, `
		SELECT t.type, t.status, t.due_at,
		       (SELECT max(ev.created_at) FROM task_events ev WHERE ev.task_id = t.id AND ev.to_status = 'done'),
		       (SELECT s.url FROM task_submissions s WHERE s.task_id = t.id ORDER BY s.attempt DESC LIMIT 1),
		       (SELECT min(s.created_at) FROM task_submissions s WHERE s.task_id = t.id),
		       EXISTS (SELECT 1 FROM task_events ev WHERE ev.task_id = t.id AND ev.to_status = 'done' AND ev.actor_id <> $2)
		FROM tasks t WHERE t.enrollment_id = $1 AND t.status <> 'cancelled'`, e.ID, e.UserID)
	if err != nil {
		return f, fmt.Errorf("task facts: %w", err)
	}
	for rows.Next() {
		var typ, status string
		var due time.Time
		var doneAt, firstSub *time.Time
		var link *string
		var byReviewer bool
		if err := rows.Scan(&typ, &status, &due, &doneAt, &link, &firstSub, &byReviewer); err != nil {
			rows.Close()
			return f, err
		}
		if status == string(domain.StatusDone) && doneAt != nil {
			d := domain.DoneFact{Type: domain.TaskType(typ), DoneAt: *doneAt, ByReviewer: byReviewer}
			if link != nil {
				d.URL = *link
			}
			f.Done = append(f.Done, d)
		}
		switch {
		case firstSub != nil:
			f.HandIns = append(f.HandIns, domain.HandInFact{At: *firstSub, DueAt: due})
		case status == string(domain.StatusDone) && doneAt != nil:
			f.HandIns = append(f.HandIns, domain.HandInFact{At: *doneAt, DueAt: due})
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return f, err
	}

	if err := q.QueryRow(ctx, `SELECT min(qa.created_at) FROM quiz_attempts qa JOIN tasks t ON t.id = qa.task_id
		WHERE t.enrollment_id = $1 AND qa.score = 100`, e.ID).Scan(&f.QuizPerfectAt); err != nil {
		return f, err
	}
	if err := q.QueryRow(ctx, `SELECT min(created_at) FROM review_lab_attempts WHERE user_id = $1 AND found = total`,
		e.UserID).Scan(&f.LabPerfectAt); err != nil {
		return f, err
	}
	return f, nil
}

// EarnedBadges returns the badges stored for an enrollment.
func EarnedBadges(ctx context.Context, q Q, enrollmentID uuid.UUID) (map[domain.BadgeKey]time.Time, error) {
	rows, err := q.Query(ctx, `SELECT badge, earned_at FROM badges WHERE enrollment_id = $1`, enrollmentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[domain.BadgeKey]time.Time{}
	for rows.Next() {
		var k string
		var at time.Time
		if err := rows.Scan(&k, &at); err != nil {
			return nil, err
		}
		out[domain.BadgeKey(k)] = at
	}
	return out, rows.Err()
}

// SaveBadge stores an earned badge once. It reports whether this call stored it.
func SaveBadge(ctx context.Context, q Q, enrollmentID uuid.UUID, k domain.BadgeKey, at time.Time) (bool, error) {
	tag, err := q.Exec(ctx, `INSERT INTO badges (enrollment_id, badge, earned_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
		enrollmentID, string(k), at)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}
