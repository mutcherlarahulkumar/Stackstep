package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/auth"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/config"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

// ---- Auth (A1–A7) ----

func TestAuthRequired(t *testing.T) {
	e := newEnv(t)
	for _, tok := range []string{"", "not-a-jwt", "a.b.c"} {
		r := e.expect(e.do("GET", "/v1/me", tok, nil), 401)
		if got := r.errCode(t).Error.Code; got != "unauthenticated" {
			t.Fatalf("code = %s", got)
		}
	}
	tok := e.login(seed.StudentLogin)
	e.clock.Advance(auth.AccessTTL + time.Second)
	e.expect(e.do("GET", "/v1/me", tok, nil), 401)
}

func TestMeShowsEnrollmentAndDay(t *testing.T) {
	e := newEnv(t)
	m := e.me(e.login(seed.StudentLogin))
	if m.User.Role != "student" || m.Enrollment == nil || m.Enrollment.DayNumber != 3 || m.Enrollment.Status != "active" {
		t.Fatalf("me = %+v", m)
	}
	if adm := e.me(e.login(seed.AdminLogin)); adm.Enrollment != nil {
		t.Fatal("admin has an enrollment")
	}
}

func TestDevLoginDisabledInProd(t *testing.T) {
	e := newEnv(t, func(c *config.Config) { c.Env = config.EnvProduction })
	e.expect(e.do("POST", "/v1/auth/dev-login", "", map[string]string{"github_login": seed.StudentLogin}, "X-Client", "mobile"), 404)
}

func TestDevLoginValidation(t *testing.T) {
	e := newEnv(t)
	e.expect(e.do("POST", "/v1/auth/dev-login", "", map[string]string{"github_login": "nobody"}, "X-Client", "mobile"), 422)
	e.expect(e.do("POST", "/v1/auth/dev-login", "", map[string]string{"github_login": seed.StudentLogin}), 400) // no X-Client
}

func TestRefreshReuseRevokesFamily(t *testing.T) {
	e := newEnv(t)
	r := e.expect(e.do("POST", "/v1/auth/dev-login", "", map[string]string{"github_login": seed.StudentLogin}, "X-Client", "mobile"), 200)
	var first tokensDTO
	r.json(t, &first)
	if first.RefreshToken == nil {
		t.Fatal("mobile login returned no refresh token")
	}

	var second tokensDTO
	e.expect(e.do("POST", "/v1/auth/refresh", "", map[string]string{"refresh_token": *first.RefreshToken}, "X-Client", "mobile"), 200).json(t, &second)
	if *second.RefreshToken == *first.RefreshToken {
		t.Fatal("refresh token was not rotated")
	}
	// Replaying the first token is theft: it fails and kills the newer token too.
	e.expect(e.do("POST", "/v1/auth/refresh", "", map[string]string{"refresh_token": *first.RefreshToken}, "X-Client", "mobile"), 401)
	e.expect(e.do("POST", "/v1/auth/refresh", "", map[string]string{"refresh_token": *second.RefreshToken}, "X-Client", "mobile"), 401)
}

func TestWebRefreshUsesHttpOnlyCookie(t *testing.T) {
	e := newEnv(t)
	r := e.expect(e.do("POST", "/v1/auth/dev-login", "", map[string]string{"github_login": seed.StudentLogin}, "X-Client", "web"), 200)
	var body map[string]any
	r.json(t, &body)
	if _, leaked := body["refresh_token"]; leaked {
		t.Fatal("web response exposed the refresh token")
	}
	cookie := r.Header.Get("Set-Cookie")
	if !strings.Contains(cookie, "ss_refresh=") || !strings.Contains(cookie, "HttpOnly") || !strings.Contains(cookie, "SameSite=Lax") {
		t.Fatalf("cookie = %q", cookie)
	}
	val := strings.SplitN(strings.TrimPrefix(cookie, "ss_refresh="), ";", 2)[0]
	e.expect(e.do("POST", "/v1/auth/refresh", "", nil, "X-Client", "web", "Cookie", "ss_refresh="+val), 200)
	e.expect(e.do("POST", "/v1/auth/refresh", "", nil, "X-Client", "web"), 401) // no cookie
	e.expect(e.do("POST", "/v1/auth/logout", "", nil, "X-Client", "web", "Cookie", "ss_refresh="+val), 204)
}

