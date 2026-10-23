package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

// LockEnrollment row-locks an enrollment so credit checks and spends serialize per student.
func LockEnrollment(ctx context.Context, q Q, id uuid.UUID) error {
	_, err := q.Exec(ctx, "SELECT 1 FROM enrollments WHERE id = $1 FOR UPDATE", id)
	return err
}

// EnsureWelcomeCredits grants the starting credits once per enrollment.
func EnsureWelcomeCredits(ctx context.Context, q Q, enrollmentID uuid.UUID, now time.Time) error {
	_, err := q.Exec(ctx, `INSERT INTO credit_ledger (enrollment_id, delta, reason, note, created_at)
		VALUES ($1, $2, 'welcome', 'Starting credits', $3)
		ON CONFLICT (enrollment_id) WHERE reason = 'welcome' DO NOTHING`, enrollmentID, domain.WelcomeCredits, now)
	return err
}

// CreditBalance sums the ledger.
func CreditBalance(ctx context.Context, q Q, enrollmentID uuid.UUID) (int, error) {
	var n int
	err := q.QueryRow(ctx, "SELECT COALESCE(sum(delta), 0)::int FROM credit_ledger WHERE enrollment_id = $1", enrollmentID).Scan(&n)
	return n, err
}

// CreditEntry is one ledger row.
type CreditEntry struct {
	ID        int64
	Delta     int
	Reason    domain.CreditReason
	Note      string
	TaskID    *uuid.UUID
	CreatedAt time.Time
}

// NewCredit is a ledger row to insert.
type NewCredit struct {
	EnrollmentID uuid.UUID
	Delta        int
	Reason       domain.CreditReason
	Note         string
	TaskID       *uuid.UUID
	AIMessageID  *uuid.UUID
	CreatedBy    *uuid.UUID
}

