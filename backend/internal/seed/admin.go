package seed

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// DemoLogins are every account the demo seed creates.
var DemoLogins = []string{AdminLogin, CollegeAdminLogin, StudentLogin, Student2Login, IndieStudentLogin, PausedLogin, NoEnrollLogin, ApplicantLogin}

// FlushMode picks how much a flush removes.
type FlushMode string

const (
	// FlushDemo removes the demo accounts, their internships and the demo catalog only.
	FlushDemo FlushMode = "demo"
	// FlushAll empties every table except programs and the default team-lead persona.
	FlushAll FlushMode = "all"
)

// ErrRealDataTouchesDemo means real rows depend on demo rows; flush "all" or tidy up first.
var ErrRealDataTouchesDemo = errors.New("some real data depends on demo data (for example a real student on the demo flow, or tasks the demo admin assigned to real students); remove it first or flush mode \"all\"")

// Flush removes seeded data. Run it inside one transaction: it either all happens or nothing does.
func Flush(ctx context.Context, q store.Q, mode FlushMode) error {
	switch mode {
	case FlushAll:
		if _, err := q.Exec(ctx, `TRUNCATE task_notes, task_submissions, quiz_attempts, points_ledger, credit_ledger, ai_messages, ai_conversations,
			certificates, task_events, chat_threads, chat_messages, tasks, enrollments, flow_items, flow_versions, flows,
			task_templates, personas, cohorts, login_codes, refresh_tokens, users, colleges RESTART IDENTITY CASCADE`); err != nil {
			return fmt.Errorf("truncate: %w", err)
		}
		return ensureDefaultPersona(ctx, q)
	case FlushDemo:
		return flushDemo(ctx, q)
	}
	return fmt.Errorf("unknown flush mode %q (use demo or all)", mode)
}

func flushDemo(ctx context.Context, q store.Q) error {
	logins := make([]string, len(DemoLogins))
	for i, l := range DemoLogins {
		logins[i] = strings.ToLower(l)
	}
	demoPersonas := []any{EngineeringManagerID, DeliveryManagerID, ContentLeadID}
	type step struct {
		sql  string
		args []any
	}
	steps := []step{
		{`CREATE TEMP TABLE demo_users ON COMMIT DROP AS SELECT id FROM users WHERE lower(github_login) = ANY($1)`, []any{logins}},
		{`CREATE TEMP TABLE demo_enr ON COMMIT DROP AS SELECT id FROM enrollments WHERE user_id IN (SELECT id FROM demo_users)`, nil},
		{`CREATE TEMP TABLE demo_tasks ON COMMIT DROP AS SELECT id FROM tasks WHERE enrollment_id IN (SELECT id FROM demo_enr)`, nil},
		// Feature 15: demo applicants' applications go; real ones only lose the demo admin's name.
		{`DELETE FROM applications WHERE user_id IN (SELECT id FROM demo_users)`, nil},
		{`UPDATE applications SET decided_by = NULL WHERE decided_by IN (SELECT id FROM demo_users)`, nil},
		{`UPDATE application_messages SET sent_by = NULL WHERE sent_by IN (SELECT id FROM demo_users)`, nil},
		{`UPDATE payment_settings SET updated_by = NULL WHERE updated_by IN (SELECT id FROM demo_users)`, nil},
		// The seeded UPI details and sample QR are not real; clear them so nobody pays into them.
		{`UPDATE payment_settings SET upi_id = '', payee_name = '', note = '', qr_image = NULL, qr_type = NULL WHERE upi_id = 'stackstep@okaxis'`, nil},
		{`DELETE FROM credit_ledger WHERE enrollment_id IN (SELECT id FROM demo_enr)`, nil},
		{`DELETE FROM points_ledger WHERE enrollment_id IN (SELECT id FROM demo_enr)`, nil},
		{`DELETE FROM ai_messages WHERE enrollment_id IN (SELECT id FROM demo_enr)`, nil},
		{`DELETE FROM ai_conversations WHERE enrollment_id IN (SELECT id FROM demo_enr)`, nil},
		{`DELETE FROM certificates WHERE enrollment_id IN (SELECT id FROM demo_enr)`, nil},
		{`DELETE FROM chat_messages WHERE enrollment_id IN (SELECT id FROM demo_enr)`, nil},
		{`DELETE FROM chat_threads WHERE enrollment_id IN (SELECT id FROM demo_enr)`, nil},
		{`DELETE FROM quiz_attempts WHERE task_id IN (SELECT id FROM demo_tasks)`, nil},
		{`DELETE FROM task_submissions WHERE task_id IN (SELECT id FROM demo_tasks)`, nil},
		{`DELETE FROM task_events WHERE task_id IN (SELECT id FROM demo_tasks)`, nil},
		{`DELETE FROM tasks WHERE id IN (SELECT id FROM demo_tasks)`, nil},
		{`DELETE FROM enrollments WHERE id IN (SELECT id FROM demo_enr)`, nil},
		{`DELETE FROM flow_versions WHERE flow_id IN (SELECT id FROM flows WHERE id = $1 OR created_by IN (SELECT id FROM demo_users))`, []any{ReactFlowID}},
		{`DELETE FROM flows WHERE id = $1 OR created_by IN (SELECT id FROM demo_users)`, []any{ReactFlowID}},
		{`DELETE FROM task_templates WHERE created_by IN (SELECT id FROM demo_users)`, nil},
		{`DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM demo_users)`, nil},
		{`DELETE FROM login_codes WHERE user_id IN (SELECT id FROM demo_users)`, nil},
		{`DELETE FROM users WHERE id IN (SELECT id FROM demo_users)`, nil},
		{`DELETE FROM personas p WHERE p.id = ANY($1)
		   AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.persona_id = p.id)
		   AND NOT EXISTS (SELECT 1 FROM chat_messages m WHERE m.persona_id = p.id)
		   AND NOT EXISTS (SELECT 1 FROM chat_threads th WHERE th.persona_id = p.id)
		   AND NOT EXISTS (SELECT 1 FROM task_templates tt WHERE tt.persona_id = p.id)
		   AND NOT EXISTS (SELECT 1 FROM flow_items fi WHERE fi.persona_id = p.id)`, []any{demoPersonas}},
		{`DELETE FROM cohorts c WHERE c.name IN ('ANITS Batch 1', $1) AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.cohort_id = c.id)
		   AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.cohort_id = c.id)`, []any{OpenCohortName}},
		{`DELETE FROM colleges col WHERE col.name = 'ANITS'
		   AND NOT EXISTS (SELECT 1 FROM cohorts c WHERE c.college_id = col.id)
		   AND NOT EXISTS (SELECT 1 FROM users u WHERE u.college_id = col.id)`, nil},
	}
	for _, st := range steps {
		if _, err := q.Exec(ctx, st.sql, st.args...); err != nil {
			var pg *pgconn.PgError
			if errors.As(err, &pg) && pg.Code == "23503" {
				return fmt.Errorf("%w (%s)", ErrRealDataTouchesDemo, pg.ConstraintName)
			}
			return fmt.Errorf("flush demo: %w", err)
		}
	}
	return ensureDefaultPersona(ctx, q)
}

