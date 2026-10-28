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

// ---- Payment settings ----

// PaymentSettings is where applicants pay. QR is nil until an admin uploads one.
type PaymentSettings struct {
	UPIID     string
	PayeeName string
	Note      string
	HasQR     bool
	UpdatedAt time.Time
}

// ensurePaymentRow recreates the single settings row if a reset or flush removed it.
func ensurePaymentRow(ctx context.Context, q Q) error {
	_, err := q.Exec(ctx, `INSERT INTO payment_settings DEFAULT VALUES ON CONFLICT DO NOTHING`)
	return err
}

// GetPaymentSettings loads the single settings row.
func GetPaymentSettings(ctx context.Context, q Q) (PaymentSettings, error) {
	if err := ensurePaymentRow(ctx, q); err != nil {
		return PaymentSettings{}, err
	}
	var s PaymentSettings
	err := q.QueryRow(ctx, `SELECT upi_id, payee_name, note, qr_image IS NOT NULL, updated_at FROM payment_settings`).
		Scan(&s.UPIID, &s.PayeeName, &s.Note, &s.HasQR, &s.UpdatedAt)
	return s, err
}

// SetPaymentDetails updates the UPI ID, payee and note.
func SetPaymentDetails(ctx context.Context, q Q, upi, payee, note string, by uuid.UUID, now time.Time) error {
	if err := ensurePaymentRow(ctx, q); err != nil {
		return err
	}
	_, err := q.Exec(ctx, `UPDATE payment_settings SET upi_id = $1, payee_name = $2, note = $3, updated_by = $4, updated_at = $5`, upi, payee, note, by, now)
	return err
}

// SetPaymentQR replaces the QR image.
func SetPaymentQR(ctx context.Context, q Q, image []byte, typ string, by uuid.UUID, now time.Time) error {
	if err := ensurePaymentRow(ctx, q); err != nil {
		return err
	}
	_, err := q.Exec(ctx, `UPDATE payment_settings SET qr_image = $1, qr_type = $2, updated_by = $3, updated_at = $4`, image, typ, by, now)
	return err
}

// GetPaymentQR returns the QR image, or ErrNotFound.
func GetPaymentQR(ctx context.Context, q Q) ([]byte, string, error) {
	var img []byte
	var typ *string
	if err := q.QueryRow(ctx, `SELECT qr_image, qr_type FROM payment_settings`).Scan(&img, &typ); err != nil {
		return nil, "", notFound(err)
	}
	if img == nil || typ == nil {
		return nil, "", ErrNotFound
	}
	return img, *typ, nil
}

// ---- Applications ----

const appCols = `a.id, a.user_id, a.cohort_id, a.status, a.full_name, a.phone, a.date_of_birth, a.college, a.course, a.branch, a.grad_year,
	a.fee_inr, a.paid_inr, a.flag, a.flag_note, a.decided_at, a.enrollment_id, a.version, a.created_at, a.updated_at`

func scanApplication(row pgx.Row) (domain.Application, error) {
	var a domain.Application
	var status string
	var flag *string
	err := row.Scan(&a.ID, &a.UserID, &a.CohortID, &status, &a.Details.FullName, &a.Details.Phone, &a.Details.DateOfBirth, &a.Details.College,
		&a.Details.Course, &a.Details.Branch, &a.Details.GradYear, &a.FeeINR, &a.PaidINR, &flag, &a.FlagNote, &a.DecidedAt, &a.EnrollmentID,
		&a.Version, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return domain.Application{}, notFound(err)
	}
	a.Status = domain.ApplicationStatus(status)
	if !a.Status.Valid() {
		return domain.Application{}, fmt.Errorf("application %s has unknown status %q", a.ID, status)
	}
	if flag != nil {
		f := domain.ApplicationFlag(*flag)
		if !f.Valid() {
			return domain.Application{}, fmt.Errorf("application %s has unknown flag %q", a.ID, *flag)
		}
		a.Flag = &f
	}
	return a, nil
}

// OpenApplication returns the student's application in progress, locking it when asked.
func OpenApplication(ctx context.Context, q Q, userID uuid.UUID, forUpdate bool) (domain.Application, error) {
	lock := ""
	if forUpdate {
		lock = " FOR UPDATE"
	}
	return scanApplication(q.QueryRow(ctx, `SELECT `+appCols+` FROM applications a
		WHERE a.user_id = $1 AND a.status IN ('draft', 'submitted', 'flagged')`+lock, userID))
}