func TestExchangeCodeSingleUseAndExpiry(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	u := e.me(e.login(seed.StudentLogin)).User.ID
	verifier := strings.Repeat("v", 64)
	sum := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(sum[:])

	code, err := e.srv.sessions.IssueLoginCode(ctx, u, challenge)
	if err != nil {
		t.Fatal(err)
	}
	e.expect(e.do("POST", "/v1/auth/exchange", "", map[string]string{"code": code, "code_verifier": strings.Repeat("w", 64)}), 401) // wrong verifier burns it
	e.expect(e.do("POST", "/v1/auth/exchange", "", map[string]string{"code": code, "code_verifier": verifier}), 401)

	code, _ = e.srv.sessions.IssueLoginCode(ctx, u, challenge)
	e.expect(e.do("POST", "/v1/auth/exchange", "", map[string]string{"code": code, "code_verifier": verifier}), 200)
	e.expect(e.do("POST", "/v1/auth/exchange", "", map[string]string{"code": code, "code_verifier": verifier}), 401)

	code, _ = e.srv.sessions.IssueLoginCode(ctx, u, challenge)
	e.clock.Advance(auth.LoginCodeTTL + time.Second)
	r := e.expect(e.do("POST", "/v1/auth/exchange", "", map[string]string{"code": code, "code_verifier": verifier}), 401)
	if r.errCode(t).Error.Code != "invalid_code" {
		t.Fatalf("body %s", r.Body)
	}
}

// fakeGitHub serves the two endpoints the OAuth flow calls.
func fakeGitHub(t *testing.T) *httptest.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /login/oauth/access_token", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		if r.Form.Get("code") != "good-code" {
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "bad_verification_code"})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"access_token": "gho_test"})
	})
	mux.HandleFunc("GET /user", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"id": 4242, "login": "new-intern", "name": "New Intern", "email": nil, "avatar_url": "https://avatars.example/1"})
	})
	mux.HandleFunc("GET /user/emails", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]map[string]any{{"email": "intern@example.com", "primary": true, "verified": true}})
	})
	s := httptest.NewServer(mux)
	t.Cleanup(s.Close)
	return s
}

func githubEnv(t *testing.T) *env {
	gh := fakeGitHub(t)
	return newEnv(t, func(c *config.Config) {
		c.GitHubClientID, c.GitHubClientSecret = "cid", "secret"
		c.GitHubOAuthBaseURL, c.GitHubAPIBaseURL = gh.URL, gh.URL
		c.GitHubRedirectURL = "http://web.test/api/v1/auth/github/callback"
	})
}

func TestOAuthWebFlow(t *testing.T) {
	e := githubEnv(t)
	start := e.expect(e.do("GET", "/v1/auth/github/start?client=web", "", nil), 302)
	loc, _ := url.Parse(start.Header.Get("Location"))
	state := loc.Query().Get("state")
	nonceCookie := strings.SplitN(start.Header.Get("Set-Cookie"), ";", 2)[0]
	if state == "" || !strings.HasPrefix(nonceCookie, oauthNonceName+"=") {
		t.Fatalf("start: state=%q cookie=%q", state, nonceCookie)
	}

	// Without the browser's nonce cookie the callback is rejected (login CSRF).
	r := e.expect(e.do("GET", "/v1/auth/github/callback?code=good-code&state="+url.QueryEscape(state), "", nil), 302)
	if !strings.Contains(r.Header.Get("Location"), "error=invalid_state") {
		t.Fatalf("location = %s", r.Header.Get("Location"))
	}

	r = e.expect(e.do("GET", "/v1/auth/github/callback?code=good-code&state="+url.QueryEscape(state), "", nil, "Cookie", nonceCookie), 302)
	if r.Header.Get("Location") != "http://web.test/auth/complete" {
		t.Fatalf("location = %s", r.Header.Get("Location"))
	}
	if !strings.Contains(strings.Join(r.Header.Values("Set-Cookie"), "\n"), "ss_refresh=") {
		t.Fatal("no refresh cookie after sign-in")
	}
	var email string
	if err := e.store.Pool.QueryRow(context.Background(), `SELECT email FROM users WHERE github_id = 4242`).Scan(&email); err != nil || email != "intern@example.com" {
		t.Fatalf("user email = %q, %v", email, err)
	}
}