// InsertCredit appends to the ledger. Returns false when a unique rule (one welcome, one
// award per task, one spend/refund per question) already holds.
func InsertCredit(ctx context.Context, q Q, c NewCredit, now time.Time) (bool, error) {
	tag, err := q.Exec(ctx, `INSERT INTO credit_ledger (enrollment_id, delta, reason, note, task_id, ai_message_id, created_by, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
		c.EnrollmentID, c.Delta, string(c.Reason), c.Note, c.TaskID, c.AIMessageID, c.CreatedBy, now)
	if err != nil {
		return false, fmt.Errorf("insert credit: %w", err)
	}
	return tag.RowsAffected() == 1, nil
}

// CreditHistory returns the newest ledger rows.
func CreditHistory(ctx context.Context, q Q, enrollmentID uuid.UUID, limit int) ([]CreditEntry, error) {
	rows, err := q.Query(ctx, `SELECT id, delta, reason, note, task_id, created_at FROM credit_ledger
		WHERE enrollment_id = $1 ORDER BY id DESC LIMIT $2`, enrollmentID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CreditEntry{}
	for rows.Next() {
		var e CreditEntry
		var reason string
		if err := rows.Scan(&e.ID, &e.Delta, &reason, &e.Note, &e.TaskID, &e.CreatedAt); err != nil {
			return nil, err
		}
		e.Reason = domain.CreditReason(reason)
		if !e.Reason.Valid() {
			return nil, fmt.Errorf("credit %d has unknown reason %q", e.ID, reason)
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// FirstSubmissionAt is when the task was first handed in, if ever.
func FirstSubmissionAt(ctx context.Context, q Q, taskID uuid.UUID) (*time.Time, error) {
	var at *time.Time
	err := q.QueryRow(ctx, "SELECT min(created_at) FROM task_submissions WHERE task_id = $1", taskID).Scan(&at)
	return at, err
}

// BestQuizScore is the best attempt's score (0 when none).
func BestQuizScore(ctx context.Context, q Q, taskID uuid.UUID) (int, error) {
	var n int
	err := q.QueryRow(ctx, "SELECT COALESCE(max(score), 0) FROM quiz_attempts WHERE task_id = $1", taskID).Scan(&n)
	return n, err
}

// InsertPoints records a finished task's points once.
func InsertPoints(ctx context.Context, q Q, t domain.Task, points int, onTime bool, now time.Time) (bool, error) {
	tag, err := q.Exec(ctx, `INSERT INTO points_ledger (task_id, enrollment_id, points, on_time, created_at) VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (task_id) DO NOTHING`, t.ID, t.EnrollmentID, points, onTime, now)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

// PointsSummary totals an enrollment's points.
type PointsSummary struct {
	Points   int
	Finished int
	OnTime   int
}

// Points sums the points ledger.
func Points(ctx context.Context, q Q, enrollmentID uuid.UUID) (PointsSummary, error) {
	var p PointsSummary
	err := q.QueryRow(ctx, `SELECT COALESCE(sum(points), 0)::int, count(*)::int, count(*) FILTER (WHERE on_time)::int
		FROM points_ledger WHERE enrollment_id = $1`, enrollmentID).Scan(&p.Points, &p.Finished, &p.OnTime)
	return p, err
}

// ---- AI helper ----

// AIConversation is a thread with the AI helper.
type AIConversation struct {
	ID           uuid.UUID
	EnrollmentID uuid.UUID
	TaskID       *uuid.UUID
	Title        string
	CreatedAt    time.Time
	UpdatedAt    time.Time
	FollowUps    int // student follow-ups so far
}

// AIParts are the structured fields of a first question.
type AIParts struct {
	Goal  string `json:"goal"`
	Tried string `json:"tried"`
	Error string `json:"error"`
	Code  string `json:"code"`
	// Follow-ups
	TriedSince string `json:"tried_since,omitempty"`
	Question   string `json:"question,omitempty"`
}

// AIMessage is one turn.
type AIMessage struct {
	ID             uuid.UUID
	ConversationID uuid.UUID
	Role           string // student, assistant
	Status         string // pending, answered, failed (student); ok (assistant)
	Kind           string // question, follow_up, answer
	Body           string
	Parts          *AIParts
	ClientID       *uuid.UUID
	CreatedAt      time.Time
}

const aiConvCols = `c.id, c.enrollment_id, c.task_id, c.title, c.created_at, c.updated_at,
	(SELECT count(*)::int FROM ai_messages m WHERE m.conversation_id = c.id AND m.kind = 'follow_up' AND m.status <> 'failed')`

func scanAIConv(row pgx.Row) (AIConversation, error) {
	var c AIConversation
	err := row.Scan(&c.ID, &c.EnrollmentID, &c.TaskID, &c.Title, &c.CreatedAt, &c.UpdatedAt, &c.FollowUps)
	return c, notFound(err)
}

// InsertAIConversation starts a conversation.
func InsertAIConversation(ctx context.Context, q Q, enrollmentID uuid.UUID, taskID *uuid.UUID, title string, now time.Time) (AIConversation, error) {
	var id uuid.UUID
	if err := q.QueryRow(ctx, `INSERT INTO ai_conversations (enrollment_id, task_id, title, created_at, updated_at) VALUES ($1, $2, $3, $4, $4) RETURNING id`,
		enrollmentID, taskID, title, now).Scan(&id); err != nil {
		return AIConversation{}, err
	}
	return GetAIConversation(ctx, q, id)
}

// GetAIConversation loads one conversation.
func GetAIConversation(ctx context.Context, q Q, id uuid.UUID) (AIConversation, error) {
	return scanAIConv(q.QueryRow(ctx, "SELECT "+aiConvCols+" FROM ai_conversations c WHERE c.id = $1", id))
}

// ListAIConversations returns an enrollment's conversations, most recent first.
func ListAIConversations(ctx context.Context, q Q, enrollmentID uuid.UUID, limit int) ([]AIConversation, error) {
	rows, err := q.Query(ctx, "SELECT "+aiConvCols+` FROM ai_conversations c WHERE c.enrollment_id = $1
		ORDER BY c.updated_at DESC, c.id DESC LIMIT $2`, enrollmentID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AIConversation{}
	for rows.Next() {
		c, err := scanAIConv(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// NewAIMessage is a turn to store.
type NewAIMessage struct {
	ConversationID uuid.UUID
	EnrollmentID   uuid.UUID
	Role, Status   string
	Kind           string
	Body           string
	Parts          *AIParts
	ClientID       *uuid.UUID
	TokensIn       int
	TokensOut      int
}

// InsertAIMessage stores a turn and bumps the conversation.
func InsertAIMessage(ctx context.Context, q Q, m NewAIMessage, now time.Time) (uuid.UUID, error) {
	var parts []byte
	if m.Parts != nil {
		b, err := json.Marshal(m.Parts)
		if err != nil {
			return uuid.Nil, err
		}
		parts = b
	}
	var id uuid.UUID
	if err := q.QueryRow(ctx, `INSERT INTO ai_messages (conversation_id, enrollment_id, role, status, kind, body, parts, client_id, tokens_in, tokens_out, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
		m.ConversationID, m.EnrollmentID, m.Role, m.Status, m.Kind, m.Body, parts, m.ClientID, m.TokensIn, m.TokensOut, now).Scan(&id); err != nil {
		return uuid.Nil, err
	}
	_, err := q.Exec(ctx, "UPDATE ai_conversations SET updated_at = $2 WHERE id = $1", m.ConversationID, now)
	return id, err
}

// SetAIMessageStatus updates a student message once the model answered (or failed).
func SetAIMessageStatus(ctx context.Context, q Q, id uuid.UUID, status string) error {
	_, err := q.Exec(ctx, "UPDATE ai_messages SET status = $2 WHERE id = $1", id, status)
	return err
}

// AIMessageByClientID finds a retried question.
func AIMessageByClientID(ctx context.Context, q Q, enrollmentID, clientID uuid.UUID) (AIMessage, error) {
	rows, err := q.Query(ctx, aiMsgSelect+" WHERE enrollment_id = $1 AND client_id = $2", enrollmentID, clientID)
	if err != nil {
		return AIMessage{}, err
	}
	msgs, err := scanAIMessages(rows)
	if err != nil {
		return AIMessage{}, err
	}
	if len(msgs) == 0 {
		return AIMessage{}, ErrNotFound
	}
	return msgs[0], nil
}

const aiMsgSelect = "SELECT id, conversation_id, role, status, kind, body, parts, client_id, created_at FROM ai_messages"

func scanAIMessages(rows pgx.Rows) ([]AIMessage, error) {
	defer rows.Close()
	out := []AIMessage{}
	for rows.Next() {
		var m AIMessage
		var parts []byte
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.Role, &m.Status, &m.Kind, &m.Body, &parts, &m.ClientID, &m.CreatedAt); err != nil {
			return nil, err
		}
		if len(parts) > 0 {
			var p AIParts
			if err := json.Unmarshal(parts, &p); err != nil {
				return nil, fmt.Errorf("ai message %s parts: %w", m.ID, err)
			}
			m.Parts = &p
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// ListAIMessages returns a conversation oldest first.
func ListAIMessages(ctx context.Context, q Q, conversationID uuid.UUID) ([]AIMessage, error) {
	rows, err := q.Query(ctx, aiMsgSelect+" WHERE conversation_id = $1 ORDER BY seq LIMIT 200", conversationID)
	if err != nil {
		return nil, err
	}
	return scanAIMessages(rows)
}

// AIUsage is what the limits are checked against.
type AIUsage struct {
	QuestionsSince   int        // student messages (not failed) since the given time
	Pending          bool       // a question is being answered right now
	LastQuestionAt   *time.Time // last new conversation
	LastAnswerInConv *time.Time // last answer in the given conversation
}

// GetAIUsage counts usage for limit checks. conversationID may be nil.
func GetAIUsage(ctx context.Context, q Q, enrollmentID uuid.UUID, since time.Time, pendingAfter time.Time, conversationID *uuid.UUID) (AIUsage, error) {
	var u AIUsage
	err := q.QueryRow(ctx, `SELECT
		count(*) FILTER (WHERE role = 'student' AND status <> 'failed' AND created_at >= $2)::int,
		COALESCE(bool_or(role = 'student' AND status = 'pending' AND created_at >= $3), false),
		max(created_at) FILTER (WHERE role = 'student' AND kind = 'question' AND status <> 'failed'),
		max(created_at) FILTER (WHERE role = 'assistant' AND conversation_id = $4)
		FROM ai_messages WHERE enrollment_id = $1`, enrollmentID, since, pendingAfter, conversationID).
		Scan(&u.QuestionsSince, &u.Pending, &u.LastQuestionAt, &u.LastAnswerInConv)
	if errors.Is(err, pgx.ErrNoRows) {
		return AIUsage{}, nil
	}
	return u, err
}

// DeleteAIConversation removes a conversation whose first question got no answer.
func DeleteAIConversation(ctx context.Context, q Q, id uuid.UUID) error {
	if _, err := q.Exec(ctx, "DELETE FROM ai_messages WHERE conversation_id = $1", id); err != nil {
		return err
	}
	_, err := q.Exec(ctx, "DELETE FROM ai_conversations WHERE id = $1", id)
	return err
}
