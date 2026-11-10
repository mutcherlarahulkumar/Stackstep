package app

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// React adds or removes an emoji on a message the caller can see: students on their own
// conversations, staff (as the persona) on students in their scope.
func (w *Workspace) React(ctx context.Context, u domain.User, messageID uuid.UUID, emoji domain.ReactionEmoji, on bool) (domain.Message, error) {
	if !emoji.Valid() {
		return domain.Message{}, apperr.Validation(map[string]string{"emoji": "Pick one of the reactions."})
	}
	now := w.Clock.Now()
	var out domain.Message
	err := w.Store.Tx(ctx, func(q store.Q) error {
		m, err := store.GetMessage(ctx, q, messageID)
		if errors.Is(err, store.ErrNotFound) || err == nil && m.SentAt.After(now) {
			return errNotFound
		}
		if err != nil {
			return err
		}
		by := domain.AuthorPersona
		if u.Role.IsStaff() {
			if _, err := w.staffEnrollment(ctx, u, m.EnrollmentID); err != nil {
				return err
			}
		} else {
			e, err := w.requireEnrollment(ctx, u)
			if err != nil {
				return err
			}
			if e.ID != m.EnrollmentID {
				return errNotFound
			}
			by = domain.AuthorStudent
		}
		if err := store.SetReaction(ctx, q, m.ID, by, emoji, on, now); err != nil {
			return err
		}
		msgs := []domain.Message{m}
		if err := store.AttachReactions(ctx, q, msgs); err != nil {
			return err
		}
		out = msgs[0]
		return store.Notify(ctx, q, store.Event{Kind: store.EventReaction, ID: m.ID, EnrollmentID: m.EnrollmentID})
	})
	return out, err
}