func TestOAuthStateRejected(t *testing.T) {
	e := githubEnv(t)
	e.expect(e.do("GET", "/v1/auth/github/callback?code=good-code&state=forged.sig", "", nil), 400)

	start := e.expect(e.do("GET", "/v1/auth/github/start?client=web", "", nil), 302)
	loc, _ := url.Parse(start.Header.Get("Location"))
	e.clock.Advance(auth.StateTTL + time.Second)
	e.expect(e.do("GET", "/v1/auth/github/callback?code=good-code&state="+url.QueryEscape(loc.Query().Get("state")), "", nil), 400)
}

func TestOAuthMobileRequiresPKCEAndRedirectsWithCode(t *testing.T) {
	e := githubEnv(t)
	e.expect(e.do("GET", "/v1/auth/github/start?client=mobile", "", nil), 422)
	e.expect(e.do("GET", "/v1/auth/github/start?client=desktop", "", nil), 422)

	verifier := strings.Repeat("z", 50)
	sum := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(sum[:])
	start := e.expect(e.do("GET", "/v1/auth/github/start?client=mobile&code_challenge_method=S256&code_challenge="+challenge, "", nil), 302)
	loc, _ := url.Parse(start.Header.Get("Location"))
	r := e.expect(e.do("GET", "/v1/auth/github/callback?code=good-code&state="+url.QueryEscape(loc.Query().Get("state")), "", nil), 302)
	back, _ := url.Parse(r.Header.Get("Location"))
	if back.Scheme != "stackstep" || back.Query().Get("code") == "" {
		t.Fatalf("redirect = %s", back)
	}
	e.expect(e.do("POST", "/v1/auth/exchange", "", map[string]string{"code": back.Query().Get("code"), "code_verifier": verifier}), 200)

	// GitHub rejecting the code sends the app an error, not a code.
	start = e.expect(e.do("GET", "/v1/auth/github/start?client=mobile&code_challenge_method=S256&code_challenge="+challenge, "", nil), 302)
	loc, _ = url.Parse(start.Header.Get("Location"))
	r = e.expect(e.do("GET", "/v1/auth/github/callback?code=bad&state="+url.QueryEscape(loc.Query().Get("state")), "", nil), 302)
	if !strings.Contains(r.Header.Get("Location"), "error=invalid_code") {
		t.Fatalf("location = %s", r.Header.Get("Location"))
	}
}

func TestGitHubNotConfigured(t *testing.T) {
	e := newEnv(t)
	e.expect(e.do("GET", "/v1/auth/github/start?client=web", "", nil), 503)
}

func TestAdminRoutesForbidStudents(t *testing.T) {
	e := newEnv(t)
	tok := e.login(seed.StudentLogin)
	e.expect(e.do("GET", "/v1/admin/students", tok, nil), 403)
	e.expect(e.createTask(tok, e.enrollmentOf(seed.StudentLogin), validTask(e.clock.Now())), 403)
}

