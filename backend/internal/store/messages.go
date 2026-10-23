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

const messageCols = "id, enrollment_id, author, body, task_id, client_id, deliver_at"

func scanMessage(row pgx.Row) (domain.Message, error) {
	var m domain.Message
	var author string
	if err := row.Scan(&m.ID, &m.EnrollmentID, &author, &m.Body, &m.TaskID, &m.ClientID, &m.SentAt); err != nil {
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
	Author       domain.Author
	Body         string
	TaskID       *uuid.UUID
	ClientID     *uuid.UUID
	DeliverAt    time.Time
}

// InsertMessage stores a message. Messages due now are marked delivered immediately.
// It returns (message, true) when inserted and (existing, false) when client_id was already used.
func InsertMessage(ctx context.Context, q Q, m NewMessage, now time.Time) (domain.Message, bool, error) {
	var delivered *time.Time
	if !m.DeliverAt.After(now) {
		delivered = &now
	}
	msg, err := scanMessage(q.QueryRow(ctx, `
		INSERT INTO chat_messages (enrollment_id, author, body, task_id, client_id, created_at, deliver_at, delivered_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT ON CONSTRAINT chat_messages_client_id_key DO NOTHING
		RETURNING `+messageCols,
		m.EnrollmentID, string(m.Author), m.Body, m.TaskID, m.ClientID, now, m.DeliverAt, delivered))
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

// ListMessages returns visible messages newest first, strictly older than before when set.
func ListMessages(ctx context.Context, q Q, enrollmentID uuid.UUID, now time.Time, before *Cursor, limit int) ([]domain.Message, error) {
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
		WHERE enrollment_id = $1 AND deliver_at <= $2
		  AND ($3::timestamptz IS NULL OR (deliver_at, id) < ($3, $4))
		ORDER BY deliver_at DESC, id DESC
		LIMIT $5`, enrollmentID, now, bt, bid, limit)
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
