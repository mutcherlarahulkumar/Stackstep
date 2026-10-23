package app

import (
	"context"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// ReviewQueueMax caps one page of the review queue.
const ReviewQueueMax = 200

// Reviews lists hand-ins waiting for review in the caller's scope, oldest first, with
// reviewer warnings. College admins see their college only.
func (w *Workspace) Reviews(ctx context.Context, u domain.User, persona *uuid.UUID) ([]store.ReviewRow, error) {
	only, err := staffCollege(u)
	if err != nil {
		return nil, err
	}
	rows, err := store.ReviewQueue(ctx, w.Store.Pool, only, persona, ReviewQueueMax)
	if err != nil {
		return nil, err
	}
	tasks := make([]domain.Task, len(rows))
	for i, r := range rows {
		tasks[i] = r.Task
	}
	if err := store.EnrichTasks(ctx, w.Store.Pool, tasks); err != nil {
		return nil, err
	}
	if err := store.AddHandInChecks(ctx, w.Store.Pool, tasks); err != nil {
		return nil, err
	}
	for i := range rows {
		rows[i].Task = tasks[i]
	}
	return rows, nil
}
