// Package seed holds the test fixtures (accounts, catalog, internships) that E2E and live
// tests run against, plus the production maintenance used by cmd/dbadmin (see admin.go).
package seed

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/app"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	curriculum "github.com/mutcherlarahulkumar/stackstep/backend/internal/guidedcurriculum"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// Logins created by the seed. E2E tests sign in as these through dev login.
const (
	AdminLogin        = "admin-demo"
	CollegeAdminLogin = "anits-tpo"
	StudentLogin      = "asha-dev"
	Student2Login     = "ravi-dev"
	IndieStudentLogin = "meera-dev" // follows the seeded React flow
	PausedLogin       = "kiran-dev"
	NoEnrollLogin     = "nora-dev"
	ApplicantLogin    = "neha-dev" // not enrolled; the E2E payment test applies as her
	// OpenCohortName takes applications (fee ₹4,999) so applicants have something to join.
	OpenCohortName = "Frontend Cohort · Open"
)

// Reset deletes all workspace data. Never call this against production.
func Reset(ctx context.Context, q store.Q) error {
	_, err := q.Exec(ctx, `TRUNCATE task_events, chat_threads, chat_messages, tasks, enrollments, flow_items, flow_versions, flows,
		task_templates, personas, cohorts, login_codes, refresh_tokens, users, colleges RESTART IDENTITY CASCADE`)
	return err
}

