package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

// automated is true for persona messages no admin wrote: scripted and AI replies, acknowledgements
// and announcements. Clients label them so students always know when a reply was automatic.
const messageCols = "id, enrollment_id, persona_id, author, body, task_id, client_id, deliver_at, (author = 'persona' AND sent_by IS NULL)"

func scanMessage(row pgx.Row) (domain.Message, error) {
	var m domain.Message
	var author string
	if err := row.Scan(&m.ID, &m.EnrollmentID, &m.PersonaID, &author, &m.Body, &m.TaskID, &m.ClientID, &m.SentAt, &m.Automated); err != nil {
		return domain.Message{}, notFound(err)
	}
	m.Author = domain.Author(author)
	if !m.Author.Valid() {
		return domain.Message{}, fmt.Errorf("message %s has unknown author %q", m.ID, author)
	}
	return m, nil
}

// NewMessage is a message to insert.
type NewMessage struct {
	EnrollmentID uuid.UUID
	PersonaID    uuid.UUID
	// SentBy is the admin who wrote a persona message (audit only; never shown to students).
	SentBy    *uuid.UUID
	Author    domain.Author
	Body      string
	TaskID    *uuid.UUID
	ClientID  *uuid.UUID
	DeliverAt time.Time
}

// InsertMessage stores a message. Messages due now are marked delivered immediately.
// It returns (message, true) when inserted and (existing, false) when client_id was already used.
func InsertMessage(ctx context.Context, q Q, m NewMessage, now time.Time) (domain.Message, bool, error) {
	var delivered *time.Time
	if !m.DeliverAt.After(now) {
		delivered = &now
	}
	if _, err := q.Exec(ctx, `INSERT INTO chat_threads (enrollment_id, persona_id, created_at) VALUES ($1, $2, $3)
		ON CONFLICT DO NOTHING`, m.EnrollmentID, m.PersonaID, now); err != nil {
		return domain.Message{}, false, fmt.Errorf("ensure thread: %w", err)
	}
	msg, err := scanMessage(q.QueryRow(ctx, `
		INSERT INTO chat_messages (enrollment_id, persona_id, sent_by, author, body, task_id, client_id, created_at, deliver_at, delivered_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT ON CONSTRAINT chat_messages_client_id_key DO NOTHING
		RETURNING `+messageCols,
		m.EnrollmentID, m.PersonaID, m.SentBy, string(m.Author), m.Body, m.TaskID, m.ClientID, now, m.DeliverAt, delivered))
	if errors.Is(err, ErrNotFound) && m.ClientID != nil {
		existing, err := FindMessageByClientID(ctx, q, m.EnrollmentID, *m.ClientID)
		return existing, false, err
	}
	if err != nil {
		return domain.Message{}, false, err
	}
	if delivered != nil {
		if err := Notify(ctx, q, Event{Kind: EventMessage, ID: msg.ID, EnrollmentID: msg.EnrollmentID}); err != nil {
			return domain.Message{}, false, err
		}
	}
	return msg, true, nil
}

// FindMessageByClientID returns the message an enrollment stored under a client id.
func FindMessageByClientID(ctx context.Context, q Q, enrollmentID, clientID uuid.UUID) (domain.Message, error) {
	return scanMessage(q.QueryRow(ctx, "SELECT "+messageCols+" FROM chat_messages WHERE enrollment_id = $1 AND client_id = $2",
		enrollmentID, clientID))
}

// GetMessage loads a message.
func GetMessage(ctx context.Context, q Q, id uuid.UUID) (domain.Message, error) {
	return scanMessage(q.QueryRow(ctx, "SELECT "+messageCols+" FROM chat_messages WHERE id = $1", id))
}

