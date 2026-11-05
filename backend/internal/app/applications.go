package app

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// Admissions runs feature 15: students apply for a cohort and pay by UPI; an admin checks the
// screenshot, flags issues or approves, which enrolls the student.
type Admissions struct {
	ws *Workspace
}

// NewAdmissions shares the workspace's store, clock and enrollment logic.
func NewAdmissions(w *Workspace) *Admissions { return &Admissions{ws: w} }

// Limits that keep one applicant from flooding the queue.
const (
	ProofsPerDay          = 10
	ApplicantMsgsPerDay   = 40
	ApplicationsQueueMax  = 300
	errAppNotFoundMessage = "Not found."
)

var (
	errNoApplication = apperr.New(apperr.CodeNotFound, "You haven't started an application.")
	errAppStudents   = apperr.New(apperr.CodeForbidden, "Only students apply.")
)

// ApplicantView is everything the apply screens show.
type ApplicantView struct {
	App      *domain.Application // the open application, or the latest closed one
	Cohort   *store.CohortRow
	Proofs   []store.ProofMeta
	Messages []store.AppMessage
	Cohorts  []store.CohortRow // open for applications
	Payment  store.PaymentSettings
	Enrolled bool // the student already has an active or paused internship
}

func (a *Admissions) now() time.Time { return a.ws.Clock.Now() }

// Mine returns the student's application screens.
func (a *Admissions) Mine(ctx context.Context, u domain.User) (ApplicantView, error) {
	if u.Role != domain.RoleStudent {
		return ApplicantView{}, errAppStudents
	}
	q := a.ws.Store.Pool
	now := a.now()
	v := ApplicantView{Proofs: []store.ProofMeta{}, Messages: []store.AppMessage{}}
	var err error
	if v.Cohorts, err = store.OpenCohorts(ctx, q, now); err != nil {
		return v, err
	}
	if v.Payment, err = store.GetPaymentSettings(ctx, q); err != nil {
		return v, err
	}
	open, err := a.ws.OpenEnrollment(ctx, u)
	if err != nil {
		return v, err
	}
	v.Enrolled = open != nil
	app, err := store.LatestApplication(ctx, q, u.ID)
	if errors.Is(err, store.ErrNotFound) {
		return v, nil
	}
	if err != nil {
		return v, err
	}
	return a.fill(ctx, v, app, false)
}

func (a *Admissions) fill(ctx context.Context, v ApplicantView, app domain.Application, staff bool) (ApplicantView, error) {
	q := a.ws.Store.Pool
	v.App = &app
	c, err := store.GetCohort(ctx, q, app.CohortID, false)
	if err != nil {
		return v, err
	}
	v.Cohort = &c
	if v.Proofs, err = store.ListProofs(ctx, q, app.ID); err != nil {
		return v, err
	}
	if v.Messages, err = store.ListAppMessages(ctx, q, app.ID); err != nil {
		return v, err
	}
	if err := store.MarkApplicationRead(ctx, q, app.ID, staff); err != nil {
		return v, err
	}
	return v, nil
}

// ApplicationInput is the details step plus the cohort.
type ApplicationInput struct {
	CohortID        uuid.UUID
	Details         domain.ApplicantDetails
	ExpectedVersion *int // required when an application is open
}

