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
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/classroom"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// ScheduleInput is a class to schedule.
type ScheduleInput struct {
	domain.ClassInput
	FlowID   *uuid.UUID
	CohortID *uuid.UUID
}

var errClassNotFound = apperr.New(apperr.CodeNotFound, "Class not found.")

// ScheduleClass stores a class and mails every invited student an invitation. College admins
// schedule for their own college only.
func (w *Workspace) ScheduleClass(ctx context.Context, u domain.User, in ScheduleInput) (store.Class, error) {
	college, err := staffCollege(u)
	if err != nil {
		return store.Class{}, err
	}
	now := w.Clock.Now()
	clean, errs := domain.ValidateClass(in.ClassInput, now)
	switch {
	case in.Audience == domain.AudienceFlow && in.FlowID == nil:
		errs["flow_id"] = "Pick the flow."
	case in.Audience == domain.AudienceCohort && in.CohortID == nil:
		errs["cohort_id"] = "Pick the cohort."
	}
	var out store.Class
	err = w.Store.Tx(ctx, func(q store.Q) error {
		if in.Audience == domain.AudienceCohort && in.CohortID != nil {
			c, err := store.GetCohort(ctx, q, *in.CohortID, false)
			if errors.Is(err, store.ErrNotFound) || err == nil && college != nil && (c.Cohort.CollegeID == nil || *c.Cohort.CollegeID != *college) {
				errs["cohort_id"] = "That cohort doesn't exist."
			} else if err != nil {
				return err
			}
		}
		if in.Audience == domain.AudienceFlow && in.FlowID != nil {
			if _, err := store.GetFlow(ctx, q, *in.FlowID, false); errors.Is(err, store.ErrNotFound) {
				errs["flow_id"] = "That flow doesn't exist."
			} else if err != nil {
				return err
			}
		}
		if len(errs) > 0 {
			return apperr.Validation(errs)
		}
		c := store.Class{Title: clean.Title, Description: clean.Description, StartsAt: clean.StartsAt.UTC(), DurationMinutes: clean.DurationMinutes,
			Audience: clean.Audience, CollegeID: college, HostID: u.ID}
		if clean.Audience == domain.AudienceFlow {
			c.FlowID = in.FlowID
		}
		if clean.Audience == domain.AudienceCohort {
			c.CohortID = in.CohortID
		}
		id, err := store.InsertClass(ctx, q, c, now)
		if err != nil {
			return err
		}
		if out, err = store.GetClass(ctx, q, id); err != nil {
			return err
		}
		to, err := store.AudienceStudents(ctx, q, out.Audience, out.FlowID, out.CohortID, out.CollegeID)
		if err != nil || len(to) == 0 {
			return err
		}
		_, err = store.InsertMail(ctx, q, inviteMail(out, u), to, now)
		return err
	})
	return out, err
}

// inviteMail is the letter that invites students to a class.
func inviteMail(c store.Class, host domain.User) store.NewMail {
	var b strings.Builder
	fmt.Fprintf(&b, "You're invited to a live class with **%s**.\n\n", host.Name)
	fmt.Fprintf(&b, "- **When** %s IST\n", c.StartsAt.In(istZone).Format("Monday 2 January, 3:04 PM"))
	fmt.Fprintf(&b, "- **How long** about %d minutes\n", c.DurationMinutes)
	if c.Description != "" {
		b.WriteString("\n" + c.Description + "\n")
	}
	b.WriteString("\n> [!TIP]\n> Join from this letter or your calendar when it starts. Bring questions: you can ask them in the class and upvote other people's.")
	id := c.ID
	return store.NewMail{Kind: domain.MailClass, Subject: "Live class " + c.Title, Body: b.String(), FromName: host.Name, ClassID: &id}
}

var istZone = func() *time.Location {
	loc, err := time.LoadLocation(domain.DefaultTimezone)
	if err != nil {
		return time.UTC
	}
	return loc
}()

// StaffClasses lists classes in the caller's scope.
func (w *Workspace) StaffClasses(ctx context.Context, u domain.User) ([]store.Class, error) {
	college, err := staffCollege(u)
	if err != nil {
		return nil, err
	}
	return store.StaffClasses(ctx, w.Store.Pool, college, 100)
}

