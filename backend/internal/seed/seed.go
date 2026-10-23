// Package seed loads deterministic demo data for local development and E2E tests.
package seed

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/app"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
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
	}
	ids := map[string]uuid.UUID{}
	for _, p := range people {
		var id uuid.UUID
		err := q.QueryRow(ctx, `
			INSERT INTO users (github_login, name, role, college_id, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $5)
			ON CONFLICT ((lower(github_login))) DO UPDATE SET name = users.name
			RETURNING id`, p.login, p.name, p.role, p.college, now).Scan(&id)
		if err != nil {
			return fmt.Errorf("user %s: %w", p.login, err)
		}
		ids[p.login] = id
	}

	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	start := today.AddDate(0, 0, -2)
	var cohortID uuid.UUID
	if err := q.QueryRow(ctx, `SELECT id FROM cohorts WHERE name = 'ANITS Batch 1'`).Scan(&cohortID); err != nil {
		if err := q.QueryRow(ctx, `INSERT INTO cohorts (kind, name, college_id, program_id, start_date, seats_total)
			VALUES ('college', 'ANITS Batch 1', $1, $2, $3, 60) RETURNING id`, collegeID, programID, start).Scan(&cohortID); err != nil {
			return fmt.Errorf("cohort: %w", err)
		}
	}

	enroll := func(login string, cohort *uuid.UUID, status string) (uuid.UUID, error) {
		var id uuid.UUID
		err := q.QueryRow(ctx, `SELECT id FROM enrollments WHERE user_id = $1 AND status IN ('active', 'paused')`, ids[login]).Scan(&id)
		if err == nil {
			return id, nil
		}
		err = q.QueryRow(ctx, `INSERT INTO enrollments (user_id, program_id, cohort_id, start_date, end_date, status)
			VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, ids[login], programID, cohort, start, start.AddDate(0, 0, 29), status).Scan(&id)
		return id, err
	}
	asha, err := enroll(StudentLogin, &cohortID, "active")
	if err != nil {
		return fmt.Errorf("enroll asha: %w", err)
	}
	if _, err := enroll(Student2Login, &cohortID, "active"); err != nil {
		return fmt.Errorf("enroll ravi: %w", err)
	}
	if _, err := enroll(IndieStudentLogin, nil, "active"); err != nil {
		return fmt.Errorf("enroll meera: %w", err)
	}
	if _, err := enroll(PausedLogin, &cohortID, "paused"); err != nil {
		return fmt.Errorf("enroll kiran: %w", err)
	}

	if err := seedCatalog(ctx, q, ids[AdminLogin], now); err != nil {
		return fmt.Errorf("catalog: %w", err)
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

	var hasMessages bool
	if err := q.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM chat_messages WHERE enrollment_id = $1)`, asha).Scan(&hasMessages); err != nil {
		return err
	}
	if !hasMessages {
		if _, err := q.Exec(ctx, `INSERT INTO chat_threads (enrollment_id, persona_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			asha, domain.DefaultPersonaID); err != nil {
			return err
		}
		if _, err := q.Exec(ctx, `INSERT INTO chat_messages (enrollment_id, persona_id, author, body, created_at, deliver_at, delivered_at)
			VALUES ($1, $4, 'persona', $2, $3, $3, $3)`, asha,
			"Welcome to Stackstep, Asha. I'm your team lead for the next 30 days. Each morning I'll post a standup and drop tickets on your board. Ask me anything here.",
			now.Add(-time.Hour), domain.DefaultPersonaID); err != nil {
			return fmt.Errorf("welcome message: %w", err)
		}
	}
	return nil
}

// Seeded catalog ids, fixed so tests and demos can refer to them.
var (
	EngineeringManagerID = uuid.MustParse("00000000-0000-4000-8000-0000000000a1")
	DeliveryManagerID    = uuid.MustParse("00000000-0000-4000-8000-0000000000a2")
	ContentLeadID        = uuid.MustParse("00000000-0000-4000-8000-0000000000a3")
	ReactFlowID          = uuid.MustParse("00000000-0000-4000-8000-0000000000f1")
)

type seedTask struct {
	day          int
	typ          domain.TaskType
	title, brief string
	persona      uuid.UUID
	review       domain.ReviewMode
	release      string
	dueMinutes   int
	window       int
	content      domain.TaskContent
}

// seedCatalog creates the default personas, a small task library and a published
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
	tasks := []seedTask{
		{1, domain.TaskStandup, "Introduce yourself to the team", "Post a short intro: your college, what you want to build, and one thing you want to learn.", domain.DefaultPersonaID, domain.ReviewSelf, "10:00", 240, 0, domain.TaskContent{}},
		{1, domain.TaskGitChore, "Set up Git and open your first PR", "Clone the starter repo, add your name to README.md on branch `chore/intro`, and open a PR.", DeliveryManagerID, domain.ReviewManual, "11:00", 480, 0, domain.TaskContent{}},
		{2, domain.TaskDSA, "Two Sum", "Solve Two Sum in O(n). Explain your approach in two sentences.", EngineeringManagerID, domain.ReviewManual, "10:30", 360, 0, domain.TaskContent{}},
		{2, domain.TaskFeature, "Build the portfolio hero section", "Name, title, a short bio and links. Mobile first. Branch: `feat/hero`.", DeliveryManagerID, domain.ReviewManual, "11:00", 1440, 0, domain.TaskContent{}},
		{3, domain.TaskDocReading, "Read MDN: Flexbox", "Read the MDN Flexbox guide and note three properties you will use this week.", DeliveryManagerID, domain.ReviewSelf, "09:30", 240, 0,
			domain.TaskContent{Resources: []domain.Resource{{Title: "MDN: Basic concepts of flexbox", URL: "https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout/Basic_concepts_of_flexbox"}}}},
		{4, domain.TaskQuiz, "Git basics quiz", "Five quick questions on the commands you used this week.", DeliveryManagerID, domain.ReviewSelf, "16:00", 240, 0,
			domain.TaskContent{Quiz: &domain.Quiz{PassPercent: 60, Questions: []domain.QuizQuestion{
				{Prompt: "What does `git add` do?", Options: []string{"Creates a commit", "Stages changes for the next commit", "Uploads to GitHub"}, Answer: 1},
				{Prompt: "Which command shares your commits with the remote?", Options: []string{"git push", "git fetch", "git stash"}, Answer: 0},
				{Prompt: "Where should new work happen?", Options: []string{"Directly on main", "On a feature branch", "In a fork of a fork"}, Answer: 1},
				{Prompt: "What does a pull request ask for?", Options: []string{"A review before merging", "A copy of the repo", "Admin access"}, Answer: 0},
				{Prompt: "What does `git status` show?", Options: []string{"Commit history", "Changed and staged files", "Remote branches"}, Answer: 1},
			}}}},
		{3, domain.TaskDSA, "Valid Anagram", "Use a frequency map. Mention the time and space complexity.", EngineeringManagerID, domain.ReviewManual, "12:00", 360, 0, domain.TaskContent{}},
		{3, domain.TaskBlog, "Write: what I learned in week one", "300–500 words on your setup, your first PR and one mistake you fixed. Publish on Hashnode or dev.to.", ContentLeadID, domain.ReviewManual, "15:00", 2880, 0, domain.TaskContent{}},
		{4, domain.TaskFeature, "Projects grid with filters", "Show your projects as cards with tag filters. Branch: `feat/projects`.", DeliveryManagerID, domain.ReviewManual, "10:00", 1440, 0, domain.TaskContent{}},
		{4, domain.TaskDSA, "Best Time to Buy and Sell Stock", "One pass, constant space.", EngineeringManagerID, domain.ReviewManual, "12:00", 360, 0, domain.TaskContent{}},
		{5, domain.TaskStandup, "Friday standup", "What shipped this week, what's blocked, what's next.", domain.DefaultPersonaID, domain.ReviewSelf, "15:00", 120, 120, domain.TaskContent{}},
	}
	if _, err := q.Exec(ctx, `INSERT INTO flows (id, name, stream, description, days, created_by, created_at, updated_at)
		VALUES ($1, 'React Frontend · 30 days', 'React', 'Portfolio site, two React projects and a capstone, with daily DSA and writing.', 30, $2, $3, $3)`,
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
		release, ok := domain.ParseClockTime(t.release)
		if !ok {
			return fmt.Errorf("bad seed time %q", t.release)
		}
		spec := domain.TaskSpec{Type: t.typ, Title: t.title, Brief: t.brief, PersonaID: t.persona, ReviewMode: t.review, ReleaseTime: release,
			DueMinutes: t.dueMinutes, ReleaseWindow: t.window, Content: t.content}
		if spec.Content.Resources == nil {
			spec.Content.Resources = []domain.Resource{}
		}
		tpl, err := store.InsertTemplate(ctx, q, spec, admin, now)
		if err != nil {
			return err
		}
		id := tpl.ID
		items = append(items, domain.FlowItem{Day: t.day, Position: perDay[t.day], TemplateID: &id, Spec: spec})
		perDay[t.day]++
	}
	return store.InsertFlowItems(ctx, q, versionID, items)
}
