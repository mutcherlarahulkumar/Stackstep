package app

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// MailPage is one page of a mailbox.
type MailPage struct {
	Items  []store.Mail
	Next   string
	Unread int
}

// MyMail lists the signed-in user's mail, newest first.
func (w *Workspace) MyMail(ctx context.Context, u domain.User, before *store.Cursor, limit int) (MailPage, error) {
	q := w.Store.Pool
	// A cursor from another list (a timestamp key, say) is the client's mistake, not ours.
	if before != nil {
		if _, err := strconv.ParseInt(before.Key, 10, 64); err != nil {
			return MailPage{}, apperr.Validation(map[string]string{"cursor": "That page link is no longer valid."})
		}
	}
	items, err := store.ListMail(ctx, q, u.ID, before, limit+1)
	if err != nil {
		return MailPage{}, err
	}
	p := MailPage{Items: items}
	if len(items) > limit {
		p.Items = items[:limit]
		last := p.Items[limit-1]
		p.Next = store.EncodeCursor(store.MailCursor(last))
	}
	p.Unread, err = store.UnreadMail(ctx, q, u.ID)
	return p, err
}

// OpenMail reads one letter and marks it read.
func (w *Workspace) OpenMail(ctx context.Context, u domain.User, id uuid.UUID) (store.Mail, error) {
	var m store.Mail
	err := w.Store.Tx(ctx, func(q store.Q) error {
		if err := store.MarkMailRead(ctx, q, u.ID, id, w.Clock.Now()); errors.Is(err, store.ErrNotFound) {
			return apperr.New(apperr.CodeNotFound, "Mail not found.")
		} else if err != nil {
			return err
		}
		var err error
		m, err = store.GetMail(ctx, q, u.ID, id)
		return err
	})
	return m, err
}

// AnnouncementInput is what staff write.
type AnnouncementInput struct {
	Subject, Body string
	Audience      domain.Audience
	FlowID        *uuid.UUID
	CohortID      *uuid.UUID
	ClassID       *uuid.UUID // audience "class": the class's invitees
}

// Announce mails a Markdown announcement to everyone, a flow or a cohort. College admins only
// reach their own college's students.
func (w *Workspace) Announce(ctx context.Context, u domain.User, in AnnouncementInput) (store.Announcement, error) {
	college, err := staffCollege(u)
	if err != nil {
		return store.Announcement{}, err
	}
	subject, body, errs := domain.ValidateAnnouncement(in.Subject, in.Body)
	switch {
	case !in.Audience.Valid():
		errs["audience"] = "Pick who it goes to."
	case in.Audience == domain.AudienceFlow && in.FlowID == nil:
		errs["flow_id"] = "Pick the flow."
	case in.Audience == domain.AudienceCohort && in.CohortID == nil:
		errs["cohort_id"] = "Pick the cohort."
	case in.Audience == domain.AudienceClass && in.ClassID == nil:
		errs["class_id"] = "Pick the class."
	}
	now := w.Clock.Now()
	var out store.Announcement
	err = w.Store.Tx(ctx, func(q store.Q) error {
		var cohortName, flowName *string
		if in.Audience == domain.AudienceCohort && in.CohortID != nil {
			c, err := store.GetCohort(ctx, q, *in.CohortID, false)
			switch {
			case errors.Is(err, store.ErrNotFound) || err == nil && college != nil && (c.Cohort.CollegeID == nil || *c.Cohort.CollegeID != *college):
				errs["cohort_id"] = "That cohort doesn't exist."
			case err != nil:
				return err
			default:
				cohortName = &c.Cohort.Name
			}
		}
		if in.Audience == domain.AudienceFlow && in.FlowID != nil {
			f, err := store.GetFlow(ctx, q, *in.FlowID, false)
			switch {
			case errors.Is(err, store.ErrNotFound):
				errs["flow_id"] = "That flow doesn't exist."
			case err != nil:
				return err
			default:
				flowName = &f.Name
			}
		}
		if len(errs) > 0 {
			return apperr.Validation(errs)
		}
		var to []uuid.UUID
		var err error
		if in.Audience == domain.AudienceClass {
			to, err = w.classInvitees(ctx, q, u, *in.ClassID)
		} else {
			to, err = store.AudienceStudents(ctx, q, in.Audience, in.FlowID, in.CohortID, college)
		}
		if err != nil {
			return err
		}
		if len(to) == 0 {
			return apperr.Validation(map[string]string{"audience": "Nobody is in this group yet."})
		}
		out = store.Announcement{Subject: subject, Body: body, Audience: in.Audience, FlowID: in.FlowID, FlowName: flowName, CohortID: in.CohortID,
			CohortName: cohortName, CollegeID: college, SentByID: u.ID, SentByName: u.Name, Recipients: len(to), CreatedAt: now}
		if out.ID, err = store.InsertAnnouncement(ctx, q, out, now); err != nil {
			return err
		}
		id := out.ID
		_, err = store.InsertMail(ctx, q, store.NewMail{Kind: domain.MailAnnouncement, Subject: subject, Body: body, FromName: u.Name,
			AnnouncementID: &id, ClassID: in.ClassID}, to, now)
		return err
	})
	return out, err
}