// Run inserts demo data. It is idempotent: existing rows are left as they are.
func Run(ctx context.Context, q store.Q, now time.Time) error {
	var collegeID uuid.UUID
	if err := q.QueryRow(ctx, `INSERT INTO colleges (name) VALUES ('ANITS') ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`).Scan(&collegeID); err != nil {
		return fmt.Errorf("college: %w", err)
	}
	var programID uuid.UUID
	if err := q.QueryRow(ctx, `SELECT id FROM programs WHERE slug = 'frontend-30'`).Scan(&programID); err != nil {
		return fmt.Errorf("program: %w", err)
	}

	type person struct {
		login, name string
		role        string
		college     *uuid.UUID
	}
	people := []person{
		{AdminLogin, "Platform Admin", "admin", nil},
		{CollegeAdminLogin, "ANITS Placement Cell", "college_admin", &collegeID},
		{StudentLogin, "Asha Rao", "student", &collegeID},
		{Student2Login, "Ravi Teja", "student", &collegeID},
		{IndieStudentLogin, "Meera Iyer", "student", nil},
		{PausedLogin, "Kiran Kumar", "student", &collegeID},
		{NoEnrollLogin, "Nora Das", "student", nil},
		{ApplicantLogin, "Neha Singh", "student", nil},
	}
	ids := map[string]uuid.UUID{}
	for _, p := range people {
		var id uuid.UUID
		err := q.QueryRow(ctx, `
			INSERT INTO users (github_login, name, role, college_id, created_at, updated_at, consent_version, consent_at, onboarded_at)
			VALUES ($1, $2, $3, $4, $5, $5, $6, $5, $5)
			ON CONFLICT ((lower(github_login))) DO UPDATE SET name = users.name
			RETURNING id`, p.login, p.name, p.role, p.college, now, domain.TermsVersion).Scan(&id)
		if err != nil {
			return fmt.Errorf("user %s: %w", p.login, err)
		}
		ids[p.login] = id
	}

	// Seeded students are on day 3 in their own time zone (enrollments default to Kolkata),
	// whatever the server's UTC date is.
	local := now.In(seedZone)
	today := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)
	start := today.AddDate(0, 0, -2)
	var cohortID uuid.UUID
	if err := q.QueryRow(ctx, `SELECT id FROM cohorts WHERE name = 'ANITS Batch 1'`).Scan(&cohortID); err != nil {
		if err := q.QueryRow(ctx, `INSERT INTO cohorts (kind, name, college_id, program_id, start_date, seats_total)
			VALUES ('college', 'ANITS Batch 1', $1, $2, $3, 60) RETURNING id`, collegeID, programID, start).Scan(&cohortID); err != nil {
			return fmt.Errorf("cohort: %w", err)
		}
	}

	// Feature 15: a cohort taking applications, with UPI details and a sample QR to pay.
	if _, err := q.Exec(ctx, `INSERT INTO cohorts (kind, name, program_id, start_date, seats_total, fee_inr, applications_open)
		SELECT 'group', $1, $2, $3, 100, 4999, true WHERE NOT EXISTS (SELECT 1 FROM cohorts WHERE name = $1)`,
		OpenCohortName, programID, start.AddDate(0, 0, 14)); err != nil {
		return fmt.Errorf("open cohort: %w", err)
	}
	if err := store.SetPaymentDetails(ctx, q, "stackstep@okaxis", "Stackstep Internships", "Pay the exact fee shown. Keep the screenshot.",
		ids[AdminLogin], now); err != nil {
		return fmt.Errorf("payment settings: %w", err)
	}
	if err := store.SetPaymentQR(ctx, q, SampleQR(), "image/png", ids[AdminLogin], now); err != nil {
		return fmt.Errorf("payment qr: %w", err)
	}

	enroll := func(login string, cohort *uuid.UUID, status string) error {
		var id uuid.UUID
		err := q.QueryRow(ctx, `SELECT id FROM enrollments WHERE user_id = $1 AND status IN ('active', 'paused')`, ids[login]).Scan(&id)
		if err == nil {
			return nil
		}
		_, err = q.Exec(ctx, `INSERT INTO enrollments (user_id, program_id, cohort_id, start_date, end_date, status)
			VALUES ($1, $2, $3, $4, $5, $6)`, ids[login], programID, cohort, start, start.AddDate(0, 0, 29), status)
		return err
	}
	if err := enroll(StudentLogin, &cohortID, "active"); err != nil {
		return fmt.Errorf("enroll asha: %w", err)
	}
	if err := enroll(Student2Login, &cohortID, "active"); err != nil {
		return fmt.Errorf("enroll ravi: %w", err)
	}
	if err := enroll(IndieStudentLogin, nil, "active"); err != nil {
		return fmt.Errorf("enroll meera: %w", err)
	}
	if err := enroll(PausedLogin, &cohortID, "paused"); err != nil {
		return fmt.Errorf("enroll kiran: %w", err)
	}

	if err := seedCatalog(ctx, q, ids[AdminLogin], now); err != nil {
		return fmt.Errorf("catalog: %w", err)
	}
	// Students approved into the open cohort start on the React flow the next day.
	if _, err := q.Exec(ctx, `UPDATE cohorts SET flow_id = $1 WHERE name = $2 AND flow_id IS NULL`, ReactFlowID, OpenCohortName); err != nil {
		return fmt.Errorf("open cohort flow: %w", err)
	}
	meera, err := store.OpenEnrollmentForUser(ctx, q, ids[IndieStudentLogin])
	if err != nil {
		return fmt.Errorf("load meera: %w", err)
	}
	if meera.Flow == nil {
		if _, err := app.ApplyFlow(ctx, q, meera, ReactFlowID, ids[AdminLogin], now); err != nil {
			return fmt.Errorf("assign flow: %w", err)
		}
	}

	// The team lead welcomes every seeded student, as real enrollments do.
	welcome := map[string]string{StudentLogin: "Asha", Student2Login: "Ravi", IndieStudentLogin: "Meera", PausedLogin: "Kiran"}
	for login, first := range welcome {
		e, err := store.OpenEnrollmentForUser(ctx, q, ids[login])
		if err != nil {
			return fmt.Errorf("load %s: %w", login, err)
		}
		var has bool
		if err := q.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM chat_messages WHERE enrollment_id = $1 AND persona_id = $2)`, e.ID, domain.DefaultPersonaID).Scan(&has); err != nil {
			return err
		}
		if has {
			continue
		}
		if _, _, err := store.InsertMessage(ctx, q, store.NewMessage{
			EnrollmentID: e.ID, PersonaID: domain.DefaultPersonaID, Author: domain.AuthorPersona, DeliverAt: now.Add(-time.Hour),
			Body: fmt.Sprintf("Welcome to Stackstep, %s. I'm your team lead for the next 30 days. Each morning I'll post a standup and drop tickets on your board. Ask me anything here.", first),
		}, now.Add(-time.Hour)); err != nil {
			return fmt.Errorf("welcome %s: %w", login, err)
		}
	}
	return seedAnnouncement(ctx, q, ids[AdminLogin], now.Add(-2*time.Hour))
}

// demoAnnouncement shows what mail can look like: headings, a list and a callout.
const demoAnnouncement = `## This week at Stackstep

Welcome to the November batch. Here's what's coming up.

- **Wednesday** a live class on Git branching, 6 PM. The link lands in your mail.
- **Friday** demo day. Show one thing you built in five minutes.

