package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

func encodeContent(c domain.TaskContent) []byte {
	if c.Resources == nil {
		c.Resources = []domain.Resource{}
	}
	b, err := json.Marshal(c)
	if err != nil {
		panic(fmt.Sprintf("encode task content: %v", err)) // plain structs always marshal
	}
	return b
}

func decodeContent(b []byte) (domain.TaskContent, error) {
	var c domain.TaskContent
	if len(b) == 0 {
		return domain.TaskContent{Resources: []domain.Resource{}}, nil
	}
	if err := json.Unmarshal(b, &c); err != nil {
		return c, err
	}
	if c.Resources == nil {
		c.Resources = []domain.Resource{}
	}
	return c, nil
}

// InsertSubmission records a hand-in as the next attempt.
func InsertSubmission(ctx context.Context, q Q, taskID, by uuid.UUID, s domain.Submission, now time.Time) error {
	var url *string
	if s.URL != "" {
		url = &s.URL
	}
	_, err := q.Exec(ctx, `INSERT INTO task_submissions (task_id, attempt, url, note, submitted_by, created_at)
		VALUES ($1, COALESCE((SELECT max(attempt) FROM task_submissions WHERE task_id = $1), 0) + 1, $2, $3, $4, $5)`,
		taskID, url, s.Note, by, now)
	return err
}

// QuizAttempts returns how many times a quiz task was attempted.
func QuizAttempts(ctx context.Context, q Q, taskID uuid.UUID) (int, error) {
	var n int
	err := q.QueryRow(ctx, "SELECT count(*) FROM quiz_attempts WHERE task_id = $1", taskID).Scan(&n)
	return n, err
}

// InsertQuizAttempt stores a graded attempt.
func InsertQuizAttempt(ctx context.Context, q Q, taskID uuid.UUID, answers []int, r domain.QuizResult, now time.Time) error {
	a := make([]int32, len(answers))
	for i, v := range answers {
		a[i] = int32(v)
	}
	_, err := q.Exec(ctx, `INSERT INTO quiz_attempts (task_id, attempt, answers, score, passed, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
		taskID, r.Attempt, a, r.Score, r.Passed, now)
	return err
}

// EnrichTasks loads each task's latest submission and quiz stats.
func EnrichTasks(ctx context.Context, q Q, tasks []domain.Task) error {
	if len(tasks) == 0 {
		return nil
	}
	ids := make([]uuid.UUID, len(tasks))
	idx := make(map[uuid.UUID]int, len(tasks))
	for i, t := range tasks {
		ids[i] = t.ID
		idx[t.ID] = i
	}
	rows, err := q.Query(ctx, `
		SELECT DISTINCT ON (s.task_id) s.task_id, s.attempt, s.url, s.note, s.created_at,
		       min(s.created_at) OVER (PARTITION BY s.task_id)
		FROM task_submissions s WHERE s.task_id = ANY($1)
		ORDER BY s.task_id, s.attempt DESC`, ids)
	if err != nil {
		return fmt.Errorf("load submissions: %w", err)
	}
	for rows.Next() {
		var id uuid.UUID
		var r domain.SubmissionRecord
		var url *string
		if err := rows.Scan(&id, &r.Attempt, &url, &r.Note, &r.SubmittedAt, &r.FirstSubmittedAt); err != nil {
			rows.Close()
			return err
		}
		if url != nil {
			r.URL = *url
		}
		tasks[idx[id]].Submission = &r
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	rows, err = q.Query(ctx, `
		SELECT task_id, count(*)::int, max(score), bool_or(passed),
		       (array_agg(answers ORDER BY attempt DESC))[1]
		FROM quiz_attempts WHERE task_id = ANY($1) GROUP BY task_id`, ids)
	if err != nil {
		return fmt.Errorf("load quiz attempts: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		var st domain.QuizStats
		var last []int32
		if err := rows.Scan(&id, &st.Attempts, &st.BestScore, &st.Passed, &last); err != nil {
			return err
		}
		t := &tasks[idx[id]]
		if quiz := t.Content.Quiz; quiz != nil {
			st.LastCorrect = make([]bool, len(last))
			st.LastAnswers = make([]int, len(last))
			for i, a := range last {
				st.LastAnswers[i] = int(a)
				st.LastCorrect[i] = i < len(quiz.Questions) && int(a) == quiz.Questions[i].Answer
			}
		}
		t.Quiz = &st
	}
	return rows.Err()
}

// EnrichTask is EnrichTasks for one task.
func EnrichTask(ctx context.Context, q Q, t domain.Task) (domain.Task, error) {
	ts := []domain.Task{t}
	err := EnrichTasks(ctx, q, ts)
	return ts[0], err
}
