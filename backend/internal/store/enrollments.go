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

const enrollmentSelect = `
	SELECT e.id, e.user_id, COALESCE(c.college_id, u.college_id), p.slug, p.days, p.track,
	       e.start_date, e.end_date, e.timezone, e.status, f.id, fv.id, f.name, fv.number
	FROM enrollments e
	JOIN programs p ON p.id = e.program_id
	JOIN users u ON u.id = e.user_id
	LEFT JOIN cohorts c ON c.id = e.cohort_id
	LEFT JOIN flow_versions fv ON fv.id = e.flow_version_id
	LEFT JOIN flows f ON f.id = fv.flow_id`

func scanEnrollment(row pgx.Row) (domain.Enrollment, error) {
	var e domain.Enrollment
	var status string
	var fl enrollmentFlowCols
	if err := row.Scan(&e.ID, &e.UserID, &e.CollegeID, &e.Program.Slug, &e.Program.Days, &e.Program.Track,
		&e.StartDate, &e.EndDate, &e.Timezone, &status, &fl.flowID, &fl.versionID, &fl.name, &fl.number); err != nil {
		return domain.Enrollment{}, notFound(err)
	}
	e.Flow = fl.flow()
	e.Status = domain.EnrollmentStatus(status)
	if !e.Status.Valid() {
		return domain.Enrollment{}, fmt.Errorf("enrollment %s has unknown status %q", e.ID, status)
	}
	return e, nil
}

type enrollmentFlowCols struct {
	flowID, versionID *uuid.UUID
	name              *string
	number            *int
}

func (f enrollmentFlowCols) flow() *domain.EnrollmentFlow {
	if f.flowID == nil || f.versionID == nil || f.name == nil || f.number == nil {
		return nil
	}
	return &domain.EnrollmentFlow{FlowID: *f.flowID, VersionID: *f.versionID, Name: *f.name, Number: *f.number}
}

// SetEnrollmentFlow records the flow version an enrollment follows.
func SetEnrollmentFlow(ctx context.Context, q Q, enrollmentID, versionID uuid.UUID) error {
	_, err := q.Exec(ctx, "UPDATE enrollments SET flow_version_id = $2 WHERE id = $1", enrollmentID, versionID)
	return err
}

// OpenEnrollmentForUser returns the user's active or paused enrollment.
func OpenEnrollmentForUser(ctx context.Context, q Q, userID uuid.UUID) (domain.Enrollment, error) {
	return scanEnrollment(q.QueryRow(ctx, enrollmentSelect+` WHERE e.user_id = $1 AND e.status IN ('active', 'paused')`, userID))
}

// GetEnrollment loads an enrollment by id.
func GetEnrollment(ctx context.Context, q Q, id uuid.UUID) (domain.Enrollment, error) {
	return scanEnrollment(q.QueryRow(ctx, enrollmentSelect+` WHERE e.id = $1`, id))
}

// StudentRow is one line of the admin student list.
type StudentRow struct {
	User       domain.User
	Enrollment domain.Enrollment
	OpenTasks  int
	InReview   int
	SortKey    string // lower(name) as Postgres computes it, for the keyset cursor
}

// ListStudents returns students with an open enrollment, ordered by name, optionally limited to one college.
// Open and in-review counts only include tasks the student can see (released by now), the
// same rule as progress and the overview.
func ListStudents(ctx context.Context, q Q, college *uuid.UUID, search string, after *Cursor, limit int, now time.Time) ([]StudentRow, error) {
	args := []any{now}
	where := []string{"e.status IN ('active', 'paused')", "u.role = 'student'"}
	add := func(cond string, v any) {
		args = append(args, v)
		where = append(where, strings.ReplaceAll(cond, "?", fmt.Sprintf("$%d", len(args))))
	}
	if college != nil {
		add("COALESCE(c.college_id, u.college_id) = ?", *college)
	}
	if search != "" {
		pattern := "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(search) + "%"
		add("(u.name ILIKE ? OR u.github_login ILIKE ?)", pattern)
	}
	if after != nil {
		args = append(args, after.Key, after.ID)
		where = append(where, fmt.Sprintf("(lower(u.name), u.id) > ($%d, $%d)", len(args)-1, len(args)))
	}
	args = append(args, limit)
	sql := `
		SELECT ` + userCols + `, e.id, e.user_id, COALESCE(c.college_id, u.college_id), p.slug, p.days, p.track,
		       e.start_date, e.end_date, e.timezone, e.status, f.id, fv.id, f.name, fv.number,
		       (SELECT count(*) FROM tasks t WHERE t.enrollment_id = e.id AND t.scheduled_for <= $1 AND t.status IN ('todo', 'in_progress', 'changes_requested')),
		       (SELECT count(*) FROM tasks t WHERE t.enrollment_id = e.id AND t.scheduled_for <= $1 AND t.status = 'in_review'),
		       lower(u.name)
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		JOIN programs p ON p.id = e.program_id
		LEFT JOIN cohorts c ON c.id = e.cohort_id
		LEFT JOIN flow_versions fv ON fv.id = e.flow_version_id
		LEFT JOIN flows f ON f.id = fv.flow_id
		WHERE ` + strings.Join(where, " AND ") + fmt.Sprintf(`
		ORDER BY lower(u.name), u.id
		LIMIT $%d`, len(args))

	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, fmt.Errorf("list students: %w", err)
	}
	defer rows.Close()
	var out []StudentRow
	for rows.Next() {
		var r StudentRow
		var role, status string
		var fl enrollmentFlowCols
		if err := rows.Scan(&r.User.ID, &r.User.GitHubID, &r.User.GitHubLogin, &r.User.Name, &r.User.Email, &r.User.AvatarURL, &role, &r.User.CollegeID,
			&r.Enrollment.ID, &r.Enrollment.UserID, &r.Enrollment.CollegeID, &r.Enrollment.Program.Slug, &r.Enrollment.Program.Days, &r.Enrollment.Program.Track,
			&r.Enrollment.StartDate, &r.Enrollment.EndDate, &r.Enrollment.Timezone, &status, &fl.flowID, &fl.versionID, &fl.name, &fl.number, &r.OpenTasks, &r.InReview, &r.SortKey); err != nil {
			return nil, fmt.Errorf("scan student: %w", err)
		}
		r.User.Role = domain.Role(role)
		r.Enrollment.Status = domain.EnrollmentStatus(status)
		r.Enrollment.Flow = fl.flow()
		out = append(out, r)
	}
	return out, rows.Err()
}
