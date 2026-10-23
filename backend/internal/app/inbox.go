package app

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// staffScope is the college a staff member is limited to (nil for platform admins).
func staffScope(u domain.User) (*uuid.UUID, bool) {
	switch u.Role {
	case domain.RoleAdmin:
		return nil, true
	case domain.RoleCollegeAdmin:
		return u.CollegeID, u.CollegeID != nil
	case domain.RoleStudent:
		return nil, false
	}
	return nil, false
}

// StaffThreads is the admin inbox.
func (w *Workspace) StaffThreads(ctx context.Context, u domain.User, f store.StaffThreadFilter) ([]store.Thread, string, error) {
	if err := requireStaff(u); err != nil {
		return nil, "", err
	}
	college, ok := staffScope(u)
	if !ok {
		return []store.Thread{}, "", nil
	}
	f.College = college
	limit := f.Limit
	f.Limit = limit + 1
	rows, err := store.StaffThreads(ctx, w.Store.Pool, w.Clock.Now(), f)
	if err != nil {
		return nil, "", err
	}
	next := ""
	if len(rows) > limit {
		rows = rows[:limit]
		last := rows[len(rows)-1]
		c := store.TimeCursor(last.SortAt, last.EnrollmentID)
		c.Extra = last.Persona.ID.String()
		next = store.EncodeCursor(c)
	}
	return rows, next, nil
}

// StaffMessages returns a page of one student's conversation with a persona.
func (w *Workspace) StaffMessages(ctx context.Context, u domain.User, enrollmentID, personaID uuid.UUID, before *store.Cursor, limit int) ([]domain.Message, string, error) {
	e, err := w.staffEnrollment(ctx, u, enrollmentID)
	if err != nil {
		return nil, "", err
	}
	if _, err := store.GetPersona(ctx, w.Store.Pool, personaID); errors.Is(err, store.ErrNotFound) {
		return nil, "", errNotFound
	} else if err != nil {
		return nil, "", err
	}
	return pageMessages(ctx, w.Store.Pool, e.ID, personaID, w.Clock.Now(), before, limit)
}

// StaffMarkRead clears the inbox unread count for a conversation.
func (w *Workspace) StaffMarkRead(ctx context.Context, u domain.User, enrollmentID, personaID uuid.UUID) error {
	e, err := w.staffEnrollment(ctx, u, enrollmentID)
	if err != nil {
		return err
	}
	return store.MarkThreadRead(ctx, w.Store.Pool, e.ID, personaID, false, w.Clock.Now())
}

// StaffSend posts a message as a persona to one student.
func (w *Workspace) StaffSend(ctx context.Context, u domain.User, enrollmentID, personaID, clientID uuid.UUID, body string) (SendResult, error) {
	e, err := w.staffEnrollment(ctx, u, enrollmentID)
	if err != nil {
		return SendResult{}, err
	}
	clean, err := w.validateStaffMessage(ctx, personaID, clientID, body)
	if err != nil {
		return SendResult{}, err
	}
	return w.staffSendOne(ctx, u, e, personaID, clientID, clean)
}

func (w *Workspace) validateStaffMessage(ctx context.Context, personaID, clientID uuid.UUID, body string) (string, error) {
	fields := map[string]string{}
	if clientID == uuid.Nil {
		fields["client_id"] = "Must be a UUID."
	}
	clean, msgErr := domain.ValidateMessage(body)
	if msgErr != "" {
		fields["body"] = msgErr
	}
	active, err := store.ActivePersonaIDs(ctx, w.Store.Pool, []uuid.UUID{personaID})
	if err != nil {
		return "", err
	}
	if !active[personaID] {
		fields["persona_id"] = "Choose an active persona."
	}
	if len(fields) > 0 {
		return "", apperr.Validation(fields)
	}
	return clean, nil
}

func (w *Workspace) staffSendOne(ctx context.Context, u domain.User, e domain.Enrollment, personaID, clientID uuid.UUID, body string) (SendResult, error) {
	now := w.Clock.Now()
	var res SendResult
	err := w.Store.Tx(ctx, func(q store.Q) error {
		by := u.ID
		cid := clientID
		msg, created, err := store.InsertMessage(ctx, q, store.NewMessage{
			EnrollmentID: e.ID, PersonaID: personaID, SentBy: &by, Author: domain.AuthorPersona, Body: body, ClientID: &cid, DeliverAt: now,
		}, now)
		if err != nil {
			return fmt.Errorf("insert staff message: %w", err)
		}
		res = SendResult{Message: msg, Created: created}
		return store.MarkThreadRead(ctx, q, e.ID, personaID, false, now)
	})
	return res, err
}

// BroadcastResult reports one recipient.
type BroadcastResult struct {
	EnrollmentID uuid.UUID
	Sent         bool
	Err          *apperr.Error
}

// broadcastNamespace derives per-recipient client ids so a retried broadcast never duplicates.
var broadcastNamespace = uuid.MustParse("6f8a7a5e-2f7b-4c0e-9c3e-2d1b5a6c7e01")

// Broadcast sends one message as a persona to many students.
func (w *Workspace) Broadcast(ctx context.Context, u domain.User, personaID, clientID uuid.UUID, enrollmentIDs []uuid.UUID, body string) ([]BroadcastResult, error) {
	if err := requireStaff(u); err != nil {
		return nil, err
	}
	if err := validateIDList(enrollmentIDs, domain.MaxBroadcastUsers, "enrollment_ids", "students"); err != nil {
		return nil, err
	}
	clean, err := w.validateStaffMessage(ctx, personaID, clientID, body)
	if err != nil {
		return nil, err
	}
	out := make([]BroadcastResult, 0, len(enrollmentIDs))
	for _, id := range enrollmentIDs {
		r := BroadcastResult{EnrollmentID: id}
		e, err := w.staffEnrollment(ctx, u, id)
		if err == nil && e.Status == domain.EnrollmentCancelled {
			err = apperr.New(apperr.CodeEnrollmentNotActive, "This internship was cancelled.")
		}
		if err == nil {
			perRecipient := uuid.NewSHA1(broadcastNamespace, append(clientID[:], id[:]...))
			_, err = w.staffSendOne(ctx, u, e, personaID, perRecipient, clean)
		}
		if err != nil {
			if ae, ok := apperr.As(err); ok {
				r.Err = ae
			} else {
				w.Log.ErrorContext(ctx, "broadcast", "err", err, "enrollment", id)
				r.Err = apperr.New(apperr.CodeInternal, "Something went wrong on our side.")
			}
		} else {
			r.Sent = true
		}
		out = append(out, r)
	}
	return out, nil
}
