package app

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// celebrateWithin: badges earned longer ago than this are saved quietly (a student who already
// had them when badges arrived isn't sent a pile of messages).
const celebrateWithin = 48 * time.Hour

// achievementsFor works out an enrollment's streak and badges, saves newly earned badges and
// has Stackbot celebrate recent ones in the team room. Stored dates win over computed ones.
func (w *Workspace) achievementsFor(ctx context.Context, e domain.Enrollment) (domain.Achievements, error) {
	return w.achievements(ctx, e, true)
}

// achievements works out achievements; save false only reads (for public pages).
func (w *Workspace) achievements(ctx context.Context, e domain.Enrollment, save bool) (domain.Achievements, error) {
	now := w.Clock.Now()
	var out domain.Achievements
	err := w.Store.Tx(ctx, func(q store.Q) error {
		facts, err := store.AchievementFacts(ctx, q, e)
		if err != nil {
			return err
		}
		out = domain.ComputeAchievements(facts, now, e.Location())
		saved, err := store.EarnedBadges(ctx, q, e.ID)
		if err != nil {
			return err
		}
		for i := range out.Badges {
			b := &out.Badges[i]
			if at, ok := saved[b.Def.Key]; ok {
				b.EarnedAt, b.Progress = &at, b.Def.Target
				continue
			}
			if b.EarnedAt == nil || !save {
				continue
			}
			created, err := store.SaveBadge(ctx, q, e.ID, b.Def.Key, *b.EarnedAt)
			if err != nil {
				return err
			}
			if created && now.Sub(*b.EarnedAt) <= celebrateWithin && e.Status == domain.EnrollmentActive {
				if _, _, err := store.InsertMessage(ctx, q, store.NewMessage{
					EnrollmentID: e.ID, PersonaID: domain.TeamPersonaID, Author: domain.AuthorPersona,
					Body: domain.BadgeCelebration(b.Def), DeliverAt: now,
				}, now); err != nil {
					return err
				}
			}
		}
		return nil
	})
	return out, err
}

// MyAchievements is the signed-in student's streak and badges.
func (w *Workspace) MyAchievements(ctx context.Context, u domain.User) (domain.Achievements, error) {
	e, err := w.requireEnrollment(ctx, u)
	if err != nil {
		return domain.Achievements{}, err
	}
	return w.achievementsFor(ctx, e)
}

// StaffAchievements is a student's streak and badges for staff in scope.
func (w *Workspace) StaffAchievements(ctx context.Context, u domain.User, enrollmentID uuid.UUID) (domain.Achievements, error) {
	e, err := w.staffEnrollment(ctx, u, enrollmentID)
	if err != nil {
		return domain.Achievements{}, err
	}
	return w.achievementsFor(ctx, e)
}

// refreshBadgesFor recomputes the user's badges after something they did, so new ones are
// celebrated while it's fresh. Errors are logged; they never fail the action.
func (w *Workspace) refreshBadgesFor(ctx context.Context, u domain.User) {
	e, err := store.OpenEnrollmentForUser(ctx, w.Store.Pool, u.ID)
	if errors.Is(err, store.ErrNotFound) {
		return
	}
	if err == nil {
		_, err = w.achievementsFor(ctx, e)
	}
	if err != nil {
		w.Log.ErrorContext(ctx, "refresh badges", "err", err, "user", u.ID)
	}
}

// refreshBadgesOf is refreshBadgesFor for an enrollment.
func (w *Workspace) refreshBadgesOf(ctx context.Context, e domain.Enrollment) {
	if _, err := w.achievementsFor(ctx, e); err != nil {
		w.Log.ErrorContext(ctx, "refresh badges", "err", err, "enrollment", e.ID)
	}
}
