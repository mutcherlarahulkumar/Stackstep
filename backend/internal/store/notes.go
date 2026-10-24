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

// GetNote returns a task's note, or an empty one.
func GetNote(ctx context.Context, q Q, taskID uuid.UUID) (domain.TaskNote, error) {
	var n domain.TaskNote
	var at time.Time
	err := q.QueryRow(ctx, `SELECT body, shared, updated_at FROM task_notes WHERE task_id = $1`, taskID).Scan(&n.Body, &n.Shared, &at)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.TaskNote{}, nil
	}
	if err != nil {
		return n, err
	}
	n.UpdatedAt = &at
	return n, nil
}

// SaveNote stores a note; an empty, unshared note is removed.
func SaveNote(ctx context.Context, q Q, taskID uuid.UUID, n domain.TaskNote, now time.Time) (domain.TaskNote, error) {
	if n.Empty() {
		_, err := q.Exec(ctx, `DELETE FROM task_notes WHERE task_id = $1`, taskID)
		return domain.TaskNote{}, err
	}
	_, err := q.Exec(ctx, `
		INSERT INTO task_notes (task_id, body, shared, updated_at) VALUES ($1, $2, $3, $4)
		ON CONFLICT (task_id) DO UPDATE SET body = EXCLUDED.body, shared = EXCLUDED.shared, updated_at = EXCLUDED.updated_at`,
		taskID, n.Body, n.Shared, now)
	if err != nil {
		return n, err
	}
	n.UpdatedAt = &now
	return n, nil
}

// AddSharedNotes attaches shared notes to tasks. Staff only.
func AddSharedNotes(ctx context.Context, q Q, tasks []domain.Task) error {
	if len(tasks) == 0 {
		return nil
	}
	ids := make([]uuid.UUID, len(tasks))
	idx := make(map[uuid.UUID]int, len(tasks))
	for i, t := range tasks {
		ids[i] = t.ID
		idx[t.ID] = i
	}
	rows, err := q.Query(ctx, `SELECT task_id, body, updated_at FROM task_notes WHERE task_id = ANY($1) AND shared`, ids)
	if err != nil {
		return fmt.Errorf("shared notes: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		var body string
		var at time.Time
		if err := rows.Scan(&id, &body, &at); err != nil {
			return err
		}
		tasks[idx[id]].SharedNote = &domain.TaskNote{Body: body, Shared: true, UpdatedAt: &at}
	}
	return rows.Err()
}
