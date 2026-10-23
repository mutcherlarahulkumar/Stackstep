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

// ProgressView is an internship's progress and its certificate, if issued.
type ProgressView struct {
	Progress    domain.Progress
	Certificate *domain.Certificate
}

func (w *Workspace) progress(ctx context.Context, q store.Q, e domain.Enrollment) (ProgressView, error) {
	now := w.Clock.Now()
	p, err := store.EnrollmentProgress(ctx, q, e.ID, now)
	if err != nil {
		return ProgressView{}, err
	}
	p.DayNumber, p.Days = e.DayNumber(now), e.Program.Days
	cert, err := store.ValidCertificateFor(ctx, q, e.ID)
	return ProgressView{Progress: p, Certificate: cert}, err
}

// MyProgress is the signed-in student's progress.
func (w *Workspace) MyProgress(ctx context.Context, u domain.User) (ProgressView, error) {
	e, err := w.requireEnrollment(ctx, u)
	if err != nil {
		return ProgressView{}, err
	}
	return w.progress(ctx, w.Store.Pool, e)
}

// MyCertificates lists every certificate the user has earned, including past internships.
func (w *Workspace) MyCertificates(ctx context.Context, u domain.User) ([]domain.Certificate, error) {
	return store.CertificatesForUser(ctx, w.Store.Pool, u.ID)
}

// StaffProgress shows a student's progress to staff in scope.
func (w *Workspace) StaffProgress(ctx context.Context, u domain.User, enrollmentID uuid.UUID) (ProgressView, error) {
	e, err := w.staffEnrollment(ctx, u, enrollmentID)
	if err != nil {
		return ProgressView{}, err
	}
	return w.progress(ctx, w.Store.Pool, e)
}

// IssueCertificate snapshots the internship into a certificate. Staff decide; the
// suggested bar is guidance only. The team lead congratulates the student in chat.
func (w *Workspace) IssueCertificate(ctx context.Context, u domain.User, enrollmentID uuid.UUID) (domain.Certificate, error) {
	e, err := w.staffEnrollment(ctx, u, enrollmentID)
	if err != nil {
		return domain.Certificate{}, err
	}
	if e.Status == domain.EnrollmentCancelled {
		return domain.Certificate{}, apperr.New(apperr.CodeEnrollmentNotActive, "This internship was cancelled.")
	}
	now := w.Clock.Now()
	var cert domain.Certificate
	err = w.Store.Tx(ctx, func(q store.Q) error {
		student, err := store.GetUser(ctx, q, e.UserID)
		if err != nil {
			return err
		}
		p, err := store.EnrollmentProgress(ctx, q, e.ID, now)
		if err != nil {
			return err
		}
		c := domain.Certificate{
			EnrollmentID: e.ID, StudentName: student.Name, GitHubLogin: student.GitHubLogin, ProgramSlug: e.Program.Slug, ProgramDays: e.Program.Days,
			StartDate: e.StartDate, EndDate: e.EndDate, Points: p.Points, TasksDone: p.Done, TasksTotal: p.Released, IssuedAt: now,
		}
		if e.Flow != nil {
			name := e.Flow.Name
			c.FlowName = &name
		}
		for range 5 {
			c.Code = domain.NewCertificateCode()
			cert, err = store.InsertCertificate(ctx, q, c, u.ID)
			if !errors.Is(err, store.ErrCodeTaken) {
				break
			}
		}
		switch {
		case errors.Is(err, store.ErrAlreadyIssued):
			return apperr.New(apperr.CodeInvalidTransition, "This internship already has a certificate. Revoke it first to issue a new one.")
		case err != nil:
			return fmt.Errorf("issue certificate: %w", err)
		}
		by := u.ID
		_, _, err = store.InsertMessage(ctx, q, store.NewMessage{
			EnrollmentID: e.ID, PersonaID: domain.DefaultPersonaID, SentBy: &by, Author: domain.AuthorPersona, DeliverAt: now,
			Body: fmt.Sprintf("Congratulations, %s! Your certificate is ready: %d tasks finished, %d points. Anyone can verify it with code %s.",
				firstNameOf(student.Name), p.Done, p.Points, cert.Code),
		}, now)
		return err
	})
	return cert, err
}

func firstNameOf(name string) string {
	for i, r := range name {
		if r == ' ' {
			return name[:i]
		}
	}
	return name
}

// RevokeCertificate withdraws a certificate (platform admins only).
func (w *Workspace) RevokeCertificate(ctx context.Context, u domain.User, code, reason string) (domain.Certificate, error) {
	if err := requireAdmin(u); err != nil {
		return domain.Certificate{}, apperr.New(apperr.CodeForbidden, "Only platform admins can revoke certificates.")
	}
	r, msg := domain.ValidateRevokeReason(reason)
	if msg != "" {
		return domain.Certificate{}, apperr.Validation(map[string]string{"reason": msg})
	}
	if !domain.ValidCertificateCode(code) {
		return domain.Certificate{}, errNotFound
	}
	c, err := store.RevokeCertificate(ctx, w.Store.Pool, code, u.ID, r, w.Clock.Now())
	if errors.Is(err, store.ErrNotFound) {
		if existing, err2 := store.CertificateByCode(ctx, w.Store.Pool, code); err2 == nil && existing.RevokedAt != nil {
			return domain.Certificate{}, apperr.New(apperr.CodeInvalidTransition, "This certificate is already revoked.")
		}
		return domain.Certificate{}, errNotFound
	}
	return c, err
}

// VerifyCertificate looks a code up for anyone (no sign-in).
func (w *Workspace) VerifyCertificate(ctx context.Context, code string) (domain.Certificate, error) {
	code = domain.NormalizeCertificateCode(code)
	if !domain.ValidCertificateCode(code) {
		return domain.Certificate{}, errNotFound
	}
	c, err := store.CertificateByCode(ctx, w.Store.Pool, code)
	if errors.Is(err, store.ErrNotFound) {
		return domain.Certificate{}, errNotFound
	}
	return c, err
}
