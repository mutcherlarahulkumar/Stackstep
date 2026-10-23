package app

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

var errPlatformAdmin = apperr.New(apperr.CodeForbidden, "Only platform admins can do this.")

// staffCollege is the college a staff member is limited to (nil for platform admins).
func staffCollege(u domain.User) (*uuid.UUID, error) {
	switch u.Role {
	case domain.RoleAdmin:
		return nil, nil
	case domain.RoleCollegeAdmin:
		if u.CollegeID == nil {
			return nil, errStaffOnly
		}
		return u.CollegeID, nil
	case domain.RoleStudent:
		return nil, errStaffOnly
	}
	return nil, errStaffOnly
}

// Colleges lists colleges: all for admins, their own for college admins.
func (w *Workspace) Colleges(ctx context.Context, u domain.User) ([]store.CollegeRow, error) {
	only, err := staffCollege(u)
	if err != nil {
		return nil, err
	}
	return store.ListColleges(ctx, w.Store.Pool, only)
}

// CreateCollege adds a college (platform admins only).
func (w *Workspace) CreateCollege(ctx context.Context, u domain.User, rawName string) (domain.College, error) {
	if u.Role != domain.RoleAdmin {
		return domain.College{}, errPlatformAdmin
	}
	name, msg := domain.ValidateName(rawName, "college")
	if msg != "" {
		return domain.College{}, apperr.Validation(map[string]string{"name": msg})
	}
	c, err := store.InsertCollege(ctx, w.Store.Pool, name, w.Clock.Now())
	if errors.Is(err, store.ErrDuplicate) {
		return domain.College{}, apperr.Validation(map[string]string{"name": "A college with this name already exists."})
	}
	return c, err
}

// Programs lists the programs students can be enrolled in.
func (w *Workspace) Programs(ctx context.Context, u domain.User) ([]store.ProgramRow, error) {
	if err := requireStaff(u); err != nil {
		return nil, err
	}
	return store.ListPrograms(ctx, w.Store.Pool)
}

// Cohorts lists cohorts in scope.
func (w *Workspace) Cohorts(ctx context.Context, u domain.User) ([]store.CohortRow, error) {
	only, err := staffCollege(u)
	if err != nil {
		return nil, err
	}
	return store.ListCohorts(ctx, w.Store.Pool, only)
}

// CohortInput creates a cohort.
type CohortInput struct {
	Kind        domain.CohortKind
	Name        string
	CollegeID   *uuid.UUID
	ProgramSlug string
	StartDate   time.Time
	Timezone    string
	SeatsTotal  int
}

// CreateCohort adds a cohort (platform admins only).
func (w *Workspace) CreateCohort(ctx context.Context, u domain.User, in CohortInput) (store.CohortRow, error) {
	if u.Role != domain.RoleAdmin {
		return store.CohortRow{}, errPlatformAdmin
	}
	errs := map[string]string{}
	name, msg := domain.ValidateName(in.Name, "cohort")
	if msg != "" {
		errs["name"] = msg
	}
	switch {
	case !in.Kind.Valid():
		errs["kind"] = "Pick college or group."
	case in.Kind == domain.CohortCollege && in.CollegeID == nil:
		errs["college_id"] = "Pick the college."
	case in.Kind == domain.CohortGroup && in.CollegeID != nil:
		errs["college_id"] = "Group cohorts don't belong to a college."
	}
	if in.SeatsTotal < 1 || in.SeatsTotal > domain.MaxSeats {
		errs["seats_total"] = fmt.Sprintf("Seats must be 1 to %d.", domain.MaxSeats)
	}
	loc, msg := domain.LoadTimezone(in.Timezone)
	if msg != "" {
		errs["timezone"] = msg
	} else if msg := domain.ValidateStartDate(in.StartDate, loc, w.Clock.Now()); msg != "" {
		errs["start_date"] = msg
	}
	var out store.CohortRow
	err := w.Store.Tx(ctx, func(q store.Q) error {
		p, err := store.ProgramBySlug(ctx, q, in.ProgramSlug)
		if errors.Is(err, store.ErrNotFound) {
			errs["program_slug"] = "Pick a program."
		} else if err != nil {
			return err
		}
		if in.CollegeID != nil && errs["college_id"] == "" {
			ok, err := store.CollegeExists(ctx, q, *in.CollegeID)
			if err != nil {
				return err
			}
			if !ok {
				errs["college_id"] = "That college doesn't exist."
			}
		}
		if len(errs) > 0 {
			return apperr.Validation(errs)
		}
		id, err := store.InsertCohort(ctx, q, domain.Cohort{Kind: in.Kind, Name: name, CollegeID: in.CollegeID, StartDate: in.StartDate, SeatsTotal: in.SeatsTotal}, p.ID, w.Clock.Now())
		if err != nil {
			return err
		}
		out, err = store.GetCohort(ctx, q, id, false)
		return err
	})
	return out, err
}