func TestCollegeAdminScope(t *testing.T) {
	e := newEnv(t)
	tpo := e.login(seed.CollegeAdminLogin)
	var list struct {
		Items []studentDTO `json:"items"`
	}
	e.expect(e.do("GET", "/v1/admin/students", tpo, nil), 200).json(t, &list)
	for _, s := range list.Items {
		if s.User.GitHubLogin == seed.IndieStudentLogin {
			t.Fatal("college admin sees a student from outside the college")
		}
	}
	if len(list.Items) != 3 { // asha, ravi, kiran (paused)
		t.Fatalf("got %d students", len(list.Items))
	}
	indie := e.enrollmentOf(seed.IndieStudentLogin)
	e.expect(e.createTask(tpo, indie, validTask(e.clock.Now())), 404)
	e.expect(e.do("GET", "/v1/admin/enrollments/"+indie.String()+"/tasks", tpo, nil), 404)

	adm := e.login(seed.AdminLogin)
	e.expect(e.do("GET", "/v1/admin/students", adm, nil), 200).json(t, &list)
	if len(list.Items) != 4 {
		t.Fatalf("admin sees %d students, want 4", len(list.Items))
	}
}

func TestStudentSearchAndPagination(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	var page struct {
		Items      []studentDTO `json:"items"`
		NextCursor *string      `json:"next_cursor"`
	}
	e.expect(e.do("GET", "/v1/admin/students?limit=2", adm, nil), 200).json(t, &page)
	if len(page.Items) != 2 || page.NextCursor == nil {
		t.Fatalf("page1 = %+v", page)
	}
	first := page.Items[0].User.Name
	e.expect(e.do("GET", "/v1/admin/students?limit=2&cursor="+*page.NextCursor, adm, nil), 200).json(t, &page)
	if len(page.Items) != 2 || page.NextCursor != nil || page.Items[0].User.Name == first {
		t.Fatalf("page2 = %+v", page)
	}
	e.expect(e.do("GET", "/v1/admin/students?q=asha", adm, nil), 200).json(t, &page)
	if len(page.Items) != 1 || page.Items[0].User.GitHubLogin != seed.StudentLogin {
		t.Fatalf("search = %+v", page.Items)
	}
	e.expect(e.do("GET", "/v1/admin/students?q=%25", adm, nil), 200).json(t, &page) // literal %, not a wildcard
	if len(page.Items) != 0 {
		t.Fatalf("wildcard leaked: %d", len(page.Items))
	}
	e.expect(e.do("GET", "/v1/admin/students?q="+strings.Repeat("a", 101), adm, nil), 422)
	for _, bad := range []string{"limit=0", "limit=101", "limit=abc", "cursor=!!", "cursor=bm9wZQ"} {
		e.expect(e.do("GET", "/v1/admin/students?"+bad, adm, nil), 422)
	}
	e.expect(e.do("GET", "/v1/admin/students?cursor=%zz", adm, nil), 400)
}

// ---- Tasks (T1–T12) ----

func TestCreateTaskValidation(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	enr := e.enrollmentOf(seed.StudentLogin)
	now := e.clock.Now()
	cases := map[string]struct {
		mod   func(map[string]any)
		field string
	}{
		"blank title":      {func(b map[string]any) { b["title"] = "  " }, "title"},
		"short title":      {func(b map[string]any) { b["title"] = "ab" }, "title"},
		"long title":       {func(b map[string]any) { b["title"] = strings.Repeat("a", 121) }, "title"},
		"control in title": {func(b map[string]any) { b["title"] = "bad\u0007title" }, "title"},
		"long brief":       {func(b map[string]any) { b["brief"] = strings.Repeat("a", 8001) }, "brief"},
		"unknown type":     {func(b map[string]any) { b["type"] = "essay" }, "type"},
		"past start":       {func(b map[string]any) { b["scheduled_for"] = now.Add(-time.Hour) }, "scheduled_for"},
		"start after end":  {func(b map[string]any) { b["scheduled_for"] = now.AddDate(0, 1, 0); b["due_at"] = now.AddDate(0, 1, 1) }, "scheduled_for"},
		"due too soon":     {func(b map[string]any) { b["due_at"] = now.Add(10 * time.Minute) }, "due_at"},
		"due after end":    {func(b map[string]any) { b["due_at"] = now.AddDate(0, 2, 0) }, "due_at"},
		"due missing":      {func(b map[string]any) { delete(b, "due_at") }, "due_at"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			b := validTask(now)
			tc.mod(b)
			r := e.expect(e.createTask(adm, enr, b), 422)
			if _, ok := r.errCode(t).Error.Fields[tc.field]; !ok {
				t.Fatalf("fields = %s", r.Body)
			}
		})
	}
}

