package httpapi

import (
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

// RS6: a cohort whose flow was archived later still takes students; they start without a
// flow instead of being refused.
func TestEnrollSkipsArchivedCohortFlow(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	c := e.mustCohort(adm, map[string]any{"kind": "group", "name": "Archived flow batch", "program_slug": "frontend-30", "seats_total": 5})
	e.expect(e.do("PUT", "/v1/admin/cohorts/"+c.ID.String()+"/flow", adm, map[string]any{"flow_id": seed.ReactFlowID}), 200)
	if _, err := e.store.Pool.Exec(t.Context(), "UPDATE flows SET archived_at = now() WHERE id = $1", seed.ReactFlowID); err != nil {
		t.Fatal(err)
	}
	var r enrollResp
	e.expect(e.do("POST", "/v1/admin/enrollments", adm, map[string]any{"github_login": "late-joiner", "cohort_id": c.ID}), 201).json(t, &r)
	if r.Student.Enrollment.Flow != nil {
		t.Fatalf("enrolled on an archived flow: %+v", r.Student.Enrollment)
	}
}

// MA10: a college admin's announcement reaches students of their college who have no cohort.
func TestAnnouncementReachesCohortlessCollegeStudents(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	tpo := e.login(seed.CollegeAdminLogin)
	var college string
	if err := e.store.Pool.QueryRow(t.Context(), "SELECT college_id FROM users WHERE github_login = $1", seed.CollegeAdminLogin).Scan(&college); err != nil {
		t.Fatal(err)
	}
	// A student of the college enrolled with no cohort.
	e.expect(e.do("POST", "/v1/admin/enrollments", adm, map[string]any{"github_login": "solo-anits", "program_slug": "frontend-30"}), 201)
	if _, err := e.store.Pool.Exec(t.Context(), "UPDATE users SET college_id = $1 WHERE github_login = 'solo-anits'", college); err != nil {
		t.Fatal(err)
	}
	e.expect(e.do("POST", "/v1/admin/announcements", tpo, map[string]any{"subject": "Placement drive", "body": "Friday at 10.", "audience": "all"}), 201)
	var page struct {
		Items []struct {
			Subject string `json:"subject"`
		} `json:"items"`
	}
	e.expect(e.do("GET", "/v1/me/mail", e.login("solo-anits"), nil), 200).json(t, &page)
	found := false
	for _, m := range page.Items {
		found = found || m.Subject == "Placement drive"
	}
	if !found {
		t.Fatalf("cohort-less college student missed the announcement: %+v", page.Items)
	}
}

// MA11: a cursor from another list is a 422, not a 500.
func TestMailRejectsForeignCursor(t *testing.T) {
	e := newEnv(t)
	cur := store.EncodeCursor(store.Cursor{Key: "2026-11-04T10:00:00Z", ID: seed.ReactFlowID})
	e.expect(e.do("GET", "/v1/me/mail?cursor="+url.QueryEscape(cur), e.login(seed.StudentLogin), nil), 422)
}

// IN5: search wildcards are literal, so "%" doesn't match everyone.
func TestSearchWildcardsAreLiteral(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	var inbox struct {
		Items []any `json:"items"`
	}
	e.expect(e.do("GET", "/v1/admin/inbox/students?q="+url.QueryEscape("%"), adm, nil), 200).json(t, &inbox)
	var users struct {
		Items []any `json:"items"`
	}
	e.expect(e.do("GET", "/v1/admin/users?q="+url.QueryEscape("_"), adm, nil), 200).json(t, &users)
	if len(inbox.Items) != 0 || len(users.Items) != 0 {
		t.Fatalf("wildcards matched %d inbox and %d users", len(inbox.Items), len(users.Items))
	}
}

// AT8: students arriving at the same moment get different seats.
func TestSimultaneousArrivalsGetDistinctSeats(t *testing.T) {
	e := newEnv(t)
	logins := []string{seed.StudentLogin, seed.Student2Login, seed.IndieStudentLogin}
	tokens := make([]string, len(logins))
	for i, l := range logins {
		tokens[i] = e.login(l)
	}
	done := make(chan int, len(tokens))
	for _, tok := range tokens {
		go func() { done <- e.do("GET", "/v1/me", tok, nil).Code }()
	}
	for range tokens {
		if c := <-done; c != 200 {
			t.Fatalf("status %d", c)
		}
	}
	var n, distinct int
	if err := e.store.Pool.QueryRow(t.Context(), "SELECT count(*), count(DISTINCT seat) FROM attendance WHERE day = (SELECT max(day) FROM attendance)").Scan(&n, &distinct); err != nil {
		t.Fatal(err)
	}
	if n != len(logins) || distinct != n {
		t.Fatalf("%d marks with %d distinct seats", n, distinct)
	}
}

// AS1: before Day 1 a task waits for the start of that day; a due time before then is
// refused with a message that says when the student starts.
func TestAssignBeforeDayOne(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	var r enrollResp
	e.expect(e.do("POST", "/v1/admin/enrollments", adm, map[string]any{"github_login": "day-zero", "program_slug": "frontend-30"}), 201).json(t, &r)
	id := r.Student.Enrollment.ID
	soon := e.clock.Now().Add(time.Hour)
	f := e.expect(e.do("POST", "/v1/admin/enrollments/"+id.String()+"/tasks", adm, map[string]any{"type": "bug_fix", "title": "Fix the navbar", "brief": "Fix it.", "due_at": soon}), 422).errCode(t).Error.Fields
	if !strings.Contains(f["due_at"], "starts") {
		t.Fatalf("due_at error = %q", f["due_at"])
	}
	var task struct {
		ScheduledFor time.Time `json:"scheduled_for"`
	}
	dayTwo := e.clock.Now().Add(48 * time.Hour)
	e.expect(e.do("POST", "/v1/admin/enrollments/"+id.String()+"/tasks", adm, map[string]any{"type": "bug_fix", "title": "Fix the navbar", "brief": "Fix it.", "due_at": dayTwo}), 201).json(t, &task)
	if !task.ScheduledFor.After(e.clock.Now()) {
		t.Fatalf("task shows before Day 1: %v", task.ScheduledFor)
	}
}
