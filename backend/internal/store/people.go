package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

// ErrAlreadyEnrolled is returned when the user already has an active or paused internship.
var ErrAlreadyEnrolled = errors.New("already enrolled")

// CollegeRow is a college with headcounts.
type CollegeRow struct {
	College       domain.College
	Students      int // open enrollments
	Cohorts       int
	CollegeAdmins int
}

// ListColleges returns colleges by name, optionally only one.
func ListColleges(ctx context.Context, q Q, only *uuid.UUID) ([]CollegeRow, error) {
	rows, err := q.Query(ctx, `
		SELECT c.id, c.name, c.created_at,
		       (SELECT count(*) FROM enrollments e LEFT JOIN cohorts co ON co.id = e.cohort_id JOIN users u ON u.id = e.user_id
		         WHERE COALESCE(co.college_id, u.college_id) = c.id AND e.status IN ('active', 'paused'))::int,
		       (SELECT count(*) FROM cohorts co WHERE co.college_id = c.id)::int,
		       (SELECT count(*) FROM users u WHERE u.college_id = c.id AND u.role = 'college_admin')::int
		FROM colleges c
		WHERE $1::uuid IS NULL OR c.id = $1
		ORDER BY lower(c.name), c.id`, only)
	if err != nil {
		return nil, fmt.Errorf("list colleges: %w", err)
	}
	defer rows.Close()
	out := []CollegeRow{}
	for rows.Next() {
		var r CollegeRow
		if err := rows.Scan(&r.College.ID, &r.College.Name, &r.College.CreatedAt, &r.Students, &r.Cohorts, &r.CollegeAdmins); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// InsertCollege adds a college. Names are unique (case-insensitive).
func InsertCollege(ctx context.Context, q Q, name string, now time.Time) (domain.College, error) {
	var exists bool
	if err := q.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM colleges WHERE lower(name) = lower($1))`, name).Scan(&exists); err != nil {
		return domain.College{}, err
	}
	if exists {
		return domain.College{}, ErrDuplicate
	}
	var c domain.College
	err := q.QueryRow(ctx, `INSERT INTO colleges (name, created_at) VALUES ($1, $2) RETURNING id, name, created_at`, name, now).
		Scan(&c.ID, &c.Name, &c.CreatedAt)
	if isUnique(err) {
		return domain.College{}, ErrDuplicate
	}
	return c, err
}

// CollegeExists reports whether a college id exists.
func CollegeExists(ctx context.Context, q Q, id uuid.UUID) (bool, error) {
	var ok bool
	err := q.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM colleges WHERE id = $1)`, id).Scan(&ok)
	return ok, err
}

// ProgramRow is a program with its id.
type ProgramRow struct {
	ID      uuid.UUID
	Program domain.Program
}

