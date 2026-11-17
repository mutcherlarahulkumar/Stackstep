package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/reviewlab"
)

// LabAttempt is one stored review of a practice pull request.
type LabAttempt struct {
	ID        uuid.UUID
	Exercise  string
	TaskID    *uuid.UUID
	Verdict   reviewlab.Verdict
	Summary   string
	Comments  []reviewlab.Comment
	Score     int
	Passed    bool
	CreatedAt time.Time
}

type labCommentJSON struct {
	Path string `json:"path"`
	Line int    `json:"line"`
	Side string `json:"side"`
	Body string `json:"body"`
}

// InsertLabAttempt stores a graded review.
func InsertLabAttempt(ctx context.Context, q Q, userID uuid.UUID, a LabAttempt, r reviewlab.Result) (uuid.UUID, error) {
	cs := make([]labCommentJSON, len(a.Comments))
	for i, c := range a.Comments {
		cs[i] = labCommentJSON(c)
	}
	b, err := json.Marshal(cs)
	if err != nil {
		return uuid.Nil, err
	}
	var id uuid.UUID
	err = q.QueryRow(ctx, `INSERT INTO review_lab_attempts (user_id, exercise, task_id, verdict, summary, comments, found, total, score, passed, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
		userID, a.Exercise, a.TaskID, string(a.Verdict), a.Summary, b, r.Found, r.Total, r.Score, r.Passed, a.CreatedAt).Scan(&id)
	if err != nil {
		return uuid.Nil, fmt.Errorf("insert lab attempt: %w", err)
	}
	return id, nil
}

// LabSummary is a student's record on one exercise.
type LabSummary struct {
	Attempts  int
	BestScore int
	Passed    bool
	LastAt    *time.Time
}

// LabSummaries returns the user's record per exercise key.
func LabSummaries(ctx context.Context, q Q, userID uuid.UUID) (map[string]LabSummary, error) {
	rows, err := q.Query(ctx, `SELECT exercise, count(*)::int, max(score), bool_or(passed), max(created_at)
		FROM review_lab_attempts WHERE user_id = $1 GROUP BY exercise`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]LabSummary{}
	for rows.Next() {
		var key string
		var s LabSummary
		var at time.Time
		if err := rows.Scan(&key, &s.Attempts, &s.BestScore, &s.Passed, &at); err != nil {
			return nil, err
		}
		s.LastAt = &at
		out[key] = s
	}
	return out, rows.Err()
}

// LastLabAttempt is the user's latest review of an exercise.
func LastLabAttempt(ctx context.Context, q Q, userID uuid.UUID, exercise string) (LabAttempt, error) {
	var a LabAttempt
	var verdict string
	var raw []byte
	err := q.QueryRow(ctx, `SELECT id, exercise, task_id, verdict, summary, comments, score, passed, created_at
		FROM review_lab_attempts WHERE user_id = $1 AND exercise = $2 ORDER BY created_at DESC, id DESC LIMIT 1`, userID, exercise).
		Scan(&a.ID, &a.Exercise, &a.TaskID, &verdict, &a.Summary, &raw, &a.Score, &a.Passed, &a.CreatedAt)
	if err != nil {
		return LabAttempt{}, notFound(err)
	}
	a.Verdict = reviewlab.Verdict(verdict)
	var cs []labCommentJSON
	if err := json.Unmarshal(raw, &cs); err != nil {
		return LabAttempt{}, err
	}
	a.Comments = make([]reviewlab.Comment, len(cs))
	for i, c := range cs {
		a.Comments[i] = reviewlab.Comment(c)
	}
	return a, nil
}

// TaskLabAttempts counts the graded reviews handed in for a task.
func TaskLabAttempts(ctx context.Context, q Q, taskID uuid.UUID) (int, error) {
	var n int
	err := q.QueryRow(ctx, `SELECT count(*)::int FROM review_lab_attempts WHERE task_id = $1`, taskID).Scan(&n)
	return n, err
}

// BestTaskLabScore is the best graded review handed in for a task (0 without one).
func BestTaskLabScore(ctx context.Context, q Q, taskID uuid.UUID) (int, error) {
	var n int
	err := q.QueryRow(ctx, `SELECT COALESCE(max(score), 0) FROM review_lab_attempts WHERE task_id = $1`, taskID).Scan(&n)
	return n, err
}
