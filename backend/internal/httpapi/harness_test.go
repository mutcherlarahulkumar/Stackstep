package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/app"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/auth"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/clock"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/config"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/db"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/lead"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/realtime"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// Integration tests need TEST_DATABASE_URL; they share one database and run serially.
var (
	poolOnce sync.Once
	pool     *pgxpool.Pool
	poolErr  error
	dbMu     sync.Mutex
)

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		if os.Getenv("CI") != "" {
			t.Fatal("TEST_DATABASE_URL must be set in CI")
		}
		t.Skip("TEST_DATABASE_URL not set")
	}
	poolOnce.Do(func() {
		ctx := context.Background()
		pool, poolErr = db.Open(ctx, url)
		if poolErr == nil {
			poolErr = db.Migrate(ctx, pool)
		}
	})
	if poolErr != nil {
		t.Fatal(poolErr)
	}
	return pool
}

// leadThread is the student's conversation with the default Team Lead persona.
var leadThread = "/v1/me/threads/" + domain.DefaultPersonaID.String() + "/messages"

// env is one test's server, clock and helpers.
type env struct {
	t     *testing.T
	srv   *Server
	h     http.Handler
	clock *clock.Fake
	store *store.Store
	cfg   config.Config
	ai    *fakeAI
	prs   *fakePRs
}

// Monday 10:00 IST on day 3 of the seeded internship.
var testNow = time.Date(2026, 11, 4, 4, 30, 0, 0, time.UTC)

type envOpt func(*config.Config)

func newEnv(t *testing.T, opts ...envOpt) *env {
	t.Helper()
	p := testPool(t)
	dbMu.Lock()
	t.Cleanup(dbMu.Unlock)

	ctx := context.Background()
	st := store.New(p)
	if err := st.Tx(ctx, func(q store.Q) error {
		if err := seed.Reset(ctx, q); err != nil {
			return err
		}
		return seed.Run(ctx, q, testNow)
	}); err != nil {
		t.Fatal(err)
	}

	web, _ := url.Parse("http://web.test")
	mobile, _ := url.Parse("stackstep://auth")
	cfg := config.Config{
		Env: config.EnvTest, JWTSecret: bytes.Repeat([]byte("j"), 32), StateSecret: bytes.Repeat([]byte("s"), 32),
		WebBaseURL: web, MobileRedirectURL: mobile, AllowedOrigins: []string{"http://web.test"},
		LeadReplyDelay: 30 * time.Second, DeliveryInterval: time.Second, AuthRatePerMinute: 1000,
		BootstrapAdminLogins: map[string]struct{}{},
	}
	for _, o := range opts {
		o(&cfg)
	}
	clk := clock.NewFake(testNow)
	signer, _ := auth.NewSigner(cfg.JWTSecret)
	states, _ := auth.NewStateSigner(cfg.StateSecret)
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	fake := &fakeAI{}
	if cfg.AI.GroqAPIKey == "" && cfg.AI.DailyQuestions == 0 { // defaults for tests that don't care
		cfg.AI = config.AIConfig{GroqAPIKey: "test-key", Timeout: 5 * time.Second, DailyQuestions: 8, QuestionCooldown: 2 * time.Minute,
			FollowUpCooldown: 5 * time.Minute, MaxFollowUps: 3, GlobalPerMinute: 1000, ReviewDrafts: true, DraftsPerStaffDay: 60}
	}
	scripted := lead.Scripted{Delay: cfg.LeadReplyDelay}
	var agent lead.Agent = scripted
	if cfg.AI.TeamLeadEnabled() {
		agent = lead.LLM{Provider: fake, Fallback: scripted, Delay: cfg.LeadReplyDelay, Log: log}
	}
	// Background work (AI replies) runs inline so tests see its result right away.
	ws := &app.Workspace{Store: st, Clock: clk, Lead: agent, Log: log, Background: func(f func()) { f() }}
	prs := &fakePRs{}
	srv := New(Deps{
		Config: cfg, Store: st, Clock: clk, Signer: signer, States: states,
		GitHub:    &auth.GitHub{ClientID: cfg.GitHubClientID, ClientSecret: cfg.GitHubClientSecret, RedirectURL: cfg.GitHubRedirectURL, OAuthBaseURL: cfg.GitHubOAuthBaseURL, APIBaseURL: cfg.GitHubAPIBaseURL},
		Sessions:  &app.Sessions{Store: st, Clock: clk, Signer: signer, BootstrapAdmins: cfg.BootstrapAdminLogins},
		Workspace: ws, Helper: app.NewHelper(ws, fake, cfg.AI), Admissions: app.NewAdmissions(ws),
		Drafter: &app.Drafter{Store: st, Clock: clk, AI: fake, PRs: prs, Config: cfg.AI, Log: log},
		Hub:     realtime.NewHub(), Log: log,
	})
	return &env{t: t, srv: srv, h: srv.Handler(), clock: clk, store: st, cfg: cfg, ai: fake, prs: prs}
}