func TestCreateTaskBadRequests(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	path := "/v1/admin/enrollments/" + e.enrollmentOf(seed.StudentLogin).String() + "/tasks"
	e.expect(e.do("POST", path, adm, `{"type":"feature","title":"Valid title","due_at":"2026-11-04T10:00:00Z","extra":1}`), 400)
	e.expect(e.do("POST", path, adm, `{"type":"feature","title":42}`), 400)
	e.expect(e.do("POST", path, adm, `{"type":"feature",`), 400)
	e.expect(e.do("POST", path, adm, `{"due_at":"tomorrow"}`), 400)
	e.expect(e.do("POST", path, adm, `{} {}`), 400)
	e.expect(e.do("POST", path, adm, `{"brief":"`+strings.Repeat("a", MaxBodyBytes)+`"}`), 413)
	e.expect(e.do("POST", "/v1/admin/enrollments/not-a-uuid/tasks", adm, validTask(e.clock.Now())), 404)
	e.expect(e.do("POST", "/v1/admin/enrollments/"+uuid.NewString()+"/tasks", adm, validTask(e.clock.Now())), 404)
}

func TestCreateTaskOnInactiveEnrollment(t *testing.T) {
	e := newEnv(t)
	r := e.expect(e.createTask(e.login(seed.AdminLogin), e.enrollmentOf(seed.PausedLogin), validTask(e.clock.Now())), 422)
	if r.errCode(t).Error.Code != "enrollment_not_active" {
		t.Fatalf("body %s", r.Body)
	}
}