// LatestApplication returns the student's application in progress, or else their newest one.
func LatestApplication(ctx context.Context, q Q, userID uuid.UUID) (domain.Application, error) {
	return scanApplication(q.QueryRow(ctx, `SELECT `+appCols+` FROM applications a WHERE a.user_id = $1
		ORDER BY (a.status IN ('draft', 'submitted', 'flagged')) DESC, a.created_at DESC, a.id DESC LIMIT 1`, userID))
}

// GetApplication loads one application, locking it when asked.
func GetApplication(ctx context.Context, q Q, id uuid.UUID, forUpdate bool) (domain.Application, error) {
	lock := ""
	if forUpdate {
		lock = " FOR UPDATE"
	}
	return scanApplication(q.QueryRow(ctx, `SELECT `+appCols+` FROM applications a WHERE a.id = $1`+lock, id))
}

// ErrOpenApplication means the student already has an application in progress.
var ErrOpenApplication = errors.New("store: application already open")

// InsertApplication starts a draft.
func InsertApplication(ctx context.Context, q Q, userID, cohortID uuid.UUID, d domain.ApplicantDetails, fee int, now time.Time) (domain.Application, error) {
	a, err := scanApplication(q.QueryRow(ctx, `
		INSERT INTO applications AS a (user_id, cohort_id, status, full_name, phone, date_of_birth, college, course, branch, grad_year, fee_inr, created_at, updated_at)
		VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10, $11, $11) RETURNING `+appCols,
		userID, cohortID, d.FullName, d.Phone, d.DateOfBirth, d.College, d.Course, d.Branch, d.GradYear, fee, now))
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23505" {
		return domain.Application{}, ErrOpenApplication
	}
	return a, err
}

// SaveApplication writes every mutable field and bumps the version.
func SaveApplication(ctx context.Context, q Q, a domain.Application, now time.Time) (domain.Application, error) {
	var flag *string
	if a.Flag != nil {
		f := string(*a.Flag)
		flag = &f
	}
	d := a.Details
	return scanApplication(q.QueryRow(ctx, `
		UPDATE applications AS a SET cohort_id = $2, status = $3, full_name = $4, phone = $5, date_of_birth = $6, college = $7, course = $8,
		       branch = $9, grad_year = $10, fee_inr = $11, paid_inr = $12, flag = $13, flag_note = $14, decided_at = $15, enrollment_id = $16,
		       version = a.version + 1, updated_at = $17
		WHERE a.id = $1 RETURNING `+appCols,
		a.ID, a.CohortID, string(a.Status), d.FullName, d.Phone, d.DateOfBirth, d.College, d.Course, d.Branch, d.GradYear, a.FeeINR, a.PaidINR,
		flag, a.FlagNote, a.DecidedAt, a.EnrollmentID, now))
}

// SetDecidedBy records which admin last decided (audit only).
func SetDecidedBy(ctx context.Context, q Q, id, by uuid.UUID) error {
	_, err := q.Exec(ctx, `UPDATE applications SET decided_by = $2 WHERE id = $1`, id, by)
	return err
}

// MarkApplicationUnread flags new activity for the other side.
func MarkApplicationUnread(ctx context.Context, q Q, id uuid.UUID, forStaff bool) error {
	col := "unread_student"
	if forStaff {
		col = "unread_staff"
	}
	_, err := q.Exec(ctx, `UPDATE applications SET `+col+` = true WHERE id = $1`, id)
	return err
}

// MarkApplicationRead clears one side's unread flag.
func MarkApplicationRead(ctx context.Context, q Q, id uuid.UUID, staff bool) error {
	col := "unread_student"
	if staff {
		col = "unread_staff"
	}
	_, err := q.Exec(ctx, `UPDATE applications SET `+col+` = false WHERE id = $1`, id)
	return err
}

// ApplicationRow is a queue entry: the application with its applicant and cohort.
type ApplicationRow struct {
	App         domain.Application
	Applicant   domain.User
	CohortName  string
	CollegeName *string
	Proofs      int
	UnreadStaff bool
}