// EnrollInput enrolls one student. Shared fields come from the form or the import settings.
type EnrollInput struct {
	Person      domain.PersonInput
	CohortID    *uuid.UUID
	ProgramSlug string     // required without a cohort; must match the cohort's program otherwise
	StartDate   *time.Time // defaults to the cohort's start date
	Timezone    string
	FlowID      *uuid.UUID
}

// EnrollResult is a created internship.
type EnrollResult struct {
	Student     store.StudentRow
	UserCreated bool // the student hasn't signed in yet; GitHub sign-in links them by login
	FlowErr     *apperr.Error
}

// Enroll creates an internship for a GitHub login, creating the user if needed. Platform admins
// may enroll into any cohort or none; college admins only into their college's cohorts.
func (w *Workspace) Enroll(ctx context.Context, u domain.User, in EnrollInput) (EnrollResult, error) {
	only, err := staffCollege(u)
	if err != nil {
		return EnrollResult{}, err
	}
	person, errs := domain.ValidatePerson(in.Person)
	if only != nil && in.CohortID == nil {
		errs["cohort_id"] = "Pick one of your college's cohorts."
	}
	loc, msg := domain.LoadTimezone(in.Timezone)
	if msg != "" {
		errs["timezone"] = msg
	}
	now := w.Clock.Now()
	var res EnrollResult
	err = w.Store.Tx(ctx, func(q store.Q) error {
		var cohort *store.CohortRow
		var programID uuid.UUID
		var program domain.Program
		if in.CohortID != nil {
			c, err := store.GetCohort(ctx, q, *in.CohortID, true)
			outOfScope := err == nil && only != nil && (c.Cohort.CollegeID == nil || *c.Cohort.CollegeID != *only)
			switch {
			case errors.Is(err, store.ErrNotFound) || outOfScope:
				errs["cohort_id"] = "That cohort doesn't exist."
			case err != nil:
				return err
			default:
				cohort = &c
				programID, program = c.ProgramID, c.Cohort.Program
				if in.ProgramSlug != "" && in.ProgramSlug != program.Slug {
					errs["program_slug"] = "This cohort is on " + program.Slug + "."
				}
				if c.SeatsUsed >= c.Cohort.SeatsTotal {
					errs["cohort_id"] = fmt.Sprintf("All %d seats in this cohort are taken.", c.Cohort.SeatsTotal)
				}
			}
		} else if errs["cohort_id"] == "" {
			p, err := store.ProgramBySlug(ctx, q, in.ProgramSlug)
			if errors.Is(err, store.ErrNotFound) {
				errs["program_slug"] = "Pick a program."
			} else if err != nil {
				return err
			}
			programID, program = p.ID, p.Program
		}
		var start time.Time
		switch {
		case in.StartDate != nil:
			start = *in.StartDate
		case cohort != nil:
			start = cohort.Cohort.StartDate
		default:
			errs["start_date"] = "Pick a start date."
		}
		if errs["start_date"] == "" && loc != nil {
			if msg := domain.ValidateStartDate(start, loc, now); msg != "" {
				errs["start_date"] = msg
			}
		}
		if len(errs) > 0 {
			return apperr.Validation(errs)
		}

		var college *uuid.UUID
		if cohort != nil {
			college = cohort.Cohort.CollegeID
		}
		student, err := store.GetUserByLogin(ctx, q, person.GitHubLogin)
		switch {
		case errors.Is(err, store.ErrNotFound):
			student, err = store.InsertPendingUser(ctx, q, person, domain.RoleStudent, college, now)
			if errors.Is(err, store.ErrDuplicate) {
				return apperr.Validation(map[string]string{"github_login": "Someone just added this login. Try again."})
			}
			if err != nil {
				return err
			}
			res.UserCreated = true
		case err != nil:
			return err
		case student.Role != domain.RoleStudent:
			return apperr.Validation(map[string]string{"github_login": "@" + student.GitHubLogin + " is staff. Staff can't be enrolled as students."})
		case college != nil && student.CollegeID != nil && *student.CollegeID != *college:
			return apperr.Validation(map[string]string{"github_login": "@" + student.GitHubLogin + " belongs to another college."})
		case college != nil && student.CollegeID == nil:
			if err := store.SetUserCollege(ctx, q, student.ID, *college, now); err != nil {
				return err
			}
		}

		var cohortID *uuid.UUID
		if cohort != nil {
			cohortID = &cohort.Cohort.ID
		}
		id, err := store.InsertEnrollment(ctx, q, store.NewEnrollment{
			UserID: student.ID, ProgramID: programID, CohortID: cohortID, StartDate: start,
			EndDate: domain.EndDate(start, program.Days), Timezone: loc.String(),
		}, now)
		if errors.Is(err, store.ErrAlreadyEnrolled) {
			return apperr.Validation(map[string]string{"github_login": "@" + student.GitHubLogin + " already has an active or paused internship."})
		}
		if err != nil {
			return err
		}
		e, err := store.GetEnrollment(ctx, q, id)
		if err != nil {
			return err
		}
		if err := w.welcome(ctx, q, u, e, student, now); err != nil {
			return err
		}
		if in.FlowID != nil {
			if _, err := ApplyFlow(ctx, q, e, *in.FlowID, u.ID, now); err != nil {
				return err
			}
			if e, err = store.GetEnrollment(ctx, q, id); err != nil {
				return err
			}
		}
		student, err = store.GetUser(ctx, q, student.ID)
		if err != nil {
			return err
		}
		res.Student = store.StudentRow{User: student, Enrollment: e}
		return nil
	})
	return res, err
}