// ListPrograms returns every program, shortest first.
func ListPrograms(ctx context.Context, q Q) ([]ProgramRow, error) {
	rows, err := q.Query(ctx, `SELECT id, slug, days, track FROM programs ORDER BY days, slug`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ProgramRow{}
	for rows.Next() {
		var r ProgramRow
		if err := rows.Scan(&r.ID, &r.Program.Slug, &r.Program.Days, &r.Program.Track); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ProgramBySlug finds a program.
func ProgramBySlug(ctx context.Context, q Q, slug string) (ProgramRow, error) {
	var r ProgramRow
	err := q.QueryRow(ctx, `SELECT id, slug, days, track FROM programs WHERE slug = $1`, slug).Scan(&r.ID, &r.Program.Slug, &r.Program.Days, &r.Program.Track)
	return r, notFound(err)
}

// CohortRow is a cohort with its college name and seat use.
type CohortRow struct {
	Cohort      domain.Cohort
	ProgramID   uuid.UUID
	CollegeName *string
	SeatsUsed   int // open enrollments
}

const cohortSelect = `
	SELECT co.id, co.kind, co.name, co.college_id, p.id, p.slug, p.days, p.track, co.start_date, co.seats_total, co.created_at, cl.name,
	       (SELECT count(*) FROM enrollments e WHERE e.cohort_id = co.id AND e.status IN ('active', 'paused'))::int
	FROM cohorts co
	JOIN programs p ON p.id = co.program_id
	LEFT JOIN colleges cl ON cl.id = co.college_id`

func scanCohort(row interface{ Scan(...any) error }) (CohortRow, error) {
	var r CohortRow
	var kind string
	err := row.Scan(&r.Cohort.ID, &kind, &r.Cohort.Name, &r.Cohort.CollegeID, &r.ProgramID, &r.Cohort.Program.Slug, &r.Cohort.Program.Days,
		&r.Cohort.Program.Track, &r.Cohort.StartDate, &r.Cohort.SeatsTotal, &r.Cohort.CreatedAt, &r.CollegeName, &r.SeatsUsed)
	r.Cohort.Kind = domain.CohortKind(kind)
	return r, notFound(err)
}

// ListCohorts returns cohorts, newest start first, optionally for one college.
func ListCohorts(ctx context.Context, q Q, college *uuid.UUID) ([]CohortRow, error) {
	rows, err := q.Query(ctx, cohortSelect+` WHERE $1::uuid IS NULL OR co.college_id = $1 ORDER BY co.start_date DESC, lower(co.name), co.id`, college)
	if err != nil {
		return nil, fmt.Errorf("list cohorts: %w", err)
	}
	defer rows.Close()
	out := []CohortRow{}
	for rows.Next() {
		r, err := scanCohort(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// GetCohort loads a cohort; forUpdate locks it so seat counts stay correct.
func GetCohort(ctx context.Context, q Q, id uuid.UUID, forUpdate bool) (CohortRow, error) {
	if forUpdate {
		if _, err := q.Exec(ctx, `SELECT 1 FROM cohorts WHERE id = $1 FOR UPDATE`, id); err != nil {
			return CohortRow{}, err
		}
	}
	return scanCohort(q.QueryRow(ctx, cohortSelect+` WHERE co.id = $1`, id))
}

// InsertCohort adds a cohort.
func InsertCohort(ctx context.Context, q Q, c domain.Cohort, programID uuid.UUID, now time.Time) (uuid.UUID, error) {
	var id uuid.UUID
	err := q.QueryRow(ctx, `INSERT INTO cohorts (kind, name, college_id, program_id, start_date, seats_total, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`, string(c.Kind), c.Name, c.CollegeID, programID, c.StartDate, c.SeatsTotal, now).Scan(&id)
	return id, err
}

// InsertPendingUser creates a user who hasn't signed in yet; GitHub sign-in links them by login.
func InsertPendingUser(ctx context.Context, q Q, p domain.PersonInput, role domain.Role, college *uuid.UUID, now time.Time) (domain.User, error) {
	var email *string
	if p.Email != "" {
		email = &p.Email
	}
	u, err := scanUser(q.QueryRow(ctx, `
		INSERT INTO users AS u (github_login, name, email, role, college_id, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING `+userCols, p.GitHubLogin, p.Name, email, string(role), college, now))
	if isUnique(err) {
		return domain.User{}, ErrDuplicate
	}
	return u, err
}

// SetUserCollege records a student's college (used when they join a college cohort).
func SetUserCollege(ctx context.Context, q Q, userID, college uuid.UUID, now time.Time) error {
	_, err := q.Exec(ctx, `UPDATE users SET college_id = $2, updated_at = $3 WHERE id = $1`, userID, college, now)
	return err
}

// SetUserRole changes a user's role and college.
func SetUserRole(ctx context.Context, q Q, userID uuid.UUID, role domain.Role, college *uuid.UUID, now time.Time) (domain.User, error) {
	return scanUser(q.QueryRow(ctx, `UPDATE users u SET role = $2, college_id = $3, updated_at = $4 WHERE u.id = $1 RETURNING `+userCols,
		userID, string(role), college, now))
}

// LockUser serializes role changes for one user.
func LockUser(ctx context.Context, q Q, userID uuid.UUID) error {
	_, err := q.Exec(ctx, `SELECT 1 FROM users WHERE id = $1 FOR UPDATE`, userID)
	return err
}

// CountAdmins counts platform admins, locking them so two demotions can't race.
func CountAdmins(ctx context.Context, q Q) (int, error) {
	rows, err := q.Query(ctx, `SELECT id FROM users WHERE role = 'admin' FOR UPDATE`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	n := 0
	for rows.Next() {
		n++
	}
	return n, rows.Err()
}

// NewEnrollment is an internship to create.
type NewEnrollment struct {
	UserID, ProgramID uuid.UUID
	CohortID          *uuid.UUID
	StartDate         time.Time
	EndDate           time.Time
	Timezone          string
}

// InsertEnrollment creates an active internship.
func InsertEnrollment(ctx context.Context, q Q, n NewEnrollment, now time.Time) (uuid.UUID, error) {
	var id uuid.UUID
	err := q.QueryRow(ctx, `INSERT INTO enrollments (user_id, program_id, cohort_id, start_date, end_date, timezone, status, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, 'active', $7) RETURNING id`, n.UserID, n.ProgramID, n.CohortID, n.StartDate, n.EndDate, n.Timezone, now).Scan(&id)
	if isUnique(err) {
		return uuid.Nil, ErrAlreadyEnrolled
	}
	return id, err
}

// SetEnrollmentStatus moves an enrollment; it fails with ErrNotFound if the status changed meanwhile.
func SetEnrollmentStatus(ctx context.Context, q Q, id uuid.UUID, from, to domain.EnrollmentStatus) error {
	tag, err := q.Exec(ctx, `UPDATE enrollments SET status = $3 WHERE id = $1 AND status = $2`, id, string(from), string(to))
	if isUnique(err) {
		return ErrAlreadyEnrolled
	}
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// StaffRow is an admin or college admin.
type StaffRow struct {
	User        domain.User
	CollegeName *string
	SignedIn    bool // has linked a GitHub account
}

// ListStaff returns admins first, then college admins, by name.
func ListStaff(ctx context.Context, q Q) ([]StaffRow, error) {
	rows, err := q.Query(ctx, `SELECT `+userCols+`, cl.name, u.github_id IS NOT NULL
		FROM users u LEFT JOIN colleges cl ON cl.id = u.college_id
		WHERE u.role IN ('admin', 'college_admin')
		ORDER BY u.role = 'admin' DESC, lower(u.name), u.id`)
	if err != nil {
		return nil, fmt.Errorf("list staff: %w", err)
	}
	defer rows.Close()
	out := []StaffRow{}
	for rows.Next() {
		var r StaffRow
		var role string
		if err := rows.Scan(&r.User.ID, &r.User.GitHubID, &r.User.GitHubLogin, &r.User.Name, &r.User.Email, &r.User.AvatarURL, &role, &r.User.CollegeID,
			&r.CollegeName, &r.SignedIn); err != nil {
			return nil, err
		}
		r.User.Role = domain.Role(role)
		out = append(out, r)
	}
	return out, rows.Err()
}
