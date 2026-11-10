package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

// Class is a scheduled live class.
type Class struct {
	ID              uuid.UUID
	Title           string
	Description     string
	StartsAt        time.Time
	DurationMinutes int
	Audience        domain.Audience
	FlowID          *uuid.UUID
	FlowName        *string
	CohortID        *uuid.UUID
	CohortName      *string
	CollegeID       *uuid.UUID
	HostID          uuid.UUID
	HostName        string
	Status          domain.ClassStatus
	StartedAt       *time.Time
	EndedAt         *time.Time
	CreatedAt       time.Time
}

const classSelect = `SELECT c.id, c.title, c.description, c.starts_at, c.duration_minutes, c.audience, c.flow_id, f.name, c.cohort_id, co.name,
	c.college_id, c.host_id, u.name, c.status, c.started_at, c.ended_at, c.created_at
	FROM classes c JOIN users u ON u.id = c.host_id LEFT JOIN flows f ON f.id = c.flow_id LEFT JOIN cohorts co ON co.id = c.cohort_id`

func scanClass(row interface{ Scan(...any) error }) (Class, error) {
	var c Class
	var aud, status string
	err := row.Scan(&c.ID, &c.Title, &c.Description, &c.StartsAt, &c.DurationMinutes, &aud, &c.FlowID, &c.FlowName, &c.CohortID, &c.CohortName,
		&c.CollegeID, &c.HostID, &c.HostName, &status, &c.StartedAt, &c.EndedAt, &c.CreatedAt)
	c.Audience, c.Status = domain.Audience(aud), domain.ClassStatus(status)
	return c, notFound(err)
}

func scanClasses(rows interface {
	Next() bool
	Scan(...any) error
	Err() error
	Close()
}) ([]Class, error) {
	defer rows.Close()
	out := []Class{}
	for rows.Next() {
		c, err := scanClass(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// InsertClass stores a new class.
func InsertClass(ctx context.Context, q Q, c Class, now time.Time) (uuid.UUID, error) {
	var id uuid.UUID
	err := q.QueryRow(ctx, `INSERT INTO classes (title, description, starts_at, duration_minutes, audience, flow_id, cohort_id, college_id, host_id, status, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled', $10) RETURNING id`,
		c.Title, c.Description, c.StartsAt, c.DurationMinutes, string(c.Audience), c.FlowID, c.CohortID, c.CollegeID, c.HostID, now).Scan(&id)
	return id, err
}

// GetClass loads one class.
func GetClass(ctx context.Context, q Q, id uuid.UUID) (Class, error) {
	return scanClass(q.QueryRow(ctx, classSelect+` WHERE c.id = $1`, id))
}

// StaffClasses lists classes in a scope (nil college: all), upcoming and live first.
func StaffClasses(ctx context.Context, q Q, college *uuid.UUID, limit int) ([]Class, error) {
	rows, err := q.Query(ctx, classSelect+` WHERE $1::uuid IS NULL OR c.college_id = $1
		ORDER BY (c.status IN ('live', 'scheduled')) DESC, CASE WHEN c.status IN ('live', 'scheduled') THEN c.starts_at END ASC, c.starts_at DESC LIMIT $2`, college, limit)
	if err != nil {
		return nil, fmt.Errorf("staff classes: %w", err)
	}
	defer rows.Close()
	return scanClasses(rows)
}

// StudentClasses lists classes an internship is invited to (by audience and college), not
// cancelled, from a day ago on.
func StudentClasses(ctx context.Context, q Q, e domain.Enrollment, now time.Time) ([]Class, error) {
	var flow *uuid.UUID
	if e.Flow != nil {
		flow = &e.Flow.FlowID
	}
	rows, err := q.Query(ctx, classSelect+` WHERE c.status <> 'cancelled' AND c.starts_at > $1::timestamptz - interval '1 day'
		AND (c.college_id IS NULL OR c.college_id = $2)
		AND (c.audience = 'all' OR (c.audience = 'flow' AND c.flow_id = $3)
		     OR (c.audience = 'cohort' AND c.cohort_id = (SELECT cohort_id FROM enrollments WHERE id = $4)))
		ORDER BY c.starts_at LIMIT 100`, now, e.CollegeID, flow, e.ID)
	if err != nil {
		return nil, fmt.Errorf("student classes: %w", err)
	}
	defer rows.Close()
	return scanClasses(rows)
}

// SetClassStatus moves a class to live, ended or cancelled, stamping the time.
func SetClassStatus(ctx context.Context, q Q, id uuid.UUID, s domain.ClassStatus, now time.Time) error {
	_, err := q.Exec(ctx, `UPDATE classes SET status = $2,
		started_at = CASE WHEN $2 = 'live' THEN COALESCE(started_at, $3) ELSE started_at END,
		ended_at = CASE WHEN $2 IN ('ended', 'cancelled') THEN $3 ELSE ended_at END
		WHERE id = $1`, id, string(s), now)
	return err
}
