package app

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/reviewlab"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// Feature 28: a public portfolio per student, built from their finished work. It is off until
// the student turns it on, and shows nothing private (no chats, notes, reviews or scores).

// PortfolioHeadlineMax bounds the line under the student's name.
const PortfolioHeadlineMax = 120

// portfolioWorkMax is how many finished tasks a portfolio lists.
const portfolioWorkMax = 60

// MyPortfolioSettings are the signed-in user's portfolio settings.
func (w *Workspace) MyPortfolioSettings(ctx context.Context, u domain.User) (store.PortfolioSettings, error) {
	return store.GetPortfolioSettings(ctx, w.Store.Pool, u.ID)
}

// SetMyPortfolio turns the portfolio on or off and sets its headline.
func (w *Workspace) SetMyPortfolio(ctx context.Context, u domain.User, public bool, headline string) (store.PortfolioSettings, error) {
	if u.Role != domain.RoleStudent {
		return store.PortfolioSettings{}, apperr.New(apperr.CodeForbidden, "Portfolios are for interns.")
	}
	h := domain.NormalizeText(headline)
	switch {
	case utf8.RuneCountInString(h) > PortfolioHeadlineMax:
		return store.PortfolioSettings{}, apperr.Validation(map[string]string{"headline": "The headline can be at most 120 characters."})
	case strings.ContainsAny(h, "\r\n"):
		return store.PortfolioSettings{}, apperr.Validation(map[string]string{"headline": "Keep the headline on one line."})
	}
	s := store.PortfolioSettings{Public: public, Headline: h}
	if err := store.SetPortfolioSettings(ctx, w.Store.Pool, u.ID, s); err != nil {
		return store.PortfolioSettings{}, err
	}
	return s, nil
}

// LabBest is a passed review lab exercise on a portfolio.
type LabBest struct {
	Exercise  reviewlab.Exercise
	BestScore int
}

// Portfolio is what a public portfolio shows.
type Portfolio struct {
	User         domain.User
	Headline     string
	Enrollment   domain.Enrollment
	Achievements domain.Achievements
	Work         []store.PortfolioItem
	Certificates []domain.Certificate
	Labs         []LabBest
	Points       int
	DayNumber    int
}

// PublicPortfolio loads a student's portfolio by GitHub login. Anyone may read a public one;
// a private or missing one is not found (the two look the same).
func (w *Workspace) PublicPortfolio(ctx context.Context, login string) (Portfolio, error) {
	login = strings.TrimPrefix(strings.TrimSpace(login), "@")
	if login == "" || len(login) > 39 {
		return Portfolio{}, errNotFound
	}
	u, err := store.GetUserByLogin(ctx, w.Store.Pool, login)
	if errors.Is(err, store.ErrNotFound) {
		return Portfolio{}, errNotFound
	}
	if err != nil {
		return Portfolio{}, err
	}
	s, err := store.GetPortfolioSettings(ctx, w.Store.Pool, u.ID)
	if err != nil {
		return Portfolio{}, err
	}
	if !s.Public || u.Role != domain.RoleStudent {
		return Portfolio{}, errNotFound
	}
	e, err := store.LatestEnrollmentForUser(ctx, w.Store.Pool, u.ID)
	if errors.Is(err, store.ErrNotFound) {
		return Portfolio{}, errNotFound
	}
	if err != nil {
		return Portfolio{}, err
	}
	p := Portfolio{User: u, Headline: s.Headline, Enrollment: e, DayNumber: e.DayNumber(w.Clock.Now())}
	if p.Achievements, err = w.achievements(ctx, e, false); err != nil {
		return Portfolio{}, err
	}
	if p.Work, err = store.PortfolioWork(ctx, w.Store.Pool, e.ID, portfolioWorkMax); err != nil {
		return Portfolio{}, err
	}
	for i := range p.Work {
		if !domain.ValidURL(p.Work[i].URL) {
			p.Work[i].URL = ""
		}
	}
	certs, err := store.CertificatesForUser(ctx, w.Store.Pool, u.ID)
	if err != nil {
		return Portfolio{}, err
	}
	for _, c := range certs {
		if c.RevokedAt == nil {
			p.Certificates = append(p.Certificates, c)
		}
	}
	pts, err := store.Points(ctx, w.Store.Pool, e.ID)
	if err != nil {
		return Portfolio{}, err
	}
	p.Points = pts.Points
	records, err := store.LabSummaries(ctx, w.Store.Pool, u.ID)
	if err != nil {
		return Portfolio{}, err
	}
	for _, ex := range reviewlab.All() {
		if r, ok := records[ex.Key]; ok && r.Passed {
			p.Labs = append(p.Labs, LabBest{Exercise: ex, BestScore: r.BestScore})
		}
	}
	return p, nil
}

// CertificateBadges are the badges earned in a certificate's internship, for its public page.
func (w *Workspace) CertificateBadges(ctx context.Context, c domain.Certificate) ([]domain.BadgeState, error) {
	e, err := store.GetEnrollment(ctx, w.Store.Pool, c.EnrollmentID)
	if err != nil {
		return nil, err
	}
	a, err := w.achievements(ctx, e, false)
	if err != nil {
		return nil, err
	}
	out := []domain.BadgeState{}
	for _, b := range a.Badges {
		if b.EarnedAt != nil {
			out = append(out, b)
		}
	}
	return out, nil
}
