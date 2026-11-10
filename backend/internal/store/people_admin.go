package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

// UserForAuth loads a user and when they were last signed out everywhere, in one query.
func UserForAuth(ctx context.Context, q Q, id uuid.UUID) (domain.User, *time.Time, error) {
	var u domain.User
	var role string
	var out *time.Time
	err := q.QueryRow(ctx, "SELECT "+userCols+", u.signed_out_at FROM users u WHERE u.id = $1", id).
		Scan(&u.ID, &u.GitHubID, &u.GitHubLogin, &u.Name, &u.Email, &u.AvatarURL, &role, &u.CollegeID, &out)
	if err != nil {
		return domain.User{}, nil, notFound(err)
	}
	u.Role = domain.Role(role)
	if !u.Role.Valid() {
		return domain.User{}, nil, fmt.Errorf("user %s has unknown role %q", u.ID, role)
	}
	return u, out, nil
}

// TouchUser records that the user was just active.
func TouchUser(ctx context.Context, q Q, id uuid.UUID, now time.Time) error {
	_, err := q.Exec(ctx, "UPDATE users SET last_seen_at = $2 WHERE id = $1", id, now)
	return err
}

// MarkAttendance records the student's first visit on a local date. The seat is the order
// they arrived in that day. Later visits the same day change nothing. Run it in a
// transaction: a per-day lock keeps two students arriving together from sharing a seat.
func MarkAttendance(ctx context.Context, q Q, userID uuid.UUID, day, now time.Time) error {
	if _, err := q.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('attendance:' || $1::date::text))`, day); err != nil {
		return fmt.Errorf("attendance lock: %w", err)
	}
	_, err := q.Exec(ctx, `
		INSERT INTO attendance (user_id, day, seat, first_seen_at)
		SELECT $1, $2::date, (SELECT count(*) + 1 FROM attendance a WHERE a.day = $2::date), $3
		ON CONFLICT (user_id, day) DO NOTHING`, userID, day, now)
	return err
}

// AttendanceMarks lists a student's visits between two local dates, inclusive.
func AttendanceMarks(ctx context.Context, q Q, userID uuid.UUID, from, to time.Time) ([]domain.AttendanceMark, error) {
	rows, err := q.Query(ctx, `SELECT day, seat, first_seen_at FROM attendance
		WHERE user_id = $1 AND day BETWEEN $2::date AND $3::date ORDER BY day`, userID, from, to)
	if err != nil {
		return nil, fmt.Errorf("attendance: %w", err)
	}
	defer rows.Close()
	out := []domain.AttendanceMark{}
	for rows.Next() {
		var m domain.AttendanceMark
		if err := rows.Scan(&m.Day, &m.Seat, &m.FirstSeen); err != nil {
			return nil, fmt.Errorf("scan attendance: %w", err)
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// SignOutEverywhere revokes every refresh token the user holds and refuses access tokens
// issued before now, so every device has to sign in with GitHub again.
func SignOutEverywhere(ctx context.Context, q Q, userID uuid.UUID, now time.Time) error {
	if _, err := q.Exec(ctx, "UPDATE refresh_tokens SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL", userID, now); err != nil {
		return err
	}
	if _, err := q.Exec(ctx, "DELETE FROM login_codes WHERE user_id = $1", userID); err != nil {
		return err
	}
	_, err := q.Exec(ctx, "UPDATE users SET signed_out_at = $2 WHERE id = $1", userID, now)
	return err
}

// UserKind narrows the people directory.
type UserKind string

// Directory filters.
const (
	UsersAll        UserKind = "all"
	UsersInterns    UserKind = "interns"    // an active or paused internship
	UsersApplicants UserKind = "applicants" // signed in, no internship yet
	UsersStaff      UserKind = "staff"
	UsersToday      UserKind = "today" // seen in the last 24 hours
)

// UserFilter is what the directory is asked for.
type UserFilter struct {
	College *uuid.UUID // college admins only see their college
	Search  string
	Cohort  *uuid.UUID
	Flow    *uuid.UUID
	Kind    UserKind
	Offset  int
	Limit   int
}

// UserDirRow is one person in the directory with their latest internship.
type UserDirRow struct {
	User         domain.User
	CreatedAt    time.Time
	LastSeen     *time.Time
	Enrollment   *domain.Enrollment
	CohortID     *uuid.UUID
	CohortName   *string
	CollegeName  *string
	Applications int
}

// ListUsers returns everyone who has signed in or been added, most recently seen first.
func ListUsers(ctx context.Context, q Q, f UserFilter, now time.Time) ([]UserDirRow, error) {
	args := []any{}
	where := []string{"TRUE"}
	add := func(cond string, v any) {
		args = append(args, v)
		where = append(where, strings.ReplaceAll(cond, "?", fmt.Sprintf("$%d", len(args))))
	}
	if f.College != nil {
		add("(u.college_id = ? OR le.college_id = ?)", *f.College)
	}
	if f.Search != "" {
		add("(u.name ILIKE ? OR u.github_login ILIKE ? OR u.email ILIKE ?)", likePattern(f.Search))
	}
	if f.Cohort != nil {
		add("le.cohort_id = ?", *f.Cohort)
	}
	if f.Flow != nil {
		add("le.flow_id = ?", *f.Flow)
	}
	switch f.Kind {
	case UsersInterns:
		where = append(where, "le.status IN ('active', 'paused')")
	case UsersApplicants:
		where = append(where, "u.role = 'student' AND le.id IS NULL")
	case UsersStaff:
		where = append(where, "u.role <> 'student'")
	case UsersToday:
		add("u.last_seen_at > ?", now.Add(-24*time.Hour))
	case UsersAll, "":
	}
	args = append(args, f.Limit, f.Offset)
	sql := `
		SELECT ` + userCols + `, u.created_at, u.last_seen_at,
		       le.id, le.user_id, le.college_id, le.slug, le.days, le.track, le.start_date, le.end_date, le.timezone, le.status,
		       le.flow_id, le.version_id, le.flow_name, le.version_number, le.cohort_id, le.cohort_name, cl.name,
		       (SELECT count(*) FROM applications a WHERE a.user_id = u.id)::int
		FROM users u
		LEFT JOIN LATERAL (
			SELECT e.id, e.user_id, COALESCE(c.college_id, u.college_id) AS college_id, p.slug, p.days, p.track, e.start_date, e.end_date,
			       e.timezone, e.status, f.id AS flow_id, fv.id AS version_id, f.name AS flow_name, fv.number AS version_number,
			       c.id AS cohort_id, c.name AS cohort_name
			FROM enrollments e
			JOIN programs p ON p.id = e.program_id
			LEFT JOIN cohorts c ON c.id = e.cohort_id
			LEFT JOIN flow_versions fv ON fv.id = e.flow_version_id
			LEFT JOIN flows f ON f.id = fv.flow_id
			WHERE e.user_id = u.id
			ORDER BY (e.status IN ('active', 'paused')) DESC, e.start_date DESC
			LIMIT 1
		) le ON TRUE
		LEFT JOIN colleges cl ON cl.id = COALESCE(le.college_id, u.college_id)
		WHERE ` + strings.Join(where, " AND ") + fmt.Sprintf(`
		ORDER BY u.last_seen_at DESC NULLS LAST, lower(u.name), u.id
		LIMIT $%d OFFSET $%d`, len(args)-1, len(args))
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()
	out := []UserDirRow{}
	for rows.Next() {
		var r UserDirRow
		var role string
		var eid, euser *uuid.UUID
		var ecollege *uuid.UUID
		var slug, track, tz, status *string
		var days *int
		var start, end *time.Time
		var fl enrollmentFlowCols
		if err := rows.Scan(&r.User.ID, &r.User.GitHubID, &r.User.GitHubLogin, &r.User.Name, &r.User.Email, &r.User.AvatarURL, &role, &r.User.CollegeID,
			&r.CreatedAt, &r.LastSeen, &eid, &euser, &ecollege, &slug, &days, &track, &start, &end, &tz, &status,
			&fl.flowID, &fl.versionID, &fl.name, &fl.number, &r.CohortID, &r.CohortName, &r.CollegeName, &r.Applications); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		r.User.Role = domain.Role(role)
		if eid != nil && euser != nil && slug != nil && days != nil && track != nil && start != nil && end != nil && tz != nil && status != nil {
			e := domain.Enrollment{ID: *eid, UserID: *euser, CollegeID: ecollege, StartDate: *start, EndDate: *end, Timezone: *tz,
				Status: domain.EnrollmentStatus(*status), Flow: fl.flow()}
			e.Program.Slug, e.Program.Days, e.Program.Track = *slug, *days, *track
			r.Enrollment = &e
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// UserMeta is what the profile shows beyond the user row.
type UserMeta struct {
	CreatedAt   time.Time
	LastSeen    *time.Time
	SignedOutAt *time.Time
}

// GetUserMeta loads when a user joined, was last seen and was last signed out everywhere.
func GetUserMeta(ctx context.Context, q Q, id uuid.UUID) (UserMeta, error) {
	var m UserMeta
	err := q.QueryRow(ctx, "SELECT created_at, last_seen_at, signed_out_at FROM users WHERE id = $1", id).Scan(&m.CreatedAt, &m.LastSeen, &m.SignedOutAt)
	return m, notFound(err)
}

// EnrollmentSummary is one internship on a profile.
type EnrollmentSummary struct {
	Enrollment  domain.Enrollment
	CohortName  *string
	CollegeName *string
}

// UserEnrollments lists every internship the user has had, newest first.
func UserEnrollments(ctx context.Context, q Q, userID uuid.UUID) ([]EnrollmentSummary, error) {
	rows, err := q.Query(ctx, `
		SELECT e.id, e.user_id, COALESCE(c.college_id, u.college_id), p.slug, p.days, p.track,
		       e.start_date, e.end_date, e.timezone, e.status, f.id, fv.id, f.name, fv.number, c.name, cl.name
		FROM enrollments e
		JOIN programs p ON p.id = e.program_id
		JOIN users u ON u.id = e.user_id
		LEFT JOIN cohorts c ON c.id = e.cohort_id
		LEFT JOIN colleges cl ON cl.id = COALESCE(c.college_id, u.college_id)
		LEFT JOIN flow_versions fv ON fv.id = e.flow_version_id
		LEFT JOIN flows f ON f.id = fv.flow_id
		WHERE e.user_id = $1
		ORDER BY e.start_date DESC, e.id`, userID)
	if err != nil {
		return nil, fmt.Errorf("user enrollments: %w", err)
	}
	defer rows.Close()
	out := []EnrollmentSummary{}
	for rows.Next() {
		var s EnrollmentSummary
		var status string
		var fl enrollmentFlowCols
		e := &s.Enrollment
		if err := rows.Scan(&e.ID, &e.UserID, &e.CollegeID, &e.Program.Slug, &e.Program.Days, &e.Program.Track,
			&e.StartDate, &e.EndDate, &e.Timezone, &status, &fl.flowID, &fl.versionID, &fl.name, &fl.number, &s.CohortName, &s.CollegeName); err != nil {
			return nil, fmt.Errorf("scan enrollment: %w", err)
		}
		e.Status = domain.EnrollmentStatus(status)
		e.Flow = fl.flow()
		out = append(out, s)
	}
	return out, rows.Err()
}

// ApplicationSummary is one application on a profile.
type ApplicationSummary struct {
	ID         uuid.UUID
	Status     domain.ApplicationStatus
	CohortName string
	Phone      string
	College    string
	CreatedAt  time.Time
}

// UserApplications lists the user's applications, newest first.
func UserApplications(ctx context.Context, q Q, userID uuid.UUID) ([]ApplicationSummary, error) {
	rows, err := q.Query(ctx, `SELECT a.id, a.status, c.name, a.phone, a.college, a.created_at FROM applications a
		JOIN cohorts c ON c.id = a.cohort_id WHERE a.user_id = $1 ORDER BY a.created_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("user applications: %w", err)
	}
	defer rows.Close()
	out := []ApplicationSummary{}
	for rows.Next() {
		var a ApplicationSummary
		var st string
		if err := rows.Scan(&a.ID, &st, &a.CohortName, &a.Phone, &a.College, &a.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan application: %w", err)
		}
		a.Status = domain.ApplicationStatus(st)
		out = append(out, a)
	}
	return out, rows.Err()
}