// Save starts an application or updates the open one (details and cohort, where allowed).
func (a *Admissions) Save(ctx context.Context, u domain.User, in ApplicationInput) (ApplicantView, error) {
	if u.Role != domain.RoleStudent {
		return ApplicantView{}, errAppStudents
	}
	now := a.now()
	details, errs := domain.ValidateDetails(in.Details, now)
	var saved domain.Application
	err := a.ws.Store.Tx(ctx, func(q store.Q) error {
		if open, err := store.OpenEnrollmentForUser(ctx, q, u.ID); err == nil && open.ID != uuid.Nil {
			return apperr.New(apperr.CodeInvalidState, "You already have an internship.")
		} else if err != nil && !errors.Is(err, store.ErrNotFound) {
			return err
		}
		// The cohort is checked when it is picked: a cohort that closed after the student
		// joined it doesn't block fixing their details.
		cohort, err := store.GetCohort(ctx, q, in.CohortID, false)
		var cohortErr string
		switch {
		case errors.Is(err, store.ErrNotFound) || err == nil && !admitting(cohort, now):
			cohortErr = "Pick a cohort that's taking applications."
		case err != nil:
			return err
		case cohort.SeatsUsed >= cohort.Cohort.SeatsTotal:
			cohortErr = "This cohort is full. Pick another one."
		}
		app, err := store.OpenApplication(ctx, q, u.ID, true)
		if errors.Is(err, store.ErrNotFound) {
			if cohortErr != "" {
				errs["cohort_id"] = cohortErr
			}
			if len(errs) > 0 {
				return apperr.Validation(errs)
			}
			saved, err = store.InsertApplication(ctx, q, u.ID, cohort.Cohort.ID, details, *cohort.Cohort.FeeINR, now)
			if errors.Is(err, store.ErrOpenApplication) {
				return apperr.New(apperr.CodeVersionConflict, "You already started an application. We refreshed it.")
			}
			return err
		}
		if err != nil {
			return err
		}
		if in.ExpectedVersion == nil || *in.ExpectedVersion != app.Version {
			return apperr.New(apperr.CodeVersionConflict, "Your application changed. We refreshed it.")
		}
		changingCohort := app.CohortID != in.CohortID
		editing := app.Details != details
		switch {
		case changingCohort && !app.Status.Allows(app.Flag, domain.ActionChangeCohort):
			errs["cohort_id"] = "You can't change the cohort right now. Message us if you need to."
		case changingCohort && cohortErr != "":
			errs["cohort_id"] = cohortErr
		}
		if editing && !app.Status.Allows(app.Flag, domain.ActionEditDetails) {
			return apperr.New(apperr.CodeInvalidState, "Your details can't be changed while the payment is being checked.")
		}
		if len(errs) > 0 {
			return apperr.Validation(errs)
		}
		app.Details = details
		if changingCohort {
			app.CohortID = cohort.Cohort.ID
			app.FeeINR = *cohort.Cohort.FeeINR
			if app.Status == domain.AppFlagged {
				// Money already confirmed carries over: covered → back to review, short → pay the rest.
				if app.DueINR() == 0 {
					app.Status, app.Flag, app.FlagNote = domain.AppSubmitted, nil, ""
				} else {
					f := domain.FlagPartialPayment
					app.Flag, app.FlagNote = &f, ""
				}
				msg := fmt.Sprintf("Switched to %s (fee %s).", cohort.Cohort.Name, domain.INR(app.FeeINR))
				if err := a.system(ctx, q, app.ID, msg, now); err != nil {
					return err
				}
				if err := store.MarkApplicationUnread(ctx, q, app.ID, true); err != nil {
					return err
				}
			}
		}
		saved, err = store.SaveApplication(ctx, q, app, now)
		return err
	})
	if err != nil {
		return ApplicantView{}, err
	}
	_ = saved
	return a.Mine(ctx, u)
}

// admitting reports whether a cohort takes applications now.
func admitting(c store.CohortRow, now time.Time) bool {
	y, m, d := now.UTC().Date()
	today := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
	return c.Cohort.ApplicationsOpen && c.Cohort.FeeINR != nil && !c.Cohort.StartDate.Before(today.AddDate(0, 0, -7))
}

// ProofInput is an uploaded payment screenshot.
type ProofInput struct {
	Image           []byte
	UTR             string
	AmountINR       int
	ExpectedVersion int
}