// ListApplications returns applications in the admin's scope, oldest activity first for open
// ones. status nil means every open application.
func ListApplications(ctx context.Context, q Q, college *uuid.UUID, status *domain.ApplicationStatus, limit int) ([]ApplicationRow, error) {
	var st *string
	if status != nil {
		s := string(*status)
		st = &s
	}
	rows, err := q.Query(ctx, `SELECT `+appCols+`, `+userCols+`, co.name, cl.name,
		       (SELECT count(*) FROM payment_proofs pp WHERE pp.application_id = a.id)::int, a.unread_staff
		FROM applications a
		JOIN users u ON u.id = a.user_id
		JOIN cohorts co ON co.id = a.cohort_id
		LEFT JOIN colleges cl ON cl.id = co.college_id
		WHERE ($1::uuid IS NULL OR co.college_id = $1)
		  AND (($2::text IS NULL AND a.status IN ('draft', 'submitted', 'flagged')) OR a.status = $2)
		ORDER BY (a.status = 'submitted') DESC, a.updated_at, a.id
		LIMIT $3`, college, st, limit)
	if err != nil {
		return nil, fmt.Errorf("list applications: %w", err)
	}
	defer rows.Close()
	out := []ApplicationRow{}
	for rows.Next() {
		var r ApplicationRow
		app, user, err := scanAppAndUser(rows, &r.CohortName, &r.CollegeName, &r.Proofs, &r.UnreadStaff)
		if err != nil {
			return nil, err
		}
		r.App, r.Applicant = app, user
		out = append(out, r)
	}
	return out, rows.Err()
}

// ---- Proofs ----

// ProofMeta is a payment screenshot without its bytes.
type ProofMeta struct {
	ID         uuid.UUID
	UTR        string
	AmountINR  int
	ImageType  string
	UploadedAt time.Time
	Duplicate  bool // the same image or UTR appears on another application
}

// InsertProof stores a screenshot.
func InsertProof(ctx context.Context, q Q, appID uuid.UUID, p domain.Proof, now time.Time) (uuid.UUID, error) {
	var id uuid.UUID
	err := q.QueryRow(ctx, `INSERT INTO payment_proofs (application_id, image, image_type, sha256, utr, amount_inr, uploaded_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`, appID, p.Image, p.Type, p.SHA256, p.UTR, p.Amount, now).Scan(&id)
	return id, err
}

// ProofUsedElsewhere reports whether the image or UTR was already sent for another application.
func ProofUsedElsewhere(ctx context.Context, q Q, appID uuid.UUID, sha, utr string) (bool, error) {
	var used bool
	err := q.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM payment_proofs WHERE application_id <> $1 AND (sha256 = $2 OR utr = $3))`, appID, sha, utr).Scan(&used)
	return used, err
}

// ProofUsedHere reports whether this application already has the same image or UTR.
func ProofUsedHere(ctx context.Context, q Q, appID uuid.UUID, sha, utr string) (bool, error) {
	var used bool
	err := q.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM payment_proofs WHERE application_id = $1 AND (sha256 = $2 OR utr = $3))`, appID, sha, utr).Scan(&used)
	return used, err
}