// StaffNote is a private note staff keep about a person.
type StaffNote struct {
	ID         uuid.UUID
	SubjectID  uuid.UUID
	AuthorID   uuid.UUID
	AuthorName string
	Body       string
	DoneAt     *time.Time
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

const staffNoteSelect = `SELECT n.id, n.subject_id, n.author_id, a.name, n.body, n.done_at, n.created_at, n.updated_at
	FROM staff_notes n JOIN users a ON a.id = n.author_id`

func scanStaffNote(row interface{ Scan(...any) error }) (StaffNote, error) {
	var n StaffNote
	err := row.Scan(&n.ID, &n.SubjectID, &n.AuthorID, &n.AuthorName, &n.Body, &n.DoneAt, &n.CreatedAt, &n.UpdatedAt)
	return n, notFound(err)
}

// ListStaffNotes lists notes about a person: open ones first, newest first.
func ListStaffNotes(ctx context.Context, q Q, subject uuid.UUID) ([]StaffNote, error) {
	rows, err := q.Query(ctx, staffNoteSelect+` WHERE n.subject_id = $1 ORDER BY (n.done_at IS NOT NULL), n.created_at DESC, n.id`, subject)
	if err != nil {
		return nil, fmt.Errorf("staff notes: %w", err)
	}
	defer rows.Close()
	out := []StaffNote{}
	for rows.Next() {
		n, err := scanStaffNote(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// GetStaffNote loads one note.
func GetStaffNote(ctx context.Context, q Q, id uuid.UUID) (StaffNote, error) {
	return scanStaffNote(q.QueryRow(ctx, staffNoteSelect+` WHERE n.id = $1`, id))
}

// InsertStaffNote adds a note.
func InsertStaffNote(ctx context.Context, q Q, subject, author uuid.UUID, body string, now time.Time) (uuid.UUID, error) {
	var id uuid.UUID
	err := q.QueryRow(ctx, `INSERT INTO staff_notes (subject_id, author_id, body, created_at, updated_at) VALUES ($1, $2, $3, $4, $4) RETURNING id`,
		subject, author, body, now).Scan(&id)
	return id, err
}

// UpdateStaffNote changes the text and whether it's done.
func UpdateStaffNote(ctx context.Context, q Q, id uuid.UUID, body string, done *time.Time, now time.Time) error {
	_, err := q.Exec(ctx, "UPDATE staff_notes SET body = $2, done_at = $3, updated_at = $4 WHERE id = $1", id, body, done, now)
	return err
}

// DeleteStaffNote removes a note.
func DeleteStaffNote(ctx context.Context, q Q, id uuid.UUID) error {
	_, err := q.Exec(ctx, "DELETE FROM staff_notes WHERE id = $1", id)
	return err
}