> [!TIP]
> Hand in early. Reviews are faster before lunch, and you get feedback while the work is fresh.

See you in class,

The Stackstep team`

// seedAnnouncement sends one announcement to every seeded student, once.
func seedAnnouncement(ctx context.Context, q store.Q, admin uuid.UUID, now time.Time) error {
	var has bool
	if err := q.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM announcements)`).Scan(&has); err != nil || has {
		return err
	}
	to, err := store.AudienceStudents(ctx, q, domain.AudienceAll, nil, nil, nil)
	if err != nil || len(to) == 0 {
		return err
	}
	sender, err := store.GetUser(ctx, q, admin)
	if err != nil {
		return err
	}
	a := store.Announcement{Subject: "This week at Stackstep", Body: demoAnnouncement, Audience: domain.AudienceAll, SentByID: admin, SentByName: sender.Name, Recipients: len(to)}
	id, err := store.InsertAnnouncement(ctx, q, a, now)
	if err != nil {
		return fmt.Errorf("announcement: %w", err)
	}
	_, err = store.InsertMail(ctx, q, store.NewMail{Kind: domain.MailAnnouncement, Subject: a.Subject, Body: a.Body, FromName: a.SentByName, AnnouncementID: &id}, to, now)
	return err
}

// seedZone is the time zone seeded enrollments use (the column default).
var seedZone = func() *time.Location {
	loc, err := time.LoadLocation(domain.DefaultTimezone)
	if err != nil {
		return time.UTC
	}
	return loc
}()

// Seeded catalog ids, fixed so tests and demos can refer to them.
var (
	EngineeringManagerID = uuid.MustParse("00000000-0000-4000-8000-0000000000a1")
	DeliveryManagerID    = uuid.MustParse("00000000-0000-4000-8000-0000000000a2")
	ContentLeadID        = uuid.MustParse("00000000-0000-4000-8000-0000000000a3")
	ReactFlowID          = uuid.MustParse("00000000-0000-4000-8000-0000000000f1")
)

// seedCatalog creates the default personas, the complete guided task library and a published
// "React Frontend · 30 days" flow whose tasks come from three different managers.
func seedCatalog(ctx context.Context, q store.Q, admin uuid.UUID, now time.Time) error {
	if _, err := q.Exec(ctx, `INSERT INTO personas (id, name, title, color, auto_reply) VALUES
		($1, 'Sam Rivera', 'Team Lead', 'violet', true),
		($2, 'Priya Sharma', 'Engineering Manager', 'emerald', false),
		($3, 'Arjun Mehta', 'Delivery Manager', 'blue', false),
		($4, 'Neha Kapoor', 'Content Lead', 'rose', false)
		ON CONFLICT (id) DO NOTHING`, domain.DefaultPersonaID, EngineeringManagerID, DeliveryManagerID, ContentLeadID); err != nil {
		return err
	}
	var exists bool
	if err := q.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM flows WHERE id = $1)", ReactFlowID).Scan(&exists); err != nil || exists {
		return err
	}
	tasks, err := curriculum.Entries(curriculum.Personas{Lead: domain.DefaultPersonaID, Engineering: EngineeringManagerID, Delivery: DeliveryManagerID, Content: ContentLeadID})
	if err != nil {
		return err
	}
	if _, err := q.Exec(ctx, `INSERT INTO flows (id, name, stream, description, days, created_by, created_at, updated_at)
		VALUES ($1, 'React Frontend · 30 days', 'React', 'Build a portfolio, a tested product explorer and a capstone with in-app lessons, spaced practice and review.', 30, $2, $3, $3)`,
		ReactFlowID, admin, now); err != nil {
		return err
	}
	var versionID uuid.UUID
	if err := q.QueryRow(ctx, `INSERT INTO flow_versions (flow_id, number, status, published_at, created_at)
		VALUES ($1, 1, 'published', $2, $2) RETURNING id`, ReactFlowID, now).Scan(&versionID); err != nil {
		return err
	}
	items := make([]domain.FlowItem, 0, len(tasks))
	perDay := map[int]int{}
	for _, t := range tasks {
		spec := t.Spec
		tpl, err := store.InsertTemplate(ctx, q, spec, admin, now)
		if err != nil {
			return err
		}
		id := tpl.ID
		items = append(items, domain.FlowItem{Day: t.Day, Position: perDay[t.Day], TemplateID: &id, Spec: spec})
		perDay[t.Day]++
	}
	return store.InsertFlowItems(ctx, q, versionID, items)
}
