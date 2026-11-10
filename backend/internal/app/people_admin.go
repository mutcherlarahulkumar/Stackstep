package app

import (
	"context"
	"errors"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// UsersPageMax is the most people one directory page returns.
const UsersPageMax = 100

// MarkPresent records today's visit for a student with an open internship, in their zone.
// Staff and people without an internship have no attendance.
func (w *Workspace) MarkPresent(ctx context.Context, u domain.User) error {
	if u.Role != domain.RoleStudent {
		return nil
	}
	e, err := store.OpenEnrollmentForUser(ctx, w.Store.Pool, u.ID)
	if errors.Is(err, store.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	now := w.Clock.Now()
	day := domain.LocalDate(now, e.Location())
	if e.Status != domain.EnrollmentActive || day.Before(e.StartDate) || day.After(e.EndDate) {
		return nil
	}
	return store.MarkAttendance(ctx, w.Store.Pool, u.ID, day, now)
}

// attendanceOf builds the record for an enrollment.
func (w *Workspace) attendanceOf(ctx context.Context, e domain.Enrollment) (domain.Attendance, error) {
	marks, err := store.AttendanceMarks(ctx, w.Store.Pool, e.UserID, e.StartDate, e.EndDate)
	if err != nil {
		return domain.Attendance{}, err
	}
	return domain.AttendanceFor(e, marks, w.Clock.Now()), nil
}

// MyAttendance is the signed-in student's own record for their open internship.
func (w *Workspace) MyAttendance(ctx context.Context, u domain.User) (domain.Attendance, error) {
	e, err := store.OpenEnrollmentForUser(ctx, w.Store.Pool, u.ID)
	if errors.Is(err, store.ErrNotFound) {
		return domain.Attendance{}, apperr.New(apperr.CodeNoActiveEnrollment, "You don't have an internship yet.")
	}
	if err != nil {
		return domain.Attendance{}, err
	}
	return w.attendanceOf(ctx, e)
}

// Users is the people directory: everyone in the staff member's scope.
func (w *Workspace) Users(ctx context.Context, u domain.User, f store.UserFilter) ([]store.UserDirRow, error) {
	college, err := staffCollege(u)
	if err != nil {
		return nil, err
	}
	f.College = college
	f.Search = domain.NormalizeText(f.Search)
	if utf8.RuneCountInString(f.Search) > domain.SearchQueryMaxLen {
		return nil, apperr.Validation(map[string]string{"q": "Search can be at most 100 characters."})
	}
	switch f.Kind {
	case store.UsersAll, store.UsersInterns, store.UsersApplicants, store.UsersStaff, store.UsersToday:
	case "":
		f.Kind = store.UsersAll
	default:
		return nil, apperr.Validation(map[string]string{"kind": "Pick all, interns, applicants, staff or today."})
	}
	if f.Limit <= 0 || f.Limit > UsersPageMax {
		f.Limit = UsersPageMax
	}
	f.Offset = max(f.Offset, 0)
	return store.ListUsers(ctx, w.Store.Pool, f, w.Clock.Now())
}

// Profile is everything staff see about one person.
type Profile struct {
	User         domain.User
	Meta         store.UserMeta
	Enrollments  []store.EnrollmentSummary
	Applications []store.ApplicationSummary
	Attendance   *domain.Attendance // for the open (or latest) internship
	Notes        []store.StaffNote
}

// canSeePerson checks the staff member may look at this person: platform admins see anyone,
// college admins see people of their college.
func (w *Workspace) canSeePerson(ctx context.Context, staff domain.User, id uuid.UUID) (domain.User, error) {
	college, err := staffCollege(staff)
	if err != nil {
		return domain.User{}, err
	}
	person, err := store.GetUser(ctx, w.Store.Pool, id)
	if errors.Is(err, store.ErrNotFound) {
		return domain.User{}, apperr.New(apperr.CodeNotFound, "That person doesn't exist.")
	}
	if err != nil {
		return domain.User{}, err
	}
	if college == nil {
		return person, nil
	}
	if person.CollegeID != nil && *person.CollegeID == *college {
		return person, nil
	}
	ens, err := store.UserEnrollments(ctx, w.Store.Pool, id)
	if err != nil {
		return domain.User{}, err
	}
	for _, e := range ens {
		if e.Enrollment.CollegeID != nil && *e.Enrollment.CollegeID == *college {
			return person, nil
		}
	}
	return domain.User{}, apperr.New(apperr.CodeNotFound, "That person doesn't exist.")
}

// PersonProfile loads a person's profile for staff.
func (w *Workspace) PersonProfile(ctx context.Context, staff domain.User, id uuid.UUID) (Profile, error) {
	person, err := w.canSeePerson(ctx, staff, id)
	if err != nil {
		return Profile{}, err
	}
	p := Profile{User: person}
	if p.Meta, err = store.GetUserMeta(ctx, w.Store.Pool, id); err != nil {
		return Profile{}, err
	}
	if p.Enrollments, err = store.UserEnrollments(ctx, w.Store.Pool, id); err != nil {
		return Profile{}, err
	}
	if p.Applications, err = store.UserApplications(ctx, w.Store.Pool, id); err != nil {
		return Profile{}, err
	}
	if p.Notes, err = store.ListStaffNotes(ctx, w.Store.Pool, id); err != nil {
		return Profile{}, err
	}
	if len(p.Enrollments) > 0 {
		pick := p.Enrollments[0].Enrollment
		for _, e := range p.Enrollments {
			if e.Enrollment.Status == domain.EnrollmentActive || e.Enrollment.Status == domain.EnrollmentPaused {
				pick = e.Enrollment
				break
			}
		}
		a, err := w.attendanceOf(ctx, pick)
		if err != nil {
			return Profile{}, err
		}
		p.Attendance = &a
	}
	return p, nil
}

// SignOutEverywhere ends every session a person has, so they must sign in with GitHub again.
// Platform admins can do it to anyone but themselves.
func (w *Workspace) SignOutEverywhere(ctx context.Context, staff domain.User, id uuid.UUID) error {
	if staff.Role != domain.RoleAdmin {
		return errPlatformAdmin
	}
	if staff.ID == id {
		return apperr.New(apperr.CodeInvalidTransition, "Sign yourself out from your own menu instead.")
	}
	if _, err := w.canSeePerson(ctx, staff, id); err != nil {
		return err
	}
	return w.Store.Tx(ctx, func(q store.Q) error { return store.SignOutEverywhere(ctx, q, id, w.Clock.Now()) })
}

// AddStaffNote adds a private note about a person.
func (w *Workspace) AddStaffNote(ctx context.Context, staff domain.User, subject uuid.UUID, body string) (store.StaffNote, error) {
	if _, err := w.canSeePerson(ctx, staff, subject); err != nil {
		return store.StaffNote{}, err
	}
	text, msg := domain.ValidateStaffNote(body)
	if msg != "" {
		return store.StaffNote{}, apperr.Validation(map[string]string{"body": msg})
	}
	id, err := store.InsertStaffNote(ctx, w.Store.Pool, subject, staff.ID, text, w.Clock.Now())
	if err != nil {
		return store.StaffNote{}, err
	}
	return store.GetStaffNote(ctx, w.Store.Pool, id)
}

// noteInScope loads a note the staff member may change.
func (w *Workspace) noteInScope(ctx context.Context, staff domain.User, id uuid.UUID) (store.StaffNote, error) {
	n, err := store.GetStaffNote(ctx, w.Store.Pool, id)
	if errors.Is(err, store.ErrNotFound) {
		return store.StaffNote{}, apperr.New(apperr.CodeNotFound, "That note doesn't exist.")
	}
	if err != nil {
		return store.StaffNote{}, err
	}
	if _, err := w.canSeePerson(ctx, staff, n.SubjectID); err != nil {
		return store.StaffNote{}, apperr.New(apperr.CodeNotFound, "That note doesn't exist.")
	}
	return n, nil
}

// EditStaffNote changes a note's text and/or ticks it off.
func (w *Workspace) EditStaffNote(ctx context.Context, staff domain.User, id uuid.UUID, body *string, done *bool) (store.StaffNote, error) {
	n, err := w.noteInScope(ctx, staff, id)
	if err != nil {
		return store.StaffNote{}, err
	}
	now := w.Clock.Now()
	text := n.Body
	if body != nil {
		t, msg := domain.ValidateStaffNote(*body)
		if msg != "" {
			return store.StaffNote{}, apperr.Validation(map[string]string{"body": msg})
		}
		text = t
	}
	doneAt := n.DoneAt
	if done != nil {
		switch {
		case *done && doneAt == nil:
			doneAt = &now
		case !*done:
			doneAt = nil
		}
	}
	if err := store.UpdateStaffNote(ctx, w.Store.Pool, id, text, doneAt, now); err != nil {
		return store.StaffNote{}, err
	}
	return store.GetStaffNote(ctx, w.Store.Pool, id)
}

// DeleteStaffNote removes a note.
func (w *Workspace) DeleteStaffNote(ctx context.Context, staff domain.User, id uuid.UUID) error {
	if _, err := w.noteInScope(ctx, staff, id); err != nil {
		return err
	}
	return store.DeleteStaffNote(ctx, w.Store.Pool, id)
}