// ListProofs returns an application's screenshots, oldest first, without their bytes.
func ListProofs(ctx context.Context, q Q, appID uuid.UUID) ([]ProofMeta, error) {
	rows, err := q.Query(ctx, `SELECT p.id, p.utr, p.amount_inr, p.image_type, p.uploaded_at,
		       EXISTS (SELECT 1 FROM payment_proofs o WHERE o.application_id <> p.application_id AND (o.sha256 = p.sha256 OR o.utr = p.utr))
		FROM payment_proofs p WHERE p.application_id = $1 ORDER BY p.uploaded_at, p.seq`, appID)
	if err != nil {
		return nil, fmt.Errorf("list proofs: %w", err)
	}
	defer rows.Close()
	out := []ProofMeta{}
	for rows.Next() {
		var m ProofMeta
		if err := rows.Scan(&m.ID, &m.UTR, &m.AmountINR, &m.ImageType, &m.UploadedAt, &m.Duplicate); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// ProofImage returns a screenshot's bytes if it belongs to the application.
func ProofImage(ctx context.Context, q Q, appID, proofID uuid.UUID) ([]byte, string, error) {
	var img []byte
	var typ string
	err := q.QueryRow(ctx, `SELECT image, image_type FROM payment_proofs WHERE id = $1 AND application_id = $2`, proofID, appID).Scan(&img, &typ)
	return img, typ, notFound(err)
}

// ---- Messages ----

// AppMessage is one message in an application's chat.
type AppMessage struct {
	ID        uuid.UUID
	Author    domain.ApplicationAuthor
	Body      string
	ClientID  *uuid.UUID
	CreatedAt time.Time
}

// InsertAppMessage stores a message; a reused client id returns the original (created false).
func InsertAppMessage(ctx context.Context, q Q, appID uuid.UUID, author domain.ApplicationAuthor, by *uuid.UUID, body string, clientID *uuid.UUID, now time.Time) (AppMessage, bool, error) {
	var m AppMessage
	var a string
	err := q.QueryRow(ctx, `INSERT INTO application_messages (application_id, author, sent_by, body, client_id, created_at)
		VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (client_id) DO NOTHING
		RETURNING id, author, body, client_id, created_at`, appID, string(author), by, body, clientID, now).Scan(&m.ID, &a, &m.Body, &m.ClientID, &m.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) && clientID != nil {
		err = q.QueryRow(ctx, `SELECT id, author, body, client_id, created_at FROM application_messages WHERE client_id = $1 AND application_id = $2`,
			*clientID, appID).Scan(&m.ID, &a, &m.Body, &m.ClientID, &m.CreatedAt)
		m.Author = domain.ApplicationAuthor(a)
		return m, false, notFound(err)
	}
	m.Author = domain.ApplicationAuthor(a)
	return m, err == nil, err
}

// ListAppMessages returns an application's chat, oldest first.
func ListAppMessages(ctx context.Context, q Q, appID uuid.UUID) ([]AppMessage, error) {
	rows, err := q.Query(ctx, `SELECT id, author, body, client_id, created_at FROM application_messages
		WHERE application_id = $1 ORDER BY created_at, seq LIMIT 500`, appID)
	if err != nil {
		return nil, fmt.Errorf("list application messages: %w", err)
	}
	defer rows.Close()
	out := []AppMessage{}
	for rows.Next() {
		var m AppMessage
		var a string
		if err := rows.Scan(&m.ID, &a, &m.Body, &m.ClientID, &m.CreatedAt); err != nil {
			return nil, err
		}
		m.Author = domain.ApplicationAuthor(a)
		if !m.Author.Valid() {
			return nil, fmt.Errorf("application message %s has unknown author %q", m.ID, a)
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// CountAppMessagesSince counts an applicant's messages since a time (rate limit).
func CountAppMessagesSince(ctx context.Context, q Q, appID uuid.UUID, since time.Time) (int, error) {
	var n int
	err := q.QueryRow(ctx, `SELECT count(*) FROM application_messages WHERE application_id = $1 AND author = 'applicant' AND created_at >= $2`, appID, since).Scan(&n)
	return n, err
}

// CountProofsSince counts an application's uploads since a time (rate limit).
func CountProofsSince(ctx context.Context, q Q, appID uuid.UUID, since time.Time) (int, error) {
	var n int
	err := q.QueryRow(ctx, `SELECT count(*) FROM payment_proofs WHERE application_id = $1 AND uploaded_at >= $2`, appID, since).Scan(&n)
	return n, err
}

// CountWaitingApplications counts submitted applications in scope (the admin nav badge).
func CountWaitingApplications(ctx context.Context, q Q, college *uuid.UUID) (int, error) {
	var n int
	err := q.QueryRow(ctx, `SELECT count(*) FROM applications a JOIN cohorts co ON co.id = a.cohort_id
		WHERE a.status = 'submitted' AND ($1::uuid IS NULL OR co.college_id = $1)`, college).Scan(&n)
	return n, err
}

// scanAppAndUser reads appCols, userCols and any extra columns, in that order.
func scanAppAndUser(rows pgx.Rows, extra ...any) (domain.Application, domain.User, error) {
	var a domain.Application
	var u domain.User
	var status, role string
	var flag *string
	dest := []any{&a.ID, &a.UserID, &a.CohortID, &status, &a.Details.FullName, &a.Details.Phone, &a.Details.DateOfBirth, &a.Details.College,
		&a.Details.Course, &a.Details.Branch, &a.Details.GradYear, &a.FeeINR, &a.PaidINR, &flag, &a.FlagNote, &a.DecidedAt, &a.EnrollmentID,
		&a.Version, &a.CreatedAt, &a.UpdatedAt,
		&u.ID, &u.GitHubID, &u.GitHubLogin, &u.Name, &u.Email, &u.AvatarURL, &role, &u.CollegeID}
	if err := rows.Scan(append(dest, extra...)...); err != nil {
		return a, u, err
	}
	a.Status, u.Role = domain.ApplicationStatus(status), domain.Role(role)
	if !a.Status.Valid() || !u.Role.Valid() {
		return a, u, fmt.Errorf("application %s: unknown status %q or role %q", a.ID, status, role)
	}
	if flag != nil {
		f := domain.ApplicationFlag(*flag)
		if !f.Valid() {
			return a, u, fmt.Errorf("application %s has unknown flag %q", a.ID, *flag)
		}
		a.Flag = &f
	}
	return a, u, nil
}