// UploadProof attaches a screenshot and sends the application for review.
func (a *Admissions) UploadProof(ctx context.Context, u domain.User, in ProofInput) (ApplicantView, error) {
	if u.Role != domain.RoleStudent {
		return ApplicantView{}, errAppStudents
	}
	proof, errs := domain.ValidateProof(in.Image, in.UTR, in.AmountINR)
	now := a.now()
	err := a.ws.Store.Tx(ctx, func(q store.Q) error {
		app, err := store.OpenApplication(ctx, q, u.ID, true)
		if errors.Is(err, store.ErrNotFound) {
			return errNoApplication
		}
		if err != nil {
			return err
		}
		if app.Version != in.ExpectedVersion {
			return apperr.New(apperr.CodeVersionConflict, "Your application changed. We refreshed it.")
		}
		if !app.Status.Allows(app.Flag, domain.ActionPay) {
			return apperr.New(apperr.CodeInvalidState, "We're checking your last payment. Wait for our reply, or message us.")
		}
		if len(errs) > 0 {
			return apperr.Validation(errs)
		}
		dayStart := now.Truncate(24 * time.Hour)
		n, err := store.CountProofsSince(ctx, q, app.ID, dayStart)
		if err != nil {
			return err
		}
		if n >= ProofsPerDay {
			return rateLimited("You've uploaded a lot today. Try again tomorrow, or message us.", dayStart.Add(24*time.Hour).Sub(now))
		}
		if here, err := store.ProofUsedHere(ctx, q, app.ID, proof.SHA256, proof.UTR); err != nil {
			return err
		} else if here {
			return apperr.Validation(map[string]string{"image": "You already sent this screenshot or UTR. Upload the proof for your new payment."})
		}
		if elsewhere, err := store.ProofUsedElsewhere(ctx, q, app.ID, proof.SHA256, proof.UTR); err != nil {
			return err
		} else if elsewhere {
			return apperr.Validation(map[string]string{"image": "This screenshot or UTR was already used for another application."})
		}
		if _, err := store.InsertProof(ctx, q, app.ID, proof, now); err != nil {
			return err
		}
		app.Status, app.Flag, app.FlagNote = domain.AppSubmitted, nil, ""
		if _, err := store.SaveApplication(ctx, q, app, now); err != nil {
			return err
		}
		if err := a.system(ctx, q, app.ID, fmt.Sprintf("Payment proof uploaded for %s with UTR %s. We'll confirm it soon.", domain.INR(proof.Amount), proof.UTR), now); err != nil {
			return err
		}
		return store.MarkApplicationUnread(ctx, q, app.ID, true)
	})
	if err != nil {
		return ApplicantView{}, err
	}
	return a.Mine(ctx, u)
}

// Resubmit sends a flagged application back for review without a new payment.
func (a *Admissions) Resubmit(ctx context.Context, u domain.User, expectedVersion int) (ApplicantView, error) {
	if u.Role != domain.RoleStudent {
		return ApplicantView{}, errAppStudents
	}
	now := a.now()
	err := a.ws.Store.Tx(ctx, func(q store.Q) error {
		app, err := store.OpenApplication(ctx, q, u.ID, true)
		if errors.Is(err, store.ErrNotFound) {
			return errNoApplication
		}
		if err != nil {
			return err
		}
		if app.Version != expectedVersion {
			return apperr.New(apperr.CodeVersionConflict, "Your application changed. We refreshed it.")
		}
		if !app.Status.Allows(app.Flag, domain.ActionResubmit) {
			return apperr.New(apperr.CodeInvalidState, "There's nothing to send back right now.")
		}
		app.Status, app.Flag, app.FlagNote = domain.AppSubmitted, nil, ""
		if _, err := store.SaveApplication(ctx, q, app, now); err != nil {
			return err
		}
		if err := a.system(ctx, q, app.ID, "Sent back for review.", now); err != nil {
			return err
		}
		return store.MarkApplicationUnread(ctx, q, app.ID, true)
	})
	if err != nil {
		return ApplicantView{}, err
	}
	return a.Mine(ctx, u)
}

// MyProofImage returns one of the student's own screenshots.
func (a *Admissions) MyProofImage(ctx context.Context, u domain.User, proofID uuid.UUID) ([]byte, string, error) {
	app, err := store.LatestApplication(ctx, a.ws.Store.Pool, u.ID)
	if errors.Is(err, store.ErrNotFound) {
		return nil, "", errNotFound
	}
	if err != nil {
		return nil, "", err
	}
	img, typ, err := store.ProofImage(ctx, a.ws.Store.Pool, app.ID, proofID)
	if errors.Is(err, store.ErrNotFound) {
		return nil, "", errNotFound
	}
	return img, typ, err
}

// PaymentQR returns the UPI QR for anyone signed in (students need it to pay).
func (a *Admissions) PaymentQR(ctx context.Context) ([]byte, string, error) {
	img, typ, err := store.GetPaymentQR(ctx, a.ws.Store.Pool)
	if errors.Is(err, store.ErrNotFound) {
		return nil, "", apperr.New(apperr.CodeNotConfigured, "No payment QR yet.")
	}
	return img, typ, err
}

