package app

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// ownTask loads a released, non-cancelled task of the student's open internship.
func (w *Workspace) ownTask(ctx context.Context, u domain.User, taskID uuid.UUID) (domain.Task, error) {
	e, err := w.requireEnrollment(ctx, u)
	if err != nil {
		return domain.Task{}, err
	}
	t, err := store.GetTask(ctx, w.Store.Pool, taskID)
	if errors.Is(err, store.ErrNotFound) || err == nil && (t.EnrollmentID != e.ID || t.ScheduledFor.After(w.Clock.Now()) || t.Status == domain.StatusCancelled) {
		return domain.Task{}, errNotFound
	}
	return t, err
}

// MyNote returns the student's note on a task (empty when there is none).
func (w *Workspace) MyNote(ctx context.Context, u domain.User, taskID uuid.UUID) (domain.TaskNote, error) {
	t, err := w.ownTask(ctx, u, taskID)
	if err != nil {
		return domain.TaskNote{}, err
	}
	return store.GetNote(ctx, w.Store.Pool, t.ID)
}

// SaveNote replaces the student's note. Notes stay editable after the task is done.
func (w *Workspace) SaveNote(ctx context.Context, u domain.User, taskID uuid.UUID, body string, shared bool) (domain.TaskNote, error) {
	if msg := domain.ValidateTaskNote(body); msg != "" {
		return domain.TaskNote{}, apperr.Validation(map[string]string{"body": msg})
	}
	t, err := w.ownTask(ctx, u, taskID)
	if err != nil {
		return domain.TaskNote{}, err
	}
	return store.SaveNote(ctx, w.Store.Pool, t.ID, domain.TaskNote{Body: body, Shared: shared}, w.Clock.Now())
}
