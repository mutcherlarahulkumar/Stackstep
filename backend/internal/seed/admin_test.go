package seed

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
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

func pool(t *testing.T) *store.Store {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	// Its own database: other packages' tests share TEST_DATABASE_URL and run in parallel.
	u, err := neturl.Parse(url)
	if err != nil {
		t.Fatal(err)
	}
	name := fmt.Sprintf("%s_seed_%d", strings.TrimPrefix(u.Path, "/"), os.Getpid())
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

// TestFlushAndAdmins covers DB1–DB4: demo flush keeps real data, all-flush empties, admins seed.
func TestFlushAndAdmins(t *testing.T) {
	s := pool(t)
	ctx := context.Background()
	now := time.Now().UTC()
	tx := func(fn func(store.Q) error) error { return s.Tx(ctx, fn) }
	if err := tx(func(q store.Q) error {
		if err := Reset(ctx, q); err != nil {
			return err
		}
		return Run(ctx, q, now)
	}); err != nil {
		t.Fatal(err)
	}
	// A real admin who signed up separately survives a demo flush.
	if err := tx(func(q store.Q) error { _, err := SeedAdmins(ctx, q, []string{"real-admin"}, now); return err }); err != nil {
		t.Fatal(err)
	}

	// DB1: demo flush removes demo accounts, internships and catalog, keeps the rest.
	if err := tx(func(q store.Q) error { return Flush(ctx, q, FlushDemo) }); err != nil {
		t.Fatal(err)
	}
	if n := count(t, s, `SELECT count(*) FROM users WHERE lower(github_login) = ANY($1)`, []string{"admin-demo", "asha-dev", "meera-dev"}); n != 0 {
		t.Fatalf("demo users left: %d", n)
	}
	if count(t, s, `SELECT count(*) FROM enrollments`) != 0 || count(t, s, `SELECT count(*) FROM flows`) != 0 || count(t, s, `SELECT count(*) FROM task_templates`) != 0 {
		t.Fatal("demo internships or catalog left")
	}
	if count(t, s, `SELECT count(*) FROM users WHERE github_login = 'real-admin' AND role = 'admin'`) != 1 {
		t.Fatal("real admin removed")
	}
	if count(t, s, `SELECT count(*) FROM personas WHERE id = $1`, domain.DefaultPersonaID) != 1 || count(t, s, `SELECT count(*) FROM personas`) != 1 {
		t.Fatal("personas: want only the default team lead")
	}
	if count(t, s, `SELECT count(*) FROM programs`) == 0 {
		t.Fatal("programs removed")
	}
	// Running it again is harmless.
	if err := tx(func(q store.Q) error { return Flush(ctx, q, FlushDemo) }); err != nil {
		t.Fatal(err)
	}

	// DB2: admins are created once, promoted when they exist, and validated.
	var res []AdminResult
	if err := tx(func(q store.Q) error {
		var err error
		res, err = SeedAdmins(ctx, q, []string{" @New-Admin ", "real-admin", "new-admin"}, now)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	if len(res) != 2 || res[0].Status != "created" || res[1].Status != "already admin" {
		t.Fatalf("results = %+v", res)
	}
	if err := tx(func(q store.Q) error { _, err := SeedAdmins(ctx, q, []string{"bad login!"}, now); return err }); err == nil {
		t.Fatal("bad login accepted")
	}
	if err := tx(func(q store.Q) error { _, err := SeedAdmins(ctx, q, []string{" ", ""}, now); return err }); err == nil {
		t.Fatal("empty list accepted")
	}

	// DB3: real data on the demo flow blocks a demo flush, and nothing is half-deleted.
	if err := tx(func(q store.Q) error { return Run(ctx, q, now) }); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Pool.Exec(ctx, `UPDATE users SET github_login = 'real-student' WHERE github_login = 'meera-dev'`); err != nil {
		t.Fatal(err)
	}
	err := tx(func(q store.Q) error { return Flush(ctx, q, FlushDemo) })
	if !errors.Is(err, ErrRealDataTouchesDemo) {
		t.Fatalf("err = %v", err)
	}
	if count(t, s, `SELECT count(*) FROM users WHERE github_login = 'asha-dev'`) != 1 {
		t.Fatal("partial flush")
	}

	// DB4: flush all empties everything but programs and the default persona.
	if err := tx(func(q store.Q) error { return Flush(ctx, q, FlushAll) }); err != nil {
		t.Fatal(err)
	}
	if count(t, s, `SELECT count(*) FROM users`) != 0 || count(t, s, `SELECT count(*) FROM personas`) != 1 || count(t, s, `SELECT count(*) FROM programs`) == 0 {
		t.Fatal("flush all")
	}
	if err := tx(func(q store.Q) error { return Flush(ctx, q, "nope") }); err == nil {
		t.Fatal("unknown mode accepted")
	}
}