func TestTaskLifecycleAndAnnouncements(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	stu := e.login(seed.StudentLogin)
	task := e.mustCreateTask(adm, e.enrollmentOf(seed.StudentLogin))

	var board struct {
		Items []taskResp `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/tasks", stu, nil), 200).json(t, &board)
	if len(board.Items) != 1 || board.Items[0].Status != "todo" {
		t.Fatalf("board = %+v", board)
	}

	steps := []struct {
		tok, to, note string
		code          int
	}{
		{stu, "in_review", "", 422}, // can't skip in_progress
		{stu, "in_progress", "", 200},
		{stu, "done", "", 422}, // students can't approve
		{stu, "in_review", "", 200},
		{adm, "changes_requested", "", 422}, // note required
		{adm, "changes_requested", "Rename the filter state.", 200},
		{stu, "in_review", "", 200}, // resubmit
		{adm, "done", "", 200},
		{adm, "cancelled", "", 422}, // terminal
	}
	version := task.Version
	for i, s := range steps {
		r := e.expect(e.move(s.tok, task.ID, s.to, version, s.note), s.code)
		if s.code == 200 {
			var t2 taskResp
			r.json(t, &t2)
			if t2.Status != s.to || t2.Version != version+1 {
				t.Fatalf("step %d: got %+v", i, t2)
			}
			version = t2.Version
		}
	}

	var msgs struct {
		Items []messageDTO `json:"items"`
	}
	e.expect(e.do("GET", leadThread, stu, nil), 200).json(t, &msgs)
	joined := ""
	for _, m := range msgs.Items {
		joined += m.Body + "\n"
	}
	for _, want := range []string{"New feature ticket on your board", "Changes requested", "Rename the filter state.", "Approved"} {
		if !strings.Contains(joined, want) {
			t.Errorf("chat missing %q:\n%s", want, joined)
		}
	}
}

func TestTransitionVersionConflict(t *testing.T) {
	e := newEnv(t)
	stu := e.login(seed.StudentLogin)
	task := e.mustCreateTask(e.login(seed.AdminLogin), e.enrollmentOf(seed.StudentLogin))
	e.expect(e.move(stu, task.ID, "in_progress", task.Version, ""), 200)
	r := e.expect(e.move(stu, task.ID, "in_review", task.Version, ""), 409) // stale version
	if r.errCode(t).Error.Code != "version_conflict" {
		t.Fatalf("body %s", r.Body)
	}
	e.expect(e.move(stu, task.ID, "in_review", 0, ""), 422)
	e.expect(e.move(stu, task.ID, "flying", 2, ""), 422)
}

func TestStudentCannotTouchOthersTasks(t *testing.T) {
	e := newEnv(t)
	task := e.mustCreateTask(e.login(seed.AdminLogin), e.enrollmentOf(seed.StudentLogin))
	e.expect(e.move(e.login(seed.Student2Login), task.ID, "in_progress", task.Version, ""), 404)
	e.expect(e.move(e.login(seed.StudentLogin), uuid.New(), "in_progress", 1, ""), 404)
}

func TestCollegeAdminCannotReviewOutsideCollege(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	task := e.mustCreateTask(adm, e.enrollmentOf(seed.IndieStudentLogin))
	e.expect(e.move(e.login(seed.CollegeAdminLogin), task.ID, "cancelled", task.Version, ""), 404)
	e.expect(e.move(adm, task.ID, "cancelled", task.Version, ""), 200)
	// Cancelled tasks disappear from the student's board.
	var board struct {
		Items []taskResp `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/tasks", e.login(seed.IndieStudentLogin), nil), 200).json(t, &board)
	for _, it := range board.Items {
		if it.ID == task.ID {
			t.Fatalf("cancelled task still on the board: %+v", it)
		}
	}
}

func TestFutureTaskHiddenUntilScheduled(t *testing.T) {
	e := newEnv(t)
	now := e.clock.Now()
	body := validTask(now)
	body["scheduled_for"] = now.Add(2 * time.Hour)
	body["due_at"] = now.Add(5 * time.Hour)
	var task taskResp
	e.expect(e.createTask(e.login(seed.AdminLogin), e.enrollmentOf(seed.StudentLogin), body), 201).json(t, &task)

	stu := e.login(seed.StudentLogin)
	var board struct {
		Items []taskResp `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/tasks", stu, nil), 200).json(t, &board)
	if len(board.Items) != 0 {
		t.Fatal("future task visible")
	}
	e.expect(e.move(stu, task.ID, "in_progress", 1, ""), 404)

	e.clock.Advance(2 * time.Hour)
	stu = e.login(seed.StudentLogin)
	e.expect(e.do("GET", "/v1/me/tasks", stu, nil), 200).json(t, &board)
	if len(board.Items) != 1 {
		t.Fatal("task not visible once scheduled")
	}
}

// ---- Chat (C1–C8) ----

func send(e *env, tok string, clientID uuid.UUID, body string) resp {
	return e.do("POST", leadThread, tok, map[string]any{"client_id": clientID, "body": body})
}

func TestMessageValidation(t *testing.T) {
	e := newEnv(t)
	stu := e.login(seed.StudentLogin)
	for _, body := range []string{"", "   \n ", strings.Repeat("x", 4001)} {
		r := e.expect(send(e, stu, uuid.New(), body), 422)
		if _, ok := r.errCode(t).Error.Fields["body"]; !ok {
			t.Fatalf("body %s", r.Body)
		}
	}
	e.expect(send(e, stu, uuid.Nil, "hi"), 422)
	e.expect(e.do("POST", leadThread, stu, `{"client_id":"nope","body":"hi"}`), 400)
	e.expect(send(e, stu, uuid.New(), strings.Repeat("x", 4000)), 201)
}

func TestMessageIdempotentAndLeadReplyDelayed(t *testing.T) {
	e := newEnv(t)
	stu := e.login(seed.StudentLogin)
	cid := uuid.New()
	var first, again messageDTO
	e.expect(send(e, stu, cid, "  PR ready for review  "), 201).json(t, &first)
	e.expect(send(e, stu, cid, "PR ready for review"), 200).json(t, &again)
	if first.ID != again.ID || first.Body != "PR ready for review" {
		t.Fatalf("first=%+v again=%+v", first, again)
	}

	list := func() []messageDTO {
		var page struct {
			Items []messageDTO `json:"items"`
		}
		e.expect(e.do("GET", leadThread, stu, nil), 200).json(t, &page)
		return page.Items
	}
	items := list()
	if len(items) != 2 || items[0].Author != "student" { // welcome + student; reply not due
		t.Fatalf("before delay: %+v", items)
	}
	e.clock.Advance(30 * time.Second)
	items = list()
	if len(items) != 3 || items[0].Author != "persona" || !strings.Contains(items[0].Body, "review it shortly") {
		t.Fatalf("after delay: %+v", items)
	}
}

func TestMessageRateLimit(t *testing.T) {
	e := newEnv(t)
	stu := e.login(seed.StudentLogin)
	enr := e.enrollmentOf(seed.StudentLogin)
	now := e.clock.Now()
	if _, err := e.store.Pool.Exec(context.Background(), `
		INSERT INTO chat_messages (enrollment_id, persona_id, author, body, client_id, created_at, deliver_at, delivered_at)
		SELECT $1, $3, 'student', 'm' || g, gen_random_uuid(), $2, $2, $2 FROM generate_series(1, 199) g`, enr, now, domain.DefaultPersonaID); err != nil {
		t.Fatal(err)
	}
	lastOK := uuid.New()
	e.expect(send(e, stu, lastOK, "number 200"), 201)
	r := e.expect(send(e, stu, uuid.New(), "number 201"), 429)
	if ra := r.errCode(t).Error.RetryAfterSeconds; ra == nil || *ra <= 0 || *ra > 86401 {
		t.Fatalf("retry_after = %v", ra)
	}
	if r.Header.Get("Retry-After") == "" {
		t.Fatal("no Retry-After header")
	}
	e.expect(send(e, stu, lastOK, "number 200"), 200) // retries still succeed
	e.clock.Advance(24 * time.Hour)
	e.expect(send(e, e.login(seed.StudentLogin), uuid.New(), "new day"), 201)
}

func TestMessagePagination(t *testing.T) {
	e := newEnv(t)
	stu := e.login(seed.StudentLogin)
	for i := range 5 {
		e.clock.Advance(time.Second)
		e.expect(send(e, stu, uuid.New(), "msg "+string(rune('a'+i))), 201)
	}
	e.clock.Advance(time.Minute) // all lead replies due
	stu = e.login(seed.StudentLogin)
	seen := map[uuid.UUID]bool{}
	cursor := ""
	pages := 0
	for {
		path := leadThread + "?limit=4"
		if cursor != "" {
			path += "&cursor=" + cursor
		}
		var page struct {
			Items      []messageDTO `json:"items"`
			NextCursor *string      `json:"next_cursor"`
		}
		e.expect(e.do("GET", path, stu, nil), 200).json(t, &page)
		pages++
		for _, m := range page.Items {
			if seen[m.ID] {
				t.Fatalf("duplicate message %s", m.ID)
			}
			seen[m.ID] = true
		}
		if page.NextCursor == nil {
			break
		}
		cursor = *page.NextCursor
	}
	if len(seen) != 11 || pages != 3 { // welcome + 5 student + 5 lead
		t.Fatalf("seen %d messages over %d pages", len(seen), pages)
	}
	for _, bad := range []string{"limit=0", "limit=101", "limit=x", "cursor=!!"} {
		e.expect(e.do("GET", leadThread+"?"+bad, stu, nil), 422)
	}
}

func TestNoActiveEnrollment(t *testing.T) {
	e := newEnv(t)
	tok := e.login(seed.NoEnrollLogin)
	if m := e.me(tok); m.Enrollment != nil {
		t.Fatal("expected no enrollment")
	}
	for _, r := range []resp{
		e.do("GET", "/v1/me/tasks", tok, nil),
		e.do("GET", leadThread, tok, nil),
		send(e, tok, uuid.New(), "hello"),
	} {
		e.expect(r, 409)
		if r.errCode(t).Error.Code != "no_active_enrollment" {
			t.Fatalf("body %s", r.Body)
		}
	}
	e.expect(e.do("GET", "/v1/me/tasks", e.login(seed.AdminLogin), nil), 403)
}

func TestMethodAndRouteErrors(t *testing.T) {
	e := newEnv(t)
	e.expect(e.do("GET", "/v1/nope", "", nil), 404)
	e.expect(e.do("DELETE", "/v1/me", e.login(seed.StudentLogin), nil), 405)
	e.expect(e.do("GET", "/healthz", "", nil), 200)
	e.expect(e.do("GET", "/readyz", "", nil), 200)
}

func TestSignInRateLimited(t *testing.T) {
	e := newEnv(t, func(c *config.Config) { c.AuthRatePerMinute = 3 })
	for range 3 {
		e.expect(e.do("POST", "/v1/auth/dev-login", "", map[string]string{"github_login": seed.StudentLogin}, "X-Client", "mobile"), 200)
	}
	r := e.expect(e.do("POST", "/v1/auth/dev-login", "", map[string]string{"github_login": seed.StudentLogin}, "X-Client", "mobile"), 429)
	if r.Header.Get("Retry-After") != "60" {
		t.Fatalf("Retry-After = %q", r.Header.Get("Retry-After"))
	}
	// Refresh has its own, larger bucket, so a throttled sign-in doesn't lock out signed-in users.
	e.expect(e.do("POST", "/v1/auth/refresh", "", map[string]string{"refresh_token": "nope"}, "X-Client", "mobile"), 401)
}

// TestClientIPFromProxy: the web proxy's vouched address is used only with the right secret (RL1).
func TestClientIPFromProxy(t *testing.T) {
	secret := strings.Repeat("s", 32)
	req := func(h map[string]string) *http.Request {
		r := httptest.NewRequest("GET", "/", nil)
		r.RemoteAddr = "10.1.2.3:4444"
		for k, v := range h {
			r.Header.Set(k, v)
		}
		return r
	}
	if got := clientIP(req(map[string]string{"X-Proxy-Secret": secret, "X-Client-IP": "203.0.113.7"}), nil, secret); got != "203.0.113.7" {
		t.Fatalf("vouched = %s", got)
	}
	if got := clientIP(req(map[string]string{"X-Proxy-Secret": "wrong", "X-Client-IP": "203.0.113.7"}), nil, secret); got != "10.1.2.3" {
		t.Fatalf("wrong secret = %s", got)
	}
	if got := clientIP(req(map[string]string{"X-Client-IP": "203.0.113.7"}), nil, ""); got != "10.1.2.3" {
		t.Fatalf("disabled = %s", got)
	}
	if got := clientIP(req(map[string]string{"X-Proxy-Secret": secret, "X-Client-IP": "not-an-ip"}), nil, secret); got != "10.1.2.3" {
		t.Fatalf("garbage = %s", got)
	}
}

// The web app's crash reports are accepted without sign-in, checked strictly and size-capped.
func TestClientErrorReport(t *testing.T) {
	e := newEnv(t)
	body := map[string]any{"where": "page", "message": "TypeError: x is undefined", "stack": "at Apply", "path": "/workspace", "digest": "", "release": "test"}
	e.expect(e.do("POST", "/v1/client-errors", "", body), 204)
	body["extra"] = "nope"
	e.expect(e.do("POST", "/v1/client-errors", "", body), 400)
	delete(body, "extra")
	body["stack"] = strings.Repeat("x", 20<<10)
	e.expect(e.do("POST", "/v1/client-errors", "", body), 413)
}
