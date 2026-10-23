// Package seed loads deterministic demo data for local development and E2E tests.
package seed

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// Logins created by the seed. E2E tests sign in as these through dev login.
const (
	AdminLogin        = "admin-demo"
	CollegeAdminLogin = "anits-tpo"
	StudentLogin      = "asha-dev"
	Student2Login     = "ravi-dev"
	IndieStudentLogin = "meera-dev"
	PausedLogin       = "kiran-dev"
	NoEnrollLogin     = "nora-dev"
)

// Reset deletes all workspace data. Never call this against production.
func Reset(ctx context.Context, q store.Q) error {
	_, err := q.Exec(ctx, `TRUNCATE task_events, chat_messages, tasks, enrollments, cohorts, login_codes, refresh_tokens, users, colleges RESTART IDENTITY CASCADE`)
	return err
}

// Run inserts demo data. It is idempotent: existing rows are left as they are.
func Run(ctx context.Context, q store.Q, now time.Time) error {
	var collegeID uuid.UUID
	if err := q.QueryRow(ctx, `INSERT INTO colleges (name) VALUES ('ANITS') ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`).Scan(&collegeID); err != nil {
		return fmt.Errorf("college: %w", err)
	}
	var programID uuid.UUID
	if err := q.QueryRow(ctx, `SELECT id FROM programs WHERE slug = 'frontend-30'`).Scan(&programID); err != nil {
		return fmt.Errorf("program: %w", err)
	}

	type person struct {
		login, name string
		role        string
		college     *uuid.UUID
	}
	people := []person{
		{AdminLogin, "Platform Admin", "admin", nil},
		{CollegeAdminLogin, "ANITS Placement Cell", "college_admin", &collegeID},
		{StudentLogin, "Asha Rao", "student", &collegeID},
		{Student2Login, "Ravi Teja", "student", &collegeID},
		{IndieStudentLogin, "Meera Iyer", "student", nil},
		{PausedLogin, "Kiran Kumar", "student", &collegeID},
		{NoEnrollLogin, "Nora Das", "student", nil},
	}
	ids := map[string]uuid.UUID{}
	for _, p := range people {
		var id uuid.UUID
		err := q.QueryRow(ctx, `
			INSERT INTO users (github_login, name, role, college_id, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $5)
			ON CONFLICT ((lower(github_login))) DO UPDATE SET name = users.name
			RETURNING id`, p.login, p.name, p.role, p.college, now).Scan(&id)
		if err != nil {
			return fmt.Errorf("user %s: %w", p.login, err)
		}
		ids[p.login] = id
	}

	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	start := today.AddDate(0, 0, -2)
	var cohortID uuid.UUID
	if err := q.QueryRow(ctx, `SELECT id FROM cohorts WHERE name = 'ANITS Batch 1'`).Scan(&cohortID); err != nil {
		if err := q.QueryRow(ctx, `INSERT INTO cohorts (kind, name, college_id, program_id, start_date, seats_total)
			VALUES ('college', 'ANITS Batch 1', $1, $2, $3, 60) RETURNING id`, collegeID, programID, start).Scan(&cohortID); err != nil {
			return fmt.Errorf("cohort: %w", err)
		}
	}

	enroll := func(login string, cohort *uuid.UUID, status string) (uuid.UUID, error) {
		var id uuid.UUID
		err := q.QueryRow(ctx, `SELECT id FROM enrollments WHERE user_id = $1 AND status IN ('active', 'paused')`, ids[login]).Scan(&id)
		if err == nil {
			return id, nil
		}
		err = q.QueryRow(ctx, `INSERT INTO enrollments (user_id, program_id, cohort_id, start_date, end_date, status)
			VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, ids[login], programID, cohort, start, start.AddDate(0, 0, 29), status).Scan(&id)
		return id, err
	}
	asha, err := enroll(StudentLogin, &cohortID, "active")
	if err != nil {
		return fmt.Errorf("enroll asha: %w", err)
	}
	if _, err := enroll(Student2Login, &cohortID, "active"); err != nil {
		return fmt.Errorf("enroll ravi: %w", err)
	}
	if _, err := enroll(IndieStudentLogin, nil, "active"); err != nil {
		return fmt.Errorf("enroll meera: %w", err)
	}
	if _, err := enroll(PausedLogin, &cohortID, "paused"); err != nil {
		return fmt.Errorf("enroll kiran: %w", err)
	}

	var hasMessages bool
	if err := q.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM chat_messages WHERE enrollment_id = $1)`, asha).Scan(&hasMessages); err != nil {
		return err
	}
	if !hasMessages {
		if _, err := q.Exec(ctx, `INSERT INTO chat_messages (enrollment_id, author, body, created_at, deliver_at, delivered_at)
			VALUES ($1, 'lead', $2, $3, $3, $3)`, asha,
			"Welcome to Stackstep, Asha. I'm your team lead for the next 30 days. Each morning I'll post a standup and drop tickets on your board. Ask me anything here.",
			now.Add(-time.Hour)); err != nil {
			return fmt.Errorf("welcome message: %w", err)
		}
	}
	return nil
}