// welcome has the team lead greet the student when their internship opens.
func (w *Workspace) welcome(ctx context.Context, q store.Q, actor domain.User, e domain.Enrollment, student domain.User, now time.Time) error {
	opens, _ := e.Window()
	deliver := now
	if opens.After(now) {
		deliver = opens.Add(9 * time.Hour) // 9 AM local on day 1
	}
	by := actor.ID
	_, _, err := store.InsertMessage(ctx, q, store.NewMessage{
		EnrollmentID: e.ID, PersonaID: domain.DefaultPersonaID, SentBy: &by, Author: domain.AuthorPersona, DeliverAt: deliver,
		Body: fmt.Sprintf("Welcome to Stackstep, %s. I'm your team lead for the next %d days. Each morning I'll post a standup and drop tickets on your board. Ask me anything here.",
			firstNameOf(student.Name), e.Program.Days),
	}, now)
	return err
}

// ImportRowResult reports one row of a bulk enrollment.
type ImportRowResult struct {
	GitHubLogin string
	Student     *store.StudentRow
	UserCreated bool
	Err         *apperr.Error
}

// ImportEnrollments enrolls many students with shared settings. Each row is its own
// transaction, so one bad row never blocks the rest; re-running is safe (enrolled rows fail
// with "already has an internship").
func (w *Workspace) ImportEnrollments(ctx context.Context, u domain.User, shared EnrollInput, people []domain.PersonInput) ([]ImportRowResult, error) {
	if _, err := staffCollege(u); err != nil {
		return nil, err
	}
	switch {
	case len(people) == 0:
		return nil, apperr.Validation(map[string]string{"rows": "Add at least one student."})
	case len(people) > domain.MaxImportRows:
		return nil, apperr.Validation(map[string]string{"rows": fmt.Sprintf("Import at most %d students at once.", domain.MaxImportRows)})
	}
	seen := map[string]bool{}
	out := make([]ImportRowResult, 0, len(people))
	for _, p := range people {
		r := ImportRowResult{GitHubLogin: domain.NormalizeLogin(p.GitHubLogin)}
		key := strings.ToLower(r.GitHubLogin)
		if seen[key] && key != "" {
			r.Err = apperr.Validation(map[string]string{"github_login": "This login appears twice in the file."})
			out = append(out, r)
			continue
		}
		seen[key] = true
		in := shared
		in.Person = p
		res, err := w.Enroll(ctx, u, in)
		if err != nil {
			if ae, ok := apperr.As(err); ok {
				r.Err = ae
			} else {
				w.Log.ErrorContext(ctx, "import enrollment", "err", err, "login", r.GitHubLogin)
				r.Err = apperr.New(apperr.CodeInternal, "Something went wrong on our side.")
			}
		} else {
			s := res.Student
			r.Student, r.UserCreated = &s, res.UserCreated
		}
		out = append(out, r)
	}
	return out, nil
}