// SendAsApplicant posts the student's message in their application chat.
func (a *Admissions) SendAsApplicant(ctx context.Context, u domain.User, clientID uuid.UUID, body string) (store.AppMessage, error) {
	if u.Role != domain.RoleStudent {
		return store.AppMessage{}, errAppStudents
	}
	clean, msgErr := domain.ValidateMessage(body)
	if msgErr != "" || clientID == uuid.Nil {
		fields := map[string]string{}
		if msgErr != "" {
			fields["body"] = msgErr
		}
		if clientID == uuid.Nil {
			fields["client_id"] = "Must be a UUID."
		}
		return store.AppMessage{}, apperr.Validation(fields)
	}
	now := a.now()
	var out store.AppMessage
	err := a.ws.Store.Tx(ctx, func(q store.Q) error {
		app, err := store.LatestApplication(ctx, q, u.ID)
		if errors.Is(err, store.ErrNotFound) {
			return errNoApplication
		}
		if err != nil {
			return err
		}
		dayStart := now.Truncate(24 * time.Hour)
		n, err := store.CountAppMessagesSince(ctx, q, app.ID, dayStart)
		if err != nil {
			return err
		}
		if n >= ApplicantMsgsPerDay {
			return rateLimited("You've sent a lot of messages today. We'll reply to what you've sent.", dayStart.Add(24*time.Hour).Sub(now))
		}
		cid := clientID
		m, created, err := store.InsertAppMessage(ctx, q, app.ID, domain.AuthorApplicant, &u.ID, clean, &cid, now)
		if err != nil {
			return err
		}
		out = m
		if created {
			return store.MarkApplicationUnread(ctx, q, app.ID, true)
		}
		return nil
	})
	return out, err
}

func (a *Admissions) system(ctx context.Context, q store.Q, appID uuid.UUID, body string, now time.Time) error {
	if utf8.RuneCountInString(body) > domain.ApplicationMsgMax {
		body = string([]rune(body)[:domain.ApplicationMsgMax-1]) + "…"
	}
	_, _, err := store.InsertAppMessage(ctx, q, appID, domain.AuthorSystem, nil, body, nil, now)
	return err
}

// ---- Staff ----

// Applications lists the queue in the staff member's scope.
func (a *Admissions) Applications(ctx context.Context, u domain.User, status *domain.ApplicationStatus) ([]store.ApplicationRow, int, error) {
	only, err := staffCollege(u)
	if err != nil {
		return nil, 0, err
	}
	rows, err := store.ListApplications(ctx, a.ws.Store.Pool, only, status, ApplicationsQueueMax)
	if err != nil {
		return nil, 0, err
	}
	waiting, err := store.CountWaitingApplications(ctx, a.ws.Store.Pool, only)
	return rows, waiting, err
}

// StaffView is one application for a reviewer.
type StaffView struct {
	ApplicantView
	Applicant domain.User
}

func (a *Admissions) staffApp(ctx context.Context, q store.Q, u domain.User, id uuid.UUID, forUpdate bool) (domain.Application, store.CohortRow, error) {
	only, err := staffCollege(u)
	if err != nil {
		return domain.Application{}, store.CohortRow{}, err
	}
	app, err := store.GetApplication(ctx, q, id, forUpdate)
	if errors.Is(err, store.ErrNotFound) {
		return app, store.CohortRow{}, errNotFound
	}
	if err != nil {
		return app, store.CohortRow{}, err
	}
	c, err := store.GetCohort(ctx, q, app.CohortID, false)
	if err != nil {
		return app, c, err
	}
	if only != nil && (c.Cohort.CollegeID == nil || *c.Cohort.CollegeID != *only) {
		return app, c, errNotFound // never reveal applications outside the actor's scope
	}
	return app, c, nil
}

// Application returns one application with its proofs and chat, and marks it read.
func (a *Admissions) Application(ctx context.Context, u domain.User, id uuid.UUID) (StaffView, error) {
	q := a.ws.Store.Pool
	app, _, err := a.staffApp(ctx, q, u, id, false)
	if err != nil {
		return StaffView{}, err
	}
	v, err := a.fill(ctx, ApplicantView{}, app, true)
	if err != nil {
		return StaffView{}, err
	}
	if v.Cohorts, err = store.OpenCohorts(ctx, q, a.now()); err != nil {
		return StaffView{}, err
	}
	applicant, err := store.GetUser(ctx, q, app.UserID)
	return StaffView{ApplicantView: v, Applicant: applicant}, err
}

