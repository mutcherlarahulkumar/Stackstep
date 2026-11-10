package store

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

// EventMail is fired once per mail; the encoder fans it out to its readers.
const EventMail EventKind = "mail"

// NewMail is a letter before it is stored.
type NewMail struct {
	Kind           domain.MailKind
	Subject, Body  string
	FromName       string
	PersonaID      *uuid.UUID
	AnnouncementID *uuid.UUID
	TaskID         *uuid.UUID
	ClassID        *uuid.UUID
}

// Mail is one letter as a reader sees it.
type Mail struct {
	ID             uuid.UUID
	Kind           domain.MailKind
	Subject, Body  string
	FromName       string
	PersonaID      *uuid.UUID
	AnnouncementID *uuid.UUID
	TaskID         *uuid.UUID
	ClassID        *uuid.UUID
	CreatedAt      time.Time
	ReadAt         *time.Time
	Seq            int64 // mailbox position, newest highest
}

// InsertMail stores a letter for the given readers (duplicates ignored) and fires EventMail.
func InsertMail(ctx context.Context, q Q, m NewMail, to []uuid.UUID, now time.Time) (uuid.UUID, error) {
	var id uuid.UUID
	if err := q.QueryRow(ctx, `INSERT INTO mails (kind, subject, body, from_name, persona_id, announcement_id, task_id, class_id, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
		string(m.Kind), m.Subject, m.Body, m.FromName, m.PersonaID, m.AnnouncementID, m.TaskID, m.ClassID, now).Scan(&id); err != nil {
		return uuid.Nil, fmt.Errorf("insert mail: %w", err)
	}
	if _, err := q.Exec(ctx, `INSERT INTO mail_recipients (mail_id, user_id, created_at)
		SELECT $1, u, $3 FROM unnest($2::uuid[]) AS u ON CONFLICT DO NOTHING`, id, to, now); err != nil {
		return uuid.Nil, fmt.Errorf("insert mail recipients: %w", err)
	}
	return id, Notify(ctx, q, Event{Kind: EventMail, ID: id})
}

const mailCols = `m.id, m.kind, m.subject, m.body, m.from_name, m.persona_id, m.announcement_id, m.task_id, m.class_id, m.created_at, r.read_at, r.seq`

func scanMail(row interface{ Scan(...any) error }) (Mail, error) {
	var m Mail
	var kind string
	err := row.Scan(&m.ID, &kind, &m.Subject, &m.Body, &m.FromName, &m.PersonaID, &m.AnnouncementID, &m.TaskID, &m.ClassID, &m.CreatedAt, &m.ReadAt, &m.Seq)
	m.Kind = domain.MailKind(kind)
	return m, notFound(err)
}

// MailCursor is the keyset position after a letter.
func MailCursor(m Mail) Cursor { return Cursor{Key: strconv.FormatInt(m.Seq, 10), ID: m.ID} }

// ListMail is a reader's mailbox, newest first.
func ListMail(ctx context.Context, q Q, userID uuid.UUID, before *Cursor, limit int) ([]Mail, error) {
	var seq *int64
	if before != nil {
		n, err := strconv.ParseInt(before.Key, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("bad mail cursor: %w", err)
		}
		seq = &n
	}
	rows, err := q.Query(ctx, `SELECT `+mailCols+` FROM mail_recipients r JOIN mails m ON m.id = r.mail_id
		WHERE r.user_id = $1 AND ($2::bigint IS NULL OR r.seq < $2)
		ORDER BY r.seq DESC LIMIT $3`, userID, seq, limit)
	if err != nil {
		return nil, fmt.Errorf("list mail: %w", err)
	}
	defer rows.Close()
	out := []Mail{}
	for rows.Next() {
		m, err := scanMail(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// GetMail loads one letter for one reader (ErrNotFound if it isn't theirs).
func GetMail(ctx context.Context, q Q, userID, id uuid.UUID) (Mail, error) {
	return scanMail(q.QueryRow(ctx, `SELECT `+mailCols+` FROM mail_recipients r JOIN mails m ON m.id = r.mail_id
		WHERE r.user_id = $1 AND r.mail_id = $2`, userID, id))
}

// MarkMailRead marks a reader's letter read (once; later calls keep the first time).
func MarkMailRead(ctx context.Context, q Q, userID, id uuid.UUID, now time.Time) error {
	tag, err := q.Exec(ctx, `UPDATE mail_recipients SET read_at = COALESCE(read_at, $3) WHERE user_id = $1 AND mail_id = $2`, userID, id, now)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// UnreadMail counts a reader's unread letters.
func UnreadMail(ctx context.Context, q Q, userID uuid.UUID) (int, error) {
	var n int
	err := q.QueryRow(ctx, `SELECT count(*) FROM mail_recipients WHERE user_id = $1 AND read_at IS NULL`, userID).Scan(&n)
	return n, err
}

// MailReaders lists who a letter went to, with the open enrollment of each (for realtime).
func MailReaders(ctx context.Context, q Q, id uuid.UUID) ([]uuid.UUID, error) {
	rows, err := q.Query(ctx, `SELECT e.id FROM mail_recipients r JOIN enrollments e ON e.user_id = r.user_id AND e.status IN ('active', 'paused')
		WHERE r.mail_id = $1`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []uuid.UUID{}
	for rows.Next() {
		var e uuid.UUID
		if err := rows.Scan(&e); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// GetMailHead loads a letter's subject and kind (no reader check), for realtime frames.
func GetMailHead(ctx context.Context, q Q, id uuid.UUID) (Mail, error) {
	var m Mail
	var kind string
	err := q.QueryRow(ctx, `SELECT id, kind, subject, from_name, created_at FROM mails WHERE id = $1`, id).Scan(&m.ID, &kind, &m.Subject, &m.FromName, &m.CreatedAt)
	m.Kind = domain.MailKind(kind)
	return m, notFound(err)
}

// AudienceStudents resolves an announcement's readers: students with an open internship
// (active or paused) on the flow or in the cohort, limited to a college when college is set.
func AudienceStudents(ctx context.Context, q Q, a domain.Audience, flow, cohort, college *uuid.UUID) ([]uuid.UUID, error) {
	// A student without a cohort belongs to their own college, as everywhere else.
	rows, err := q.Query(ctx, `SELECT DISTINCT e.user_id FROM enrollments e
		JOIN users u ON u.id = e.user_id
		LEFT JOIN cohorts co ON co.id = e.cohort_id
		LEFT JOIN flow_versions fv ON fv.id = e.flow_version_id
		WHERE e.status IN ('active', 'paused')
		  AND ($1 <> 'flow' OR fv.flow_id = $2)
		  AND ($1 <> 'cohort' OR e.cohort_id = $3)
		  AND ($4::uuid IS NULL OR COALESCE(co.college_id, u.college_id) = $4)`, string(a), flow, cohort, college)
	if err != nil {
		return nil, fmt.Errorf("audience: %w", err)
	}
	defer rows.Close()
	out := []uuid.UUID{}
	for rows.Next() {
		var u uuid.UUID
		if err := rows.Scan(&u); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// Announcement is a sent announcement with how many have read it.
type Announcement struct {
	ID         uuid.UUID
	Subject    string
	Body       string
	Audience   domain.Audience
	FlowID     *uuid.UUID
	FlowName   *string
	CohortID   *uuid.UUID
	CohortName *string
	CollegeID  *uuid.UUID
	SentByID   uuid.UUID
	SentByName string
	Recipients int
	Reads      int
	CreatedAt  time.Time
}

// InsertAnnouncement stores the announcement itself (its mail is inserted separately).
func InsertAnnouncement(ctx context.Context, q Q, a Announcement, now time.Time) (uuid.UUID, error) {
	var id uuid.UUID
	err := q.QueryRow(ctx, `INSERT INTO announcements (subject, body, audience, flow_id, cohort_id, college_id, sent_by, recipients, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
		a.Subject, a.Body, string(a.Audience), a.FlowID, a.CohortID, a.CollegeID, a.SentByID, a.Recipients, now).Scan(&id)
	return id, err
}

// ListAnnouncements returns sent announcements, newest first, within a college when set.
func ListAnnouncements(ctx context.Context, q Q, college *uuid.UUID, limit int) ([]Announcement, error) {
	rows, err := q.Query(ctx, `SELECT a.id, a.subject, a.body, a.audience, a.flow_id, f.name, a.cohort_id, co.name, a.college_id, a.recipients, a.created_at,
		       (SELECT count(*) FROM mails m JOIN mail_recipients r ON r.mail_id = m.id WHERE m.announcement_id = a.id AND r.read_at IS NOT NULL)::int,
		       u.id, u.name
		FROM announcements a JOIN users u ON u.id = a.sent_by
		LEFT JOIN flows f ON f.id = a.flow_id LEFT JOIN cohorts co ON co.id = a.cohort_id
		WHERE $1::uuid IS NULL OR a.college_id = $1
		ORDER BY a.created_at DESC, a.id DESC LIMIT $2`, college, limit)
	if err != nil {
		return nil, fmt.Errorf("list announcements: %w", err)
	}
	defer rows.Close()
	out := []Announcement{}
	for rows.Next() {
		var a Announcement
		var aud string
		if err := rows.Scan(&a.ID, &a.Subject, &a.Body, &aud, &a.FlowID, &a.FlowName, &a.CohortID, &a.CohortName, &a.CollegeID, &a.Recipients, &a.CreatedAt, &a.Reads,
			&a.SentByID, &a.SentByName); err != nil {
			return nil, err
		}
		a.Audience = domain.Audience(aud)
		out = append(out, a)
	}
	return out, rows.Err()
}