type resp struct {
	Code   int
	Body   []byte
	Header http.Header
}

func (r resp) json(t *testing.T, v any) {
	t.Helper()
	if err := json.Unmarshal(r.Body, v); err != nil {
		t.Fatalf("decode %s: %v", r.Body, err)
	}
}

type apiError struct {
	Error struct {
		Code              string            `json:"code"`
		Message           string            `json:"message"`
		Fields            map[string]string `json:"fields"`
		RetryAfterSeconds *int              `json:"retry_after_seconds"`
	} `json:"error"`
}

func (r resp) errCode(t *testing.T) apiError {
	t.Helper()
	var e apiError
	r.json(t, &e)
	return e
}

func (e *env) do(method, path, token string, body any, headers ...string) resp {
	e.t.Helper()
	var rd io.Reader
	switch b := body.(type) {
	case nil:
	case string:
		rd = bytes.NewBufferString(b)
	default:
		buf, err := json.Marshal(b)
		if err != nil {
			e.t.Fatal(err)
		}
		rd = bytes.NewReader(buf)
	}
	req := httptest.NewRequest(method, path, rd)
	if rd != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	rec := httptest.NewRecorder()
	e.h.ServeHTTP(rec, req)
	return resp{Code: rec.Code, Body: rec.Body.Bytes(), Header: rec.Header()}
}

func (e *env) expect(r resp, code int) resp {
	e.t.Helper()
	if r.Code != code {
		e.t.Fatalf("status = %d, want %d; body: %s", r.Code, code, r.Body)
	}
	return r
}

// login signs in as a seeded user and returns an access token.
func (e *env) login(login string) string {
	e.t.Helper()
	r := e.expect(e.do("POST", "/v1/auth/dev-login", "", map[string]string{"github_login": login}, "X-Client", "mobile"), 200)
	var tok struct {
		AccessToken string `json:"access_token"`
	}
	r.json(e.t, &tok)
	return tok.AccessToken
}

type meResp struct {
	User struct {
		ID   uuid.UUID `json:"id"`
		Role string    `json:"role"`
	} `json:"user"`
	Enrollment *struct {
		ID        uuid.UUID `json:"id"`
		DayNumber int       `json:"day_number"`
		Status    string    `json:"status"`
	} `json:"enrollment"`
}

func (e *env) me(token string) meResp {
	e.t.Helper()
	var m meResp
	e.expect(e.do("GET", "/v1/me", token, nil), 200).json(e.t, &m)
	return m
}

func (e *env) enrollmentOf(login string) uuid.UUID {
	e.t.Helper()
	var id uuid.UUID
	if err := e.store.Pool.QueryRow(context.Background(),
		`SELECT e.id FROM enrollments e JOIN users u ON u.id = e.user_id WHERE u.github_login = $1`, login).Scan(&id); err != nil {
		e.t.Fatal(err)
	}
	return id
}

type taskResp struct {
	ID           uuid.UUID `json:"id"`
	Status       string    `json:"status"`
	Version      int       `json:"version"`
	Title        string    `json:"title"`
	ScheduledFor time.Time `json:"scheduled_for"`
}

func (e *env) createTask(token string, enrollment uuid.UUID, body map[string]any) resp {
	e.t.Helper()
	return e.do("POST", "/v1/admin/enrollments/"+enrollment.String()+"/tasks", token, body)
}

func validTask(now time.Time) map[string]any {
	return map[string]any{"type": "feature", "title": "Add filtering to the task list", "brief": "Use Array.filter.", "due_at": now.Add(4 * time.Hour)}
}

func (e *env) mustCreateTask(token string, enrollment uuid.UUID) taskResp {
	e.t.Helper()
	var t taskResp
	e.expect(e.createTask(token, enrollment, validTask(e.clock.Now())), 201).json(e.t, &t)
	return t
}

// move transitions a task; submitting for review carries a default PR link.
func (e *env) move(token string, id uuid.UUID, to string, version int, note string) resp {
	e.t.Helper()
	body := map[string]any{"to": to, "expected_version": version, "note": note}
	if to == "in_review" {
		body["submission"] = map[string]any{"url": "https://github.com/asha-dev/portfolio/pull/1", "note": ""}
	}
	return e.do("POST", "/v1/tasks/"+id.String()+"/transitions", token, body)
}