// ensureDefaultPersona puts back the team lead every chat falls back to.
func ensureDefaultPersona(ctx context.Context, q store.Q) error {
	_, err := q.Exec(ctx, `INSERT INTO personas (id, name, title, color, auto_reply) VALUES ($1, 'Sam Rivera', 'Team Lead', 'violet', true)
		ON CONFLICT (id) DO NOTHING`, domain.DefaultPersonaID)
	return err
}

// AdminResult says what happened to one login.
type AdminResult struct {
	Login  string
	Status string // "created", "promoted" or "already admin"
}

// SeedAdmins makes each GitHub login a platform admin, creating the account if it has never
// signed in (it links on first GitHub sign-in). Nothing else is created.
func SeedAdmins(ctx context.Context, q store.Q, logins []string, now time.Time) ([]AdminResult, error) {
	if err := ensureDefaultPersona(ctx, q); err != nil {
		return nil, err
	}
	var out []AdminResult
	seen := map[string]bool{}
	for _, raw := range logins {
		login := strings.TrimPrefix(strings.TrimSpace(raw), "@")
		if login == "" || seen[strings.ToLower(login)] {
			continue
		}
		seen[strings.ToLower(login)] = true
		if !domain.ValidGitHubLogin(login) {
			return nil, fmt.Errorf("%q is not a valid GitHub username", login)
		}
		u, err := store.GetUserByLogin(ctx, q, login)
		switch {
		case errors.Is(err, store.ErrNotFound):
			if _, err := store.InsertPendingUser(ctx, q, domain.PersonInput{GitHubLogin: login, Name: login}, domain.RoleAdmin, nil, now); err != nil {
				return nil, fmt.Errorf("create %s: %w", login, err)
			}
			out = append(out, AdminResult{Login: login, Status: "created"})
		case err != nil:
			return nil, err
		case u.Role == domain.RoleAdmin:
			out = append(out, AdminResult{Login: login, Status: "already admin"})
		default:
			if _, err := store.SetUserRole(ctx, q, u.ID, domain.RoleAdmin, nil, now); err != nil {
				return nil, fmt.Errorf("promote %s: %w", login, err)
			}
			out = append(out, AdminResult{Login: login, Status: "promoted"})
		}
	}
	if len(out) == 0 {
		return nil, errors.New("give at least one GitHub username")
	}
	return out, nil
}