// StudentClasses lists the classes the signed-in student is invited to.
func (w *Workspace) StudentClasses(ctx context.Context, u domain.User) ([]store.Class, error) {
	e, err := w.requireEnrollment(ctx, u)
	if err != nil {
		return nil, err
	}
	return store.StudentClasses(ctx, w.Store.Pool, e, w.Clock.Now())
}

// ClassAccess says whether someone may enter a class and as what: staff in scope host it,
// invited students attend. Cancelled and ended classes can't be entered.
func (w *Workspace) ClassAccess(ctx context.Context, u domain.User, id uuid.UUID) (store.Class, classroom.Role, error) {
	c, err := store.GetClass(ctx, w.Store.Pool, id)
	if errors.Is(err, store.ErrNotFound) {
		return c, "", errClassNotFound
	}
	if err != nil {
		return c, "", err
	}
	if u.Role.IsStaff() {
		college, err := staffCollege(u)
		if err != nil {
			return c, "", err
		}
		if college != nil && (c.CollegeID == nil || *c.CollegeID != *college) {
			return c, "", errClassNotFound
		}
		return c, classroom.RoleHost, nil
	}
	mine, err := w.StudentClasses(ctx, u)
	if err != nil {
		return c, "", err
	}
	for _, m := range mine {
		if m.ID == id {
			return c, classroom.RoleStudent, nil
		}
	}
	return c, "", errClassNotFound
}

// ClassOpen reports why a class can't be entered now, or nil.
func ClassOpen(c store.Class) error {
	switch c.Status {
	case domain.ClassCancelled:
		return apperr.New(apperr.CodeInvalidState, "This class was cancelled.")
	case domain.ClassEnded:
		return apperr.New(apperr.CodeInvalidState, "This class has ended.")
	case domain.ClassScheduled, domain.ClassLive:
	}
	return nil
}

// SetClassStatus moves a class on: live when a host opens the room, ended when a host ends
// it, cancelled before it starts.
func (w *Workspace) SetClassStatus(ctx context.Context, u domain.User, id uuid.UUID, to domain.ClassStatus) (store.Class, error) {
	c, role, err := w.ClassAccess(ctx, u, id)
	if err != nil {
		return c, err
	}
	if role != classroom.RoleHost {
		return c, errStaffOnly
	}
	ok := c.Status == to ||
		to == domain.ClassLive && c.Status == domain.ClassScheduled ||
		to == domain.ClassEnded && (c.Status == domain.ClassLive || c.Status == domain.ClassScheduled) ||
		to == domain.ClassCancelled && c.Status == domain.ClassScheduled
	if !ok {
		return c, apperr.New(apperr.CodeInvalidTransition, fmt.Sprintf("A %s class can't become %s.", c.Status, to))
	}
	if err := store.SetClassStatus(ctx, w.Store.Pool, id, to, w.Clock.Now()); err != nil {
		return c, err
	}
	return store.GetClass(ctx, w.Store.Pool, id)
}

// classInvitees lists the students invited to a live class (staff in scope only).
func (w *Workspace) classInvitees(ctx context.Context, q store.Q, u domain.User, id uuid.UUID) ([]uuid.UUID, error) {
	c, role, err := w.ClassAccess(ctx, u, id)
	if err != nil {
		return nil, err
	}
	if role != classroom.RoleHost {
		return nil, errStaffOnly
	}
	return store.AudienceStudents(ctx, q, c.Audience, c.FlowID, c.CohortID, c.CollegeID)
}

// Promote turns something said in a class into an announcement in every invitee's mail.
func (w *Workspace) Promote(ctx context.Context, u domain.User, c store.Class, p classroom.Promotable) (store.Announcement, error) {
	subject := "From the class " + c.Title
	if utf8.RuneCountInString(subject) > domain.AnnouncementSubjectMax {
		subject = string([]rune(subject)[:domain.AnnouncementSubjectMax-1]) + "…"
	}
	var body string
	if p.Kind == "question" {
		body = fmt.Sprintf("**A question from the class**, asked by %s\n\n> %s\n\nAsk more in your next class, or in chat with your team.", p.By, p.Body)
	} else {
		body = fmt.Sprintf("%s\n\n%s, during the live class.", p.Body, p.By)
	}
	id := c.ID
	return w.Announce(ctx, u, AnnouncementInput{Subject: subject, Body: body, Audience: domain.AudienceClass, ClassID: &id})
}