// StaffProofImage returns a screenshot of an application in scope.
func (a *Admissions) StaffProofImage(ctx context.Context, u domain.User, appID, proofID uuid.UUID) ([]byte, string, error) {
	if _, _, err := a.staffApp(ctx, a.ws.Store.Pool, u, appID, false); err != nil {
		return nil, "", err
	}
	img, typ, err := store.ProofImage(ctx, a.ws.Store.Pool, appID, proofID)
	if errors.Is(err, store.ErrNotFound) {
		return nil, "", errNotFound
	}
	return img, typ, err
}

// Decision is a reviewer's call on an application.
type Decision struct {
	Action          domain.ApplicationDecision
	Flag            domain.ApplicationFlag
	Note            string
	PaidINR         *int // total confirmed so far; required for a partial payment
	FlowID          *uuid.UUID
	ExpectedVersion int
}

// Decide approves (and enrolls), flags or rejects an application.
func (a *Admissions) Decide(ctx context.Context, u domain.User, id uuid.UUID, d Decision) (StaffView, error) {
	now := a.now()
	err := a.ws.Store.Tx(ctx, func(q store.Q) error {
		app, cohort, err := a.staffApp(ctx, q, u, id, true)
		if err != nil {
			return err
		}
		if app.Version != d.ExpectedVersion {
			return apperr.New(apperr.CodeVersionConflict, "The applicant changed this application. We refreshed it.")
		}
		if !app.Status.Open() {
			return apperr.New(apperr.CodeInvalidTransition, "This application is already closed.")
		}
		if d.PaidINR != nil && (*d.PaidINR < 0 || *d.PaidINR > domain.FeeMaxINR) {
			return apperr.Validation(map[string]string{"paid_inr": "Enter the total amount received, in rupees."})
		}
		switch d.Action {
		case domain.DecideApprove:
			return a.approve(ctx, q, u, app, cohort, d, now)
		case domain.DecideFlag:
			return a.flag(ctx, q, app, d, now)
		case domain.DecideReject:
			note := domain.NormalizeText(d.Note)
			if utf8.RuneCountInString(note) < 5 || utf8.RuneCountInString(note) > domain.FlagNoteMax {
				return apperr.Validation(map[string]string{"note": "Tell the applicant why (5 to 1000 characters)."})
			}
			app.Status, app.Flag, app.FlagNote, app.DecidedAt = domain.AppRejected, nil, note, &now
			if _, err := store.SaveApplication(ctx, q, app, now); err != nil {
				return err
			}
			if err := store.SetDecidedBy(ctx, q, app.ID, u.ID); err != nil {
				return err
			}
			msg := "Your application was closed.\n\nThe reason given was " + strings.TrimSuffix(note, ".") + ".\n\n" + domain.NoRefundPolicy
			if err := a.system(ctx, q, app.ID, msg, now); err != nil {
				return err
			}
			return store.MarkApplicationUnread(ctx, q, app.ID, false)
		}
		return apperr.Validation(map[string]string{"action": "Pick approve, flag or reject."})
	})
	if err != nil {
		return StaffView{}, err
	}
	return a.Application(ctx, u, id)
}

func (a *Admissions) flag(ctx context.Context, q store.Q, app domain.Application, d Decision, now time.Time) error {
	note, errs := domain.ValidateFlag(d.Flag, d.Note)
	if d.Flag == domain.FlagPartialPayment {
		switch {
		case d.PaidINR == nil:
			errs["paid_inr"] = "Enter how much arrived in total."
		case *d.PaidINR >= app.FeeINR:
			errs["paid_inr"] = fmt.Sprintf("That covers the %s fee. Approve it instead.", domain.INR(app.FeeINR))
		}
	}
	if len(errs) > 0 {
		return apperr.Validation(errs)
	}
	if d.PaidINR != nil {
		app.PaidINR = *d.PaidINR
	}
	f := d.Flag
	app.Status, app.Flag, app.FlagNote = domain.AppFlagged, &f, note
	if _, err := store.SaveApplication(ctx, q, app, now); err != nil {
		return err
	}
	if err := a.system(ctx, q, app.ID, domain.FlagMessage(f, app, note), now); err != nil {
		return err
	}
	return store.MarkApplicationUnread(ctx, q, app.ID, false)
}