// Announcements lists sent announcements in the caller's scope, newest first.
func (w *Workspace) Announcements(ctx context.Context, u domain.User) ([]store.Announcement, error) {
	college, err := staffCollege(u)
	if err != nil {
		return nil, err
	}
	return store.ListAnnouncements(ctx, w.Store.Pool, college, 100)
}

// welcomeMail is the letter a student finds on joining: when day 1 is, and what happens then.
func welcomeMail(e domain.Enrollment, student domain.User, first FirstDay, now time.Time) store.NewMail {
	loc := e.Location()
	y, m, d := now.In(loc).Date()
	tomorrow := time.Date(y, m, d+1, 0, 0, 0, 0, time.UTC)
	subject := "Your internship starts on " + first.Date.Format("Monday 2 January")
	when := first.Date.Format("Monday 2 January")
	if first.Date.Equal(tomorrow) {
		subject, when = "Your first working day is tomorrow", "tomorrow, "+when
	}
	var b strings.Builder
	fmt.Fprintf(&b, "Hi %s,\n\nWelcome to **Stackstep**. You're on the %d-day internship", firstNameOf(student.Name), e.Program.Days)
	if e.Flow != nil {
		fmt.Fprintf(&b, ", following **%s**", e.Flow.Name)
	}
	b.WriteString(".\n\n")
	fmt.Fprintf(&b, "- **Day 1** is %s.\n", when)
	if first.FirstTaskAt != nil {
		fmt.Fprintf(&b, "- **Your first task** arrives at %s.\n", first.FirstTaskAt.In(loc).Format("3:04 PM MST"))
	}
	b.WriteString("- Each morning your team posts tickets on your board. Your **calendar** shows what's coming, apart from the odd surprise.\n")
	b.WriteString("- Stuck? Ask your team lead in chat, or use the AI helper for hints.\n\n")
	b.WriteString("See you on day 1,\n\nSam Rivera, Team Lead")
	lead := domain.DefaultPersonaID
	return store.NewMail{Kind: domain.MailWelcome, Subject: subject, Body: b.String(), FromName: "Sam Rivera", PersonaID: &lead}
}

// reviewMail tells a student how a hand-in went, in the persona's name.
func reviewMail(t domain.Task, approved bool, note string, rubric []bool, persona domain.Persona) store.NewMail {
	subject := fmt.Sprintf("Changes requested on “%s”", t.Title)
	lede := "Your reviewer asked for a few changes. Open the task, fix them and hand it in again."
	if approved {
		subject = fmt.Sprintf("“%s” is approved", t.Title)
		lede = "Nice work. This one is done and the points are yours."
	}
	var b strings.Builder
	b.WriteString(lede)
	if n := strings.TrimSpace(note); n != "" {
		b.WriteString("\n\n> " + strings.ReplaceAll(n, "\n", "\n> "))
	}
	if len(t.Content.Rubric) > 0 && len(rubric) == len(t.Content.Rubric) {
		b.WriteString("\n\n**What your reviewer checked**\n")
		for i, c := range t.Content.Rubric {
			mark := "- [ ] "
			if rubric[i] {
				mark = "- [x] "
			}
			b.WriteString("\n" + mark + c)
		}
	}
	id, pid := t.ID, persona.ID
	return store.NewMail{Kind: domain.MailReview, Subject: subject, Body: b.String(), FromName: persona.Name, PersonaID: &pid, TaskID: &id}
}

// certificateMail congratulates a student and gives them the code to share.
func certificateMail(student domain.User, cert domain.Certificate) store.NewMail {
	body := fmt.Sprintf("Congratulations, %s!\n\nYou finished **%s** and earned **%s**. Your certificate is ready to download and share.\n\n"+
		"Anyone can check it is genuine on the Stackstep verify page with code **%s**.\n\nWell done,\n\nSam Rivera, Team Lead",
		firstNameOf(student.Name), plural(cert.TasksDone, "task", "tasks"), plural(cert.Points, "point", "points"), cert.Code)
	lead := domain.DefaultPersonaID
	return store.NewMail{Kind: domain.MailCertificate, Subject: "Your certificate is ready", Body: body, FromName: "Sam Rivera", PersonaID: &lead}
}

// plural is "1 task" or "3 tasks".
func plural(n int, one, many string) string {
	if n == 1 {
		return fmt.Sprintf("%d %s", n, one)
	}
	return fmt.Sprintf("%d %s", n, many)
}