// SetEnrollmentStatus pauses, resumes, completes or cancels an internship.
func (w *Workspace) SetEnrollmentStatus(ctx context.Context, u domain.User, id uuid.UUID, to domain.EnrollmentStatus) (domain.Enrollment, error) {
	e, err := w.staffEnrollment(ctx, u, id)
	if err != nil {
		return domain.Enrollment{}, err
	}
	if !to.Valid() {
		return domain.Enrollment{}, apperr.Validation(map[string]string{"status": "Pick active, paused, completed or cancelled."})
	}
	if !e.Status.CanMoveTo(to) {
		return domain.Enrollment{}, apperr.New(apperr.CodeInvalidTransition, fmt.Sprintf("A %s internship can't become %s.", e.Status, to))
	}
	now := w.Clock.Now()
	err = w.Store.Tx(ctx, func(q store.Q) error {
		err := store.SetEnrollmentStatus(ctx, q, e.ID, e.Status, to)
		switch {
		case errors.Is(err, store.ErrNotFound):
			return errStale
		case errors.Is(err, store.ErrAlreadyEnrolled):
			return apperr.New(apperr.CodeInvalidTransition, "This student already has another open internship.")
		case err != nil:
			return err
		}
		if note := statusNote(to); note != "" {
			by := u.ID
			if _, _, err := store.InsertMessage(ctx, q, store.NewMessage{
				EnrollmentID: e.ID, PersonaID: domain.DefaultPersonaID, SentBy: &by, Author: domain.AuthorPersona, DeliverAt: now, Body: note,
			}, now); err != nil {
				return err
			}
		}
		e, err = store.GetEnrollment(ctx, q, e.ID)
		return err
	})
	return e, err
}

func statusNote(to domain.EnrollmentStatus) string {
	switch to {
	case domain.EnrollmentPaused:
		return "Your internship is paused for now. Your board and chats stay here; we'll pick up when it resumes."
	case domain.EnrollmentActive:
		return "Welcome back! Your internship is active again. Check your board for what's next."
	case domain.EnrollmentCompleted:
		return "Your internship is complete. Thank you for the work you put in."
	case domain.EnrollmentCancelled:
		return ""
	}
	return ""
}

// Staff lists admins and college admins (platform admins only).
func (w *Workspace) Staff(ctx context.Context, u domain.User) ([]store.StaffRow, error) {
	if u.Role != domain.RoleAdmin {
		return nil, errPlatformAdmin
	}
	return store.ListStaff(ctx, w.Store.Pool)
}

// StaffInput grants a staff role.
type StaffInput struct {
	Person    domain.PersonInput
	Role      domain.Role
	CollegeID *uuid.UUID
}

