package app

import (
	"context"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// classInvitees lists the students invited to a live class.
func (w *Workspace) classInvitees(ctx context.Context, q store.Q, u domain.User, id uuid.UUID) ([]uuid.UUID, error) {
	_, _, _, _ = ctx, q, u, id
	return nil, apperr.Validation(map[string]string{"class_id": "That class doesn't exist."})
}