func (a *Admissions) approve(ctx context.Context, q store.Q, u domain.User, app domain.Application, cohort store.CohortRow, d Decision, now time.Time) error {
	paid := app.PaidINR
	if d.PaidINR != nil {
		paid = *d.PaidINR
	}
	if paid < app.FeeINR {
		return apperr.Validation(map[string]string{"paid_inr": fmt.Sprintf("Confirm the full %s fee arrived, or flag it as a partial payment.", domain.INR(app.FeeINR))})
	}
	applicant, err := store.GetUser(ctx, q, app.UserID)
	if err != nil {
		return err
	}
	email := ""
	if applicant.Email != nil {
		email = *applicant.Email
	}
	only, err := staffCollege(u)
	if err != nil {
		return err
	}
	person, errs := domain.ValidatePerson(domain.PersonInput{GitHubLogin: applicant.GitHubLogin, Name: app.Details.FullName, Email: email})
	loc, _ := domain.LoadTimezone(domain.DefaultTimezone)
	in := EnrollInput{Person: person, CohortID: &cohort.Cohort.ID, Timezone: domain.DefaultTimezone, FlowID: d.FlowID}
	// A cohort that started a little while ago still takes this student, from today.
	if y, m, day := now.In(loc).Date(); cohort.Cohort.StartDate.Before(time.Date(y, m, day, 0, 0, 0, 0, time.UTC)) {
		today := time.Date(y, m, day, 0, 0, 0, 0, time.UTC)
		in.StartDate = &today
	}
	res, err := a.ws.enrollTx(ctx, q, u, in, only, person, errs, loc, now)
	if err != nil {
		var ae *apperr.Error
		if errors.As(err, &ae) && ae.Code == apperr.CodeValidationFailed {
			for _, v := range ae.Fields {
				return apperr.Validation(map[string]string{"action": "Couldn't enroll. " + strings.TrimSuffix(v, ".") + "."})
			}
		}
		return err
	}
	eid := res.Student.Enrollment.ID
	app.Status, app.Flag, app.FlagNote, app.PaidINR, app.DecidedAt, app.EnrollmentID = domain.AppApproved, nil, "", paid, &now, &eid
	if _, err := store.SaveApplication(ctx, q, app, now); err != nil {
		return err
	}
	if err := store.SetDecidedBy(ctx, q, app.ID, u.ID); err != nil {
		return err
	}
	msg := fmt.Sprintf("Payment of %s confirmed. You're enrolled in %s. Open your workspace to meet your team.", domain.INR(paid), cohort.Cohort.Name)
	if err := a.system(ctx, q, app.ID, msg, now); err != nil {
		return err
	}
	return store.MarkApplicationUnread(ctx, q, app.ID, false)
}

// SendAsStaff posts a reviewer's message in an application chat.
func (a *Admissions) SendAsStaff(ctx context.Context, u domain.User, id, clientID uuid.UUID, body string) (store.AppMessage, error) {
	clean, msgErr := domain.ValidateMessage(body)
	if msgErr != "" || clientID == uuid.Nil {
		fields := map[string]string{}
		if msgErr != "" {
			fields["body"] = msgErr
		}
		if clientID == uuid.Nil {
			fields["client_id"] = "Must be a UUID."
		}
		return store.AppMessage{}, apperr.Validation(fields)
	}
	now := a.now()
	var out store.AppMessage
	err := a.ws.Store.Tx(ctx, func(q store.Q) error {
		app, _, err := a.staffApp(ctx, q, u, id, false)
		if err != nil {
			return err
		}
		cid := clientID
		m, created, err := store.InsertAppMessage(ctx, q, app.ID, domain.AuthorStaff, &u.ID, clean, &cid, now)
		if err != nil {
			return err
		}
		out = m
		if created {
			return store.MarkApplicationUnread(ctx, q, app.ID, false)
		}
		return nil
	})
	return out, err
}

// ---- Settings ----

