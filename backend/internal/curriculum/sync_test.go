package curriculum

import (
	"context"
	"errors"
	"fmt"
	neturl "net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/db"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

func testStore(t *testing.T) *store.Store {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	u, err := neturl.Parse(url)
	if err != nil {
		t.Fatal(err)
	}
	name := fmt.Sprintf("%s_curriculum_%d", strings.TrimPrefix(u.Path, "/"), os.Getpid())
	admin, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(admin.Close)
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+pgx.Identifier{name}.Sanitize()); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), "DROP DATABASE IF EXISTS "+pgx.Identifier{name}.Sanitize()+" WITH (FORCE)")
	})
	u.Path = "/" + name
	p, err := pgxpool.New(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(p.Close)
	if err := db.Migrate(ctx, p); err != nil {
		t.Fatal(err)
	}
	return store.New(p)
}

func count(t *testing.T, s *store.Store, sql string, args ...any) int {
	t.Helper()
	var n int
	if err := s.Pool.QueryRow(context.Background(), sql, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func run(t *testing.T, s *store.Store, now time.Time) Result {
	t.Helper()
	var res Result
	if err := s.Tx(context.Background(), func(q store.Q) error {
		var err error
		res, err = Sync(context.Background(), q, now)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	return res
}

// CU1–CU5: loading needs an admin, creates everything once, is a no-op when unchanged,
// publishes a new version when content changed, and never touches an admin's open draft.
func TestSync(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	now := time.Date(2026, 11, 2, 9, 0, 0, 0, time.UTC)

	// CU1: no admin yet.
	err := s.Tx(ctx, func(q store.Q) error { _, err := Sync(ctx, q, now); return err })
	if !errors.Is(err, ErrNoAdmin) {
		t.Fatalf("without an admin: %v", err)
	}
	if err := s.Tx(ctx, func(q store.Q) error {
		_, err := seed.SeedAdmins(ctx, q, []string{"owner"}, now)
		return err
	}); err != nil {
		t.Fatal(err)
	}

	// CU2: first run creates personas, the library and both flows at version 1.
	items, _ := Templates()
	res := run(t, s, now)
	if res.PersonasCreated != len(Personas())-1 || res.TemplatesCreated != len(items) || len(res.Flows) != 2 {
		t.Fatalf("first run = %+v", res)
	}
	for _, f := range res.Flows {
		if f.Status != "created" || f.Version != 1 {
			t.Fatalf("flow = %+v", f)
		}
	}
	for _, f := range Flows() {
		want := 0
		for _, d := range f.Plan {
			want += len(d.Items)
		}
		got := count(t, s, `SELECT count(*) FROM flow_items i JOIN flow_versions v ON v.id = i.version_id WHERE v.flow_id = $1 AND v.status = 'published'`, f.ID)
		if got != want {
			t.Fatalf("%s has %d items, want %d", f.Name, got, want)
		}
	}
	if n := count(t, s, `SELECT count(*) FROM flow_items WHERE content->'practice' IS NOT NULL AND content->'practice' <> 'null'`); n == 0 {
		t.Fatal("practice pads were not stored")
	}

	// CU3: running again changes nothing.
	res = run(t, s, now.Add(time.Hour))
	if res.PersonasCreated+res.PersonasUpdated+res.TemplatesCreated+res.TemplatesUpdated != 0 || res.TemplatesUnchanged != len(items) {
		t.Fatalf("second run = %+v", res)
	}
	for _, f := range res.Flows {
		if f.Status != "unchanged" || f.Version != 1 {
			t.Fatalf("second run flow = %+v", f)
		}
	}

	// CU4: content drifted (here, edited in the database). The library task is restored and
	// each flow gets a new published version; the old one is retired, not deleted.
	key := Flows()[0].Plan[1].Items[1].Key
	if _, err := s.Pool.Exec(ctx, `UPDATE task_templates SET title = 'Old title' WHERE id = $1`, TemplateID(key)); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Pool.Exec(ctx, `UPDATE flow_items SET brief = 'old brief' WHERE template_id = $1`, TemplateID(key)); err != nil {
		t.Fatal(err)
	}
	res = run(t, s, now.Add(2*time.Hour))
	if res.TemplatesUpdated != 1 {
		t.Fatalf("drift run = %+v", res)
	}
	for _, f := range res.Flows {
		if f.Status != "updated" || f.Version != 2 {
			t.Fatalf("drift run flow = %+v", f)
		}
	}
	if n := count(t, s, `SELECT count(*) FROM flow_versions WHERE flow_id = $1 AND status = 'retired'`, Frontend30ID); n != 1 {
		t.Fatalf("retired versions = %d", n)
	}

	// CU5: an admin's open draft is never overwritten; that flow is skipped with a note.
	if _, err := s.Pool.Exec(ctx, `INSERT INTO flow_versions (flow_id, number, status, created_at) VALUES ($1, 3, 'draft', now())`, Fullstack60ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Pool.Exec(ctx, `UPDATE flow_items SET title = 'Changed' WHERE id = (
		SELECT i.id FROM flow_items i JOIN flow_versions v ON v.id = i.version_id WHERE v.flow_id = $1 AND v.status = 'published' LIMIT 1)`, Fullstack60ID); err != nil {
		t.Fatal(err)
	}
	res = run(t, s, now.Add(3*time.Hour))
	for _, f := range res.Flows {
		if f.Name == "Full-stack Internship · 60 days" && (f.Status != "skipped" || f.Note == "") {
			t.Fatalf("draft flow = %+v", f)
		}
	}
}

// CU6: the curriculum and the demo seed can live in one database (no name clashes).
func TestSyncAlongsideDemoSeed(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if err := s.Tx(ctx, func(q store.Q) error {
		if err := seed.Reset(ctx, q); err != nil {
			return err
		}
		return seed.Run(ctx, q, time.Now().UTC())
	}); err != nil {
		t.Fatal(err)
	}
	// A real admin exists besides admin-demo: the curriculum belongs to them, so a demo
	// flush afterwards leaves it in place.
	if err := s.Tx(ctx, func(q store.Q) error {
		_, err := seed.SeedAdmins(ctx, q, []string{"real-owner"}, time.Now().UTC())
		return err
	}); err != nil {
		t.Fatal(err)
	}
	res := run(t, s, time.Now().UTC())
	if len(res.Flows) != 2 || res.Flows[0].Status != "created" {
		t.Fatalf("with demo data = %+v", res)
	}
	if err := s.Tx(ctx, func(q store.Q) error { return seed.Flush(ctx, q, seed.FlushDemo) }); err != nil {
		t.Fatal(err)
	}
	if n := count(t, s, `SELECT count(*) FROM flows WHERE id = ANY($1)`, []any{Frontend30ID, Fullstack60ID}); n != 2 {
		t.Fatalf("demo flush removed curriculum flows, %d left", n)
	}
	items, _ := Templates()
	if n := count(t, s, `SELECT count(*) FROM task_templates WHERE created_by = (SELECT id FROM users WHERE github_login = 'real-owner')`); n != len(items) {
		t.Fatalf("templates owned by the real admin = %d", n)
	}
}
