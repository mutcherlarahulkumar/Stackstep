package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

// ErrCodeTaken is a (vanishingly rare) code collision; the caller retries with a new code.
var ErrCodeTaken = errors.New("certificate code taken")

// ErrAlreadyIssued means the internship already has a valid certificate.
var ErrAlreadyIssued = errors.New("certificate already issued")

const certCols = `code, enrollment_id, student_name, github_login, program_slug, program_days, flow_name, start_date, end_date,
	points, tasks_done, tasks_total, issued_at, revoked_at, revoke_reason`

func scanCert(row pgx.Row) (domain.Certificate, error) {
	var c domain.Certificate
	err := row.Scan(&c.Code, &c.EnrollmentID, &c.StudentName, &c.GitHubLogin, &c.ProgramSlug, &c.ProgramDays, &c.FlowName,
		&c.StartDate, &c.EndDate, &c.Points, &c.TasksDone, &c.TasksTotal, &c.IssuedAt, &c.RevokedAt, &c.RevokeReason)
	return c, notFound(err)
}

// InsertCertificate stores an issued certificate.
func InsertCertificate(ctx context.Context, q Q, c domain.Certificate, by uuid.UUID) (domain.Certificate, error) {
	out, err := scanCert(q.QueryRow(ctx, `INSERT INTO certificates (code, enrollment_id, student_name, github_login, program_slug, program_days,
		flow_name, start_date, end_date, points, tasks_done, tasks_total, issued_by, issued_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING `+certCols,
		c.Code, c.EnrollmentID, c.StudentName, c.GitHubLogin, c.ProgramSlug, c.ProgramDays, c.FlowName, c.StartDate, c.EndDate,
		c.Points, c.TasksDone, c.TasksTotal, by, c.IssuedAt))
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23505" {
		switch pg.ConstraintName {
		case "certificates_code_key":
			return domain.Certificate{}, ErrCodeTaken
		case "certificates_one_valid":
			return domain.Certificate{}, ErrAlreadyIssued
		}
	}
	return out, err
}

// CertificateByCode loads a certificate for verification.
func CertificateByCode(ctx context.Context, q Q, code string) (domain.Certificate, error) {
	return scanCert(q.QueryRow(ctx, "SELECT "+certCols+" FROM certificates WHERE code = $1", code))
}

// ValidCertificateFor returns the enrollment's valid certificate, if any.
func ValidCertificateFor(ctx context.Context, q Q, enrollmentID uuid.UUID) (*domain.Certificate, error) {
	c, err := scanCert(q.QueryRow(ctx, "SELECT "+certCols+" FROM certificates WHERE enrollment_id = $1 AND revoked_at IS NULL", enrollmentID))
	if errors.Is(err, ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// CertificatesForUser lists a user's certificates across internships, newest first.
func CertificatesForUser(ctx context.Context, q Q, userID uuid.UUID) ([]domain.Certificate, error) {
	rows, err := q.Query(ctx, "SELECT "+certColsC+` FROM certificates c JOIN enrollments e ON e.id = c.enrollment_id
		WHERE e.user_id = $1 ORDER BY (c.revoked_at IS NULL) DESC, c.issued_at DESC LIMIT 20`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Certificate{}
	for rows.Next() {
		c, err := scanCert(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

const certColsC = `c.code, c.enrollment_id, c.student_name, c.github_login, c.program_slug, c.program_days, c.flow_name, c.start_date,
	c.end_date, c.points, c.tasks_done, c.tasks_total, c.issued_at, c.revoked_at, c.revoke_reason`

// RevokeCertificate marks a valid certificate revoked.
func RevokeCertificate(ctx context.Context, q Q, code string, by uuid.UUID, reason string, now time.Time) (domain.Certificate, error) {
	return scanCert(q.QueryRow(ctx, `UPDATE certificates SET revoked_at = $3, revoked_by = $2, revoke_reason = $4
		WHERE code = $1 AND revoked_at IS NULL RETURNING `+certCols, code, by, now, reason))
}

// EnrollmentProgress counts an enrollment's tasks as the student sees them at now.
func EnrollmentProgress(ctx context.Context, q Q, enrollmentID uuid.UUID, now time.Time) (domain.Progress, error) {
	var p domain.Progress
	err := q.QueryRow(ctx, `SELECT
		count(*) FILTER (WHERE status <> 'cancelled')::int,
		count(*) FILTER (WHERE status = 'done')::int,
		count(*) FILTER (WHERE status = 'in_review')::int,
		count(*) FILTER (WHERE status IN ('todo', 'in_progress', 'changes_requested') AND due_at < $2)::int
		FROM tasks WHERE enrollment_id = $1 AND scheduled_for <= $2`, enrollmentID, now).Scan(&p.Released, &p.Done, &p.InReview, &p.Overdue)
	if err != nil {
		return p, fmt.Errorf("progress: %w", err)
	}
	pts, err := Points(ctx, q, enrollmentID)
	if err != nil {
		return p, err
	}
	p.Points, p.OnTime = pts.Points, pts.OnTime
	return p, nil
}
