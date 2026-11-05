package guidedcurriculum

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/db"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// Each import test owns a separate schema; it never resets shared application fixtures.
func importPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		if os.Getenv("CI") != "" {
			t.Fatal("TEST_DATABASE_URL is required in CI")
		}
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	admin, err := db.Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	schema := "curriculum_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		admin.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, err := admin.Exec(context.Background(), "DROP SCHEMA "+schema+" CASCADE")
		admin.Close()
		if err != nil {
			t.Errorf("remove isolated test schema: %v", err)
		}
	})
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	return pool
}

func TestImportPreservesAssignmentsAndIsIdempotent(t *testing.T) {
	pool := importPool(t)
	ctx := context.Background()
	admin, student := uuid.New(), uuid.New()
	if _, err := pool.Exec(ctx, `INSERT INTO users (id, github_login, name, role) VALUES
		($1, 'curriculum-admin', 'Curriculum Admin', 'admin'),
		($2, 'curriculum-student', 'Curriculum Student', 'student')`, admin, student); err != nil {
		t.Fatal(err)
	}
	var enrollment uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO enrollments (user_id, program_id, start_date, end_date, status)
		SELECT $1, id, CURRENT_DATE, CURRENT_DATE + 29, 'active' FROM programs WHERE slug = 'frontend-30' RETURNING id`, student).Scan(&enrollment); err != nil {
		t.Fatal(err)
	}
	var assigned uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO tasks (enrollment_id, type, title, brief, status, scheduled_for, due_at, created_by, created_at, updated_at)
		VALUES ($1, 'feature', 'Existing student assignment', 'Keep this exact brief', 'todo', now(), now()+interval '1 day', $2, now(), now()) RETURNING id`, enrollment, admin).Scan(&assigned); err != nil {
		t.Fatal(err)
	}
	var created ImportResult
	if err := store.New(pool).Tx(ctx, func(q store.Q) error { var err error; created, err = Import(ctx, q, admin, time.Now()); return err }); err != nil {
		t.Fatal(err)
	}
	if !created.Created || created.Tasks != 45 {
		t.Fatalf("unexpected initial result: %+v", created)
	}
	var taskTitle, taskBrief string
	if err := pool.QueryRow(ctx, "SELECT title, brief FROM tasks WHERE id = $1", assigned).Scan(&taskTitle, &taskBrief); err != nil {
		t.Fatal(err)
	}
	if taskTitle != "Existing student assignment" || taskBrief != "Keep this exact brief" {
		t.Fatal("import changed an assigned task")
	}
	var templateCount, itemCount int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM task_templates").Scan(&templateCount); err != nil {
		t.Fatal(err)
	}
	if templateCount != 45 {
		t.Fatalf("got %d templates", templateCount)
	}
	var body string
	if err := pool.QueryRow(ctx, `SELECT content->'documents'->0->>'body' FROM flow_items WHERE title = 'Two Sum'`).Scan(&body); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(body, "## Problem contract") {
		t.Fatal("import dropped the actual lesson")
	}
	if _, err := pool.Exec(ctx, "UPDATE flows SET description = 'Edited by the administrator' WHERE id = $1", FlowID); err != nil {
		t.Fatal(err)
	}
	var second ImportResult
	if err := store.New(pool).Tx(ctx, func(q store.Q) error { var err error; second, err = Import(ctx, q, admin, time.Now()); return err }); err != nil {
		t.Fatal(err)
	}
	if second.Created || second.FlowID != created.FlowID {
		t.Fatalf("not idempotent: %+v", second)
	}
	var description string
	if err := pool.QueryRow(ctx, "SELECT description FROM flows WHERE id = $1", FlowID).Scan(&description); err != nil {
		t.Fatal(err)
	}
	if description != "Edited by the administrator" {
		t.Fatal("repeat import overwrote user edits")
	}
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM task_templates").Scan(&templateCount); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM flow_items").Scan(&itemCount); err != nil {
		t.Fatal(err)
	}
	if templateCount != 45 || itemCount != 45 {
		t.Fatalf("repeat import duplicated data: templates=%d items=%d", templateCount, itemCount)
	}
	if _, err := Import(ctx, pool, admin, time.Now()); err == nil {
		t.Fatal("import outside a transaction must be rejected")
	}
	if err := store.New(pool).Tx(ctx, func(q store.Q) error {
		_, err := Import(ctx, q, student, time.Now())
		if err == nil {
			return fmt.Errorf("student import unexpectedly succeeded")
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}

func TestImportFailureRollsBackAllEditionChanges(t *testing.T) {
	pool := importPool(t)
	ctx := context.Background()
	admin := uuid.New()
	if _, err := pool.Exec(ctx, "INSERT INTO users (id, github_login, name, role) VALUES ($1, 'admin', 'Admin', 'admin')", admin); err != nil {
		t.Fatal(err)
	}
	// A conflicting name is a user-owned flow: preserve it and roll back new personas.
	if _, err := pool.Exec(ctx, `INSERT INTO flows (name, stream, days, created_by, created_at, updated_at)
		VALUES ($1, 'React', 30, $2, now(), now())`, Name, admin); err != nil {
		t.Fatal(err)
	}
	err := pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error { _, err := Import(ctx, tx, admin, time.Now()); return err })
	if err == nil {
		t.Fatal("conflicting user flow name must not be overwritten")
	}
	var personas, templates, flows int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM personas").Scan(&personas); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM task_templates").Scan(&templates); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM flows").Scan(&flows); err != nil {
		t.Fatal(err)
	}
	if personas != 1 || templates != 0 || flows != 1 {
		t.Fatalf("partial import leaked: personas=%d templates=%d flows=%d", personas, templates, flows)
	}
}

func TestImportPreservesConflictingPersonaIdentity(t *testing.T) {
	pool := importPool(t)
	ctx := context.Background()
	admin := uuid.New()
	if _, err := pool.Exec(ctx, "INSERT INTO users (id, github_login, name, role) VALUES ($1, 'admin', 'Admin', 'admin')", admin); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO personas (id, name, title, color, auto_reply)
		VALUES ($1, 'Existing custom manager', 'Preserve me', 'amber', false)`, ImportPersonas().Lead); err != nil {
		t.Fatal(err)
	}
	err := store.New(pool).Tx(ctx, func(q store.Q) error { _, err := Import(ctx, q, admin, time.Now()); return err })
	if err == nil || !strings.Contains(err.Error(), "different settings") {
		t.Fatalf("expected preserved persona collision, got %v", err)
	}
	var name string
	if err := pool.QueryRow(ctx, "SELECT name FROM personas WHERE id = $1", ImportPersonas().Lead).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name != "Existing custom manager" {
		t.Fatal("import overwrote a conflicting manager")
	}
	var flows int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM flows").Scan(&flows); err != nil {
		t.Fatal(err)
	}
	if flows != 0 {
		t.Fatal("failed import created a partial flow")
	}
}