// GrantStaff makes a GitHub login an admin or a college admin, creating the user if needed.
func (w *Workspace) GrantStaff(ctx context.Context, u domain.User, in StaffInput) (store.StaffRow, error) {
	if u.Role != domain.RoleAdmin {
		return store.StaffRow{}, errPlatformAdmin
	}
	person, errs := domain.ValidatePerson(in.Person)
	switch in.Role {
	case domain.RoleCollegeAdmin:
		if in.CollegeID == nil {
			errs["college_id"] = "Pick the college they manage."
		}
	case domain.RoleAdmin:
		in.CollegeID = nil
	case domain.RoleStudent:
		errs["role"] = "Pick admin or college admin."
	default:
		errs["role"] = "Pick admin or college admin."
	}
	now := w.Clock.Now()
	var out store.StaffRow
	err := w.Store.Tx(ctx, func(q store.Q) error {
		if in.CollegeID != nil {
			ok, err := store.CollegeExists(ctx, q, *in.CollegeID)
			if err != nil {
				return err
			}
			if !ok {
				errs["college_id"] = "That college doesn't exist."
			}
		}
		if len(errs) > 0 {
			return apperr.Validation(errs)
		}
		target, err := store.GetUserByLogin(ctx, q, person.GitHubLogin)
		switch {
		case errors.Is(err, store.ErrNotFound):
			target, err = store.InsertPendingUser(ctx, q, person, in.Role, in.CollegeID, now)
			if err != nil {
				return err
			}
		case err != nil:
			return err
		default:
			if err := store.LockUser(ctx, q, target.ID); err != nil {
				return err
			}
			if _, err := store.OpenEnrollmentForUser(ctx, q, target.ID); err == nil {
				return apperr.Validation(map[string]string{"github_login": "@" + target.GitHubLogin + " has an open internship. Complete or cancel it first."})
			} else if !errors.Is(err, store.ErrNotFound) {
				return err
			}
			if target.ID == u.ID && in.Role != domain.RoleAdmin {
				return apperr.Validation(map[string]string{"role": "You can't remove your own admin access."})
			}
			if target.Role == domain.RoleAdmin && in.Role != domain.RoleAdmin {
				if err := w.keepOneAdmin(ctx, q); err != nil {
					return err
				}
			}
			if target, err = store.SetUserRole(ctx, q, target.ID, in.Role, in.CollegeID, now); err != nil {
				return err
			}
		}
		out, err = w.staffRow(ctx, q, target.ID)
		return err
	})
	return out, err
}

// RevokeStaff turns a staff member back into a regular user.
func (w *Workspace) RevokeStaff(ctx context.Context, u domain.User, userID uuid.UUID) (store.StaffRow, error) {
	if u.Role != domain.RoleAdmin {
		return store.StaffRow{}, errPlatformAdmin
	}
	if userID == u.ID {
		return store.StaffRow{}, apperr.New(apperr.CodeInvalidTransition, "You can't remove your own admin access.")
	}
	var out store.StaffRow
	err := w.Store.Tx(ctx, func(q store.Q) error {
		if err := store.LockUser(ctx, q, userID); err != nil {
			return err
		}
		target, err := store.GetUser(ctx, q, userID)
		if errors.Is(err, store.ErrNotFound) || err == nil && !target.Role.IsStaff() {
			return errNotFound
		}
		if err != nil {
			return err
		}
		if target.Role == domain.RoleAdmin {
			if err := w.keepOneAdmin(ctx, q); err != nil {
				return err
			}
		}
		if _, err := store.SetUserRole(ctx, q, target.ID, domain.RoleStudent, target.CollegeID, w.Clock.Now()); err != nil {
			return err
		}
		out, err = w.staffRow(ctx, q, target.ID)
		return err
	})
	return out, err
}

func (w *Workspace) keepOneAdmin(ctx context.Context, q store.Q) error {
	n, err := store.CountAdmins(ctx, q)
	if err != nil {
		return err
	}
	if n <= 1 {
		return apperr.New(apperr.CodeInvalidTransition, "There must always be at least one platform admin.")
	}
	return nil
}

func (w *Workspace) staffRow(ctx context.Context, q store.Q, id uuid.UUID) (store.StaffRow, error) {
	u, err := store.GetUser(ctx, q, id)
	if err != nil {
		return store.StaffRow{}, err
	}
	r := store.StaffRow{User: u, SignedIn: u.GitHubID != nil}
	if u.CollegeID != nil {
		cs, err := store.ListColleges(ctx, q, u.CollegeID)
		if err != nil {
			return r, err
		}
		if len(cs) == 1 {
			name := cs[0].College.Name
			r.CollegeName = &name
		}
	}
	return r, nil
}