func requirePlatformAdmin(u domain.User) error {
	if u.Role != domain.RoleAdmin {
		return apperr.New(apperr.CodeForbidden, "Only platform admins can change this.")
	}
	return nil
}

// PaymentSettings returns where applicants pay.
func (a *Admissions) PaymentSettings(ctx context.Context, u domain.User) (store.PaymentSettings, error) {
	if !u.Role.IsStaff() {
		return store.PaymentSettings{}, errStaffOnly
	}
	return store.GetPaymentSettings(ctx, a.ws.Store.Pool)
}

// SetPaymentDetails updates the UPI ID, payee name and note.
func (a *Admissions) SetPaymentDetails(ctx context.Context, u domain.User, upi, payee, note string) (store.PaymentSettings, error) {
	if err := requirePlatformAdmin(u); err != nil {
		return store.PaymentSettings{}, err
	}
	upi, payee, note = strings.TrimSpace(upi), domain.NormalizeText(payee), domain.NormalizeText(note)
	errs := map[string]string{}
	if upi != "" && !upiPattern(upi) {
		errs["upi_id"] = "UPI IDs look like name@bank."
	}
	if utf8.RuneCountInString(payee) > 100 {
		errs["payee_name"] = "Keep it under 100 characters."
	}
	if utf8.RuneCountInString(note) > 500 {
		errs["note"] = "Keep it under 500 characters."
	}
	if len(errs) > 0 {
		return store.PaymentSettings{}, apperr.Validation(errs)
	}
	if err := store.SetPaymentDetails(ctx, a.ws.Store.Pool, upi, payee, note, u.ID, a.now()); err != nil {
		return store.PaymentSettings{}, err
	}
	return store.GetPaymentSettings(ctx, a.ws.Store.Pool)
}

func upiPattern(s string) bool {
	at := strings.IndexByte(s, '@')
	if at < 2 || at == len(s)-1 || len(s) > 100 || strings.Count(s, "@") != 1 {
		return false
	}
	for _, r := range s {
		allowed := r == '@' || r == '.' || r == '-' || r == '_' || r >= '0' && r <= '9' || r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z'
		if !allowed {
			return false
		}
	}
	return true
}

// SetPaymentQR replaces the UPI QR image.
func (a *Admissions) SetPaymentQR(ctx context.Context, u domain.User, image []byte) (store.PaymentSettings, error) {
	if err := requirePlatformAdmin(u); err != nil {
		return store.PaymentSettings{}, err
	}
	typ := domain.ImageType(image)
	switch {
	case len(image) == 0:
		return store.PaymentSettings{}, apperr.Validation(map[string]string{"image": "Attach the QR image."})
	case len(image) > domain.QRMaxBytes:
		return store.PaymentSettings{}, apperr.Validation(map[string]string{"image": "The QR image must be under 2 MB."})
	case typ == "":
		return store.PaymentSettings{}, apperr.Validation(map[string]string{"image": "Use a PNG, JPG or WebP image."})
	}
	if err := store.SetPaymentQR(ctx, a.ws.Store.Pool, image, typ, u.ID, a.now()); err != nil {
		return store.PaymentSettings{}, err
	}
	return store.GetPaymentSettings(ctx, a.ws.Store.Pool)
}

// SetCohortAdmissions sets a cohort's fee and whether it takes applications.
func (a *Admissions) SetCohortAdmissions(ctx context.Context, u domain.User, id uuid.UUID, fee *int, open bool) (store.CohortRow, error) {
	if err := requirePlatformAdmin(u); err != nil {
		return store.CohortRow{}, err
	}
	if fee != nil && (*fee < 1 || *fee > domain.FeeMaxINR) {
		return store.CohortRow{}, apperr.Validation(map[string]string{"fee_inr": "Enter a fee between ₹1 and ₹1,00,00,000."})
	}
	if open && fee == nil {
		return store.CohortRow{}, apperr.Validation(map[string]string{"fee_inr": "Set a fee before opening applications."})
	}
	q := a.ws.Store.Pool
	if err := store.SetCohortAdmissions(ctx, q, id, fee, open); errors.Is(err, store.ErrNotFound) {
		return store.CohortRow{}, errNotFound
	} else if err != nil {
		return store.CohortRow{}, err
	}
	return store.GetCohort(ctx, q, id, false)
}