// ListMessages returns one conversation's visible messages newest first, strictly older than before when set.
func ListMessages(ctx context.Context, q Q, enrollmentID, personaID uuid.UUID, now time.Time, before *Cursor, limit int) ([]domain.Message, error) {
	var bt *time.Time
	var bid *uuid.UUID
	if before != nil {
		t, err := before.Time()
		if err != nil {
			return nil, err
		}
		bt, bid = &t, &before.ID
	}
	rows, err := q.Query(ctx, "SELECT "+messageCols+` FROM chat_messages
		WHERE enrollment_id = $1 AND persona_id = $6 AND deliver_at <= $2
		  AND ($3::timestamptz IS NULL OR (deliver_at, id) < ($3, $4))
		ORDER BY deliver_at DESC, id DESC
		LIMIT $5`, enrollmentID, now, bt, bid, limit, personaID)
	if err != nil {
		return nil, fmt.Errorf("list messages: %w", err)
	}
	defer rows.Close()
	out := []domain.Message{}
	for rows.Next() {
		m, err := scanMessage(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// CountStudentMessagesSince counts a student's messages sent at or after since.
func CountStudentMessagesSince(ctx context.Context, q Q, enrollmentID uuid.UUID, since time.Time) (int, error) {
	var n int
	err := q.QueryRow(ctx, `SELECT count(*) FROM chat_messages
		WHERE enrollment_id = $1 AND author = 'student' AND created_at >= $2`, enrollmentID, since).Scan(&n)
	return n, err
}

// LockEnrollmentChat serializes message writes for one enrollment within a transaction.
func LockEnrollmentChat(ctx context.Context, q Q, enrollmentID uuid.UUID) error {
	_, err := q.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))", enrollmentID)
	return err
}

// DeliverDue marks up to limit due messages as delivered and notifies listeners.
// SKIP LOCKED lets several API instances run this safely at once.
func DeliverDue(ctx context.Context, q Q, now time.Time, limit int) (int, error) {
	rows, err := q.Query(ctx, `
		UPDATE chat_messages SET delivered_at = $1
		WHERE id IN (
			SELECT id FROM chat_messages
			WHERE delivered_at IS NULL AND deliver_at <= $1
			ORDER BY deliver_at
			LIMIT $2
			FOR UPDATE SKIP LOCKED)
		RETURNING id, enrollment_id`, now, limit)
	if err != nil {
		return 0, fmt.Errorf("deliver due: %w", err)
	}
	var evs []Event
	for rows.Next() {
		ev := Event{Kind: EventMessage}
		if err := rows.Scan(&ev.ID, &ev.EnrollmentID); err != nil {
			rows.Close()
			return 0, err
		}
		evs = append(evs, ev)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	for _, ev := range evs {
		if err := Notify(ctx, q, ev); err != nil {
			return 0, err
		}
	}
	return len(evs), nil
}

// Thread is one (enrollment, persona) conversation with its latest visible message.
type Thread struct {
	EnrollmentID  uuid.UUID
	Persona       domain.Persona
	LastMessage   *domain.Message
	UnreadStudent int // persona messages the student hasn't read
	UnreadStaff   int // student messages staff haven't read
	StudentName   string
	StudentLogin  string
	StudentAvatar *string
	SortAt        time.Time
}

// Unread counters and the sort key, reused in SELECT, WHERE and ORDER BY.
const (
	unreadStudentExpr = `(SELECT count(*) FROM chat_messages m WHERE m.enrollment_id = t.enrollment_id AND m.persona_id = t.persona_id
	          AND m.author = 'persona' AND m.deliver_at <= $1 AND m.deliver_at > t.student_read_at)`
	unreadStaffExpr = `(SELECT count(*) FROM chat_messages m WHERE m.enrollment_id = t.enrollment_id AND m.persona_id = t.persona_id
	          AND m.author = 'student' AND m.deliver_at > t.staff_read_at)`
	threadSortExpr = `COALESCE(lm.deliver_at, t.created_at)`
)

const threadSelect = `
	SELECT t.enrollment_id, ` + personaColsP + `,
	       lm.id, lm.enrollment_id, lm.persona_id, lm.author, lm.body, lm.task_id, lm.client_id, lm.deliver_at,
	       (lm.author = 'persona' AND lm.sent_by IS NULL),
	       ` + unreadStudentExpr + `, ` + unreadStaffExpr + `,
	       u.name, u.github_login, u.avatar_url, ` + threadSortExpr + `
	FROM chat_threads t
	JOIN personas p ON p.id = t.persona_id
	JOIN enrollments e ON e.id = t.enrollment_id
	JOIN users u ON u.id = e.user_id
	LEFT JOIN cohorts c ON c.id = e.cohort_id
	LEFT JOIN LATERAL (
		SELECT * FROM chat_messages m WHERE m.enrollment_id = t.enrollment_id AND m.persona_id = t.persona_id AND m.deliver_at <= $1
		ORDER BY m.deliver_at DESC, m.id DESC LIMIT 1) lm ON true`

func scanThread(rows pgx.Rows) (Thread, error) {
	var t Thread
	var color string
	var lm struct {
		id, enrollment, persona *uuid.UUID
		author, body            *string
		task, client            *uuid.UUID
		at                      *time.Time
		automated               *bool
	}
	if err := rows.Scan(&t.EnrollmentID, &t.Persona.ID, &t.Persona.Name, &t.Persona.Title, &color, &t.Persona.AutoReply,
		&t.Persona.Version, &t.Persona.ArchivedAt,
		&lm.id, &lm.enrollment, &lm.persona, &lm.author, &lm.body, &lm.task, &lm.client, &lm.at, &lm.automated,
		&t.UnreadStudent, &t.UnreadStaff, &t.StudentName, &t.StudentLogin, &t.StudentAvatar, &t.SortAt); err != nil {
		return Thread{}, err
	}
	t.Persona.Color = domain.PersonaColor(color)
	if lm.id != nil && lm.author != nil && lm.body != nil && lm.at != nil && lm.enrollment != nil && lm.persona != nil {
		t.LastMessage = &domain.Message{ID: *lm.id, EnrollmentID: *lm.enrollment, PersonaID: *lm.persona,
			Author: domain.Author(*lm.author), Body: *lm.body, TaskID: lm.task, ClientID: lm.client, SentAt: *lm.at,
			Automated: lm.automated != nil && *lm.automated}
	}
	return t, nil
}

// StudentThreads lists an enrollment's conversations that have at least one visible message.
func StudentThreads(ctx context.Context, q Q, enrollmentID uuid.UUID, now time.Time) ([]Thread, error) {
	rows, err := q.Query(ctx, threadSelect+`
		WHERE t.enrollment_id = $2 AND lm.id IS NOT NULL
		ORDER BY lm.deliver_at DESC
		LIMIT 100`, now, enrollmentID)
	if err != nil {
		return nil, fmt.Errorf("student threads: %w", err)
	}
	defer rows.Close()
	out := []Thread{}
	for rows.Next() {
		t, err := scanThread(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// StaffThreadFilter narrows the admin inbox.
type StaffThreadFilter struct {
	College      *uuid.UUID
	PersonaID    *uuid.UUID
	EnrollmentID *uuid.UUID // one student's conversations
	Unread       bool
	After        *Cursor
	Limit        int
}

// StaffThreads lists conversations for the admin inbox, most recent first.
func StaffThreads(ctx context.Context, q Q, now time.Time, f StaffThreadFilter) ([]Thread, error) {
	var at *time.Time
	var id *uuid.UUID
	if f.After != nil {
		t, err := f.After.Time()
		if err != nil {
			return nil, err
		}
		at, id = &t, &f.After.ID
	}
	// Keyset on (sort time, enrollment, persona) so paging never skips or repeats a row.
	var pid *uuid.UUID
	if f.After != nil {
		p, err := uuid.Parse(f.After.Extra)
		if err != nil {
			return nil, errors.New("bad cursor")
		}
		pid = &p
	}
	rows, err := q.Query(ctx, threadSelect+`
		WHERE e.status IN ('active', 'paused')
		  AND lm.id IS NOT NULL -- threads holding only scheduled announcements stay hidden until one is delivered
		  AND ($2::uuid IS NULL OR COALESCE(c.college_id, u.college_id) = $2)
		  AND ($3::uuid IS NULL OR t.persona_id = $3)
		  AND (NOT $4 OR `+unreadStaffExpr+` > 0)
		  AND ($5::timestamptz IS NULL OR (`+threadSortExpr+`, t.enrollment_id, t.persona_id) < ($5, $6, $8))
		  AND ($9::uuid IS NULL OR t.enrollment_id = $9)
		ORDER BY `+threadSortExpr+` DESC, t.enrollment_id DESC, t.persona_id DESC
		LIMIT $7`, now, f.College, f.PersonaID, f.Unread, at, id, f.Limit, pid, f.EnrollmentID)
	if err != nil {
		return nil, fmt.Errorf("staff threads: %w", err)
	}
	defer rows.Close()
	out := []Thread{}
	for rows.Next() {
		t, err := scanThread(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// MarkThreadRead records that the student (or staff) has read a conversation up to now.
func MarkThreadRead(ctx context.Context, q Q, enrollmentID, personaID uuid.UUID, byStudent bool, now time.Time) error {
	col := "staff_read_at"
	if byStudent {
		col = "student_read_at"
	}
	_, err := q.Exec(ctx, `UPDATE chat_threads SET `+col+` = GREATEST(`+col+`, $3) WHERE enrollment_id = $1 AND persona_id = $2`,
		enrollmentID, personaID, now)
	return err
}

// InboxStudentFilter narrows the student list of the admin inbox.
type InboxStudentFilter struct {
	College  *uuid.UUID
	FlowID   *uuid.UUID
	CohortID *uuid.UUID
	Search   string
	Offset   int
	Limit    int
}

// InboxStudent is one student in the admin inbox, with their conversations rolled up.
type InboxStudent struct {
	UserID       uuid.UUID
	Name, Login  string
	Avatar       *string
	EnrollmentID uuid.UUID
	Status       domain.EnrollmentStatus
	CohortName   *string
	FlowName     *string
	DayNumber    int
	Unread       int        // student messages staff haven't read, across personas
	Threads      int        // conversations with at least one message
	LastAt       *time.Time // latest visible message in any conversation
}

// InboxStudents lists every student with an open internship in scope (whether or not they've
// chatted): unread first, then most recent activity, then by name.
func InboxStudents(ctx context.Context, q Q, now time.Time, f InboxStudentFilter) ([]InboxStudent, error) {
	rows, err := q.Query(ctx, `
		SELECT u.id, u.name, u.github_login, u.avatar_url, e.id, e.status, co.name, fl.name,
		       e.start_date, e.end_date, e.timezone, p.days,
		       COALESCE(s.unread, 0)::int, COALESCE(s.threads, 0)::int, s.last_at
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		JOIN programs p ON p.id = e.program_id
		LEFT JOIN cohorts co ON co.id = e.cohort_id
		LEFT JOIN flow_versions fv ON fv.id = e.flow_version_id
		LEFT JOIN flows fl ON fl.id = fv.flow_id
		LEFT JOIN LATERAL (
			SELECT sum((SELECT count(*) FROM chat_messages m WHERE m.enrollment_id = t.enrollment_id AND m.persona_id = t.persona_id
			            AND m.author = 'student' AND m.deliver_at > t.staff_read_at)) AS unread,
			       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM chat_messages m WHERE m.enrollment_id = t.enrollment_id AND m.persona_id = t.persona_id AND m.deliver_at <= $1)) AS threads,
			       (SELECT max(m.deliver_at) FROM chat_messages m WHERE m.enrollment_id = e.id AND m.deliver_at <= $1) AS last_at
			FROM chat_threads t WHERE t.enrollment_id = e.id
		) s ON true
		WHERE e.status IN ('active', 'paused')
		  AND ($2::uuid IS NULL OR COALESCE(co.college_id, u.college_id) = $2)
		  AND ($3::uuid IS NULL OR fv.flow_id = $3)
		  AND ($4::uuid IS NULL OR e.cohort_id = $4)
		  AND ($5 = '' OR u.name ILIKE $5 OR u.github_login ILIKE $5)
		ORDER BY (COALESCE(s.unread, 0) > 0) DESC, s.last_at DESC NULLS LAST, lower(u.name), e.id
		OFFSET $6 LIMIT $7`, now, f.College, f.FlowID, f.CohortID, likePattern(f.Search), f.Offset, f.Limit)
	if err != nil {
		return nil, fmt.Errorf("inbox students: %w", err)
	}
	defer rows.Close()
	out := []InboxStudent{}
	for rows.Next() {
		var r InboxStudent
		var status string
		var e domain.Enrollment
		if err := rows.Scan(&r.UserID, &r.Name, &r.Login, &r.Avatar, &r.EnrollmentID, &status, &r.CohortName, &r.FlowName,
			&e.StartDate, &e.EndDate, &e.Timezone, &e.Program.Days, &r.Unread, &r.Threads, &r.LastAt); err != nil {
			return nil, err
		}
		r.Status = domain.EnrollmentStatus(status)
		r.DayNumber = e.DayNumber(now)
		out = append(out, r)
	}
	return out, rows.Err()
}
