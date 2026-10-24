package app

import (
	"context"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// Account returns the user's consent and onboarding state.
func (w *Workspace) Account(ctx context.Context, u domain.User) (domain.Account, error) {
	return store.GetAccount(ctx, w.Store.Pool, u.ID)
}

// Consent records that the user accepted the given terms version, which must be current, so
// a stale tab can't accept terms the user never saw.
func (w *Workspace) Consent(ctx context.Context, u domain.User, version int) (domain.Account, error) {
	if version != domain.TermsVersion {
		return domain.Account{}, apperr.Validation(map[string]string{"version": "These terms have changed. Reload to read the new version."})
	}
	if err := store.SetConsent(ctx, w.Store.Pool, u.ID, version, w.Clock.Now()); err != nil {
		return domain.Account{}, err
	}
	return w.Account(ctx, u)
}

// Onboarded marks the first-run guide as seen.
func (w *Workspace) Onboarded(ctx context.Context, u domain.User) (domain.Account, error) {
	if err := store.SetOnboarded(ctx, w.Store.Pool, u.ID, w.Clock.Now()); err != nil {
		return domain.Account{}, err
	}
	return w.Account(ctx, u)
}

// Export returns the user's data as JSON.
func (w *Workspace) Export(ctx context.Context, u domain.User) ([]byte, error) {
	return store.ExportUser(ctx, w.Store.Pool, u.ID, w.Clock.Now())
}
