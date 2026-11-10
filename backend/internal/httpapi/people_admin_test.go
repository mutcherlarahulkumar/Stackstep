package httpapi

import (
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

type attendanceResp struct {
	Days []struct {
		Date   string `json:"date"`
		Day    int    `json:"day"`
		Status string `json:"status"`
		Seat   *int   `json:"seat"`
	} `json:"days"`
	Present int `json:"present"`
	Missed  int `json:"missed"`
	Streak  int `json:"streak"`
}

type userRowResp struct {
	User struct {
		ID          uuid.UUID `json:"id"`
		GitHubLogin string    `json:"github_login"`
	} `json:"user"`
	LastSeen   *time.Time `json:"last_seen_at"`
	Enrollment *struct {
		ID uuid.UUID `json:"id"`
	} `json:"enrollment"`
	Cohort *struct {
		Name string `json:"name"`
	} `json:"cohort"`
}

type staffNoteResp struct {
	ID         uuid.UUID `json:"id"`
	Body       string    `json:"body"`
	Done       bool      `json:"done"`
	AuthorName string    `json:"author_name"`
}

type profileResp struct {
	User struct {
		ID uuid.UUID `json:"id"`
	} `json:"user"`
	GitHubURL   string          `json:"github_url"`
	LastSeen    *time.Time      `json:"last_seen_at"`
	Enrollments []struct{}      `json:"enrollments"`
	Attendance  *attendanceResp `json:"attendance"`
	Notes       []staffNoteResp `json:"notes"`
}

func (e *env) userID(login string) uuid.UUID {
	e.t.Helper()
	var id uuid.UUID
	if err := e.store.Pool.QueryRow(e.t.Context(), "SELECT id FROM users WHERE github_login = $1", login).Scan(&id); err != nil {
		e.t.Fatalf("user %s: %v", login, err)
	}
	return id
}

func TestAttendanceMarkedOnOpen(t *testing.T) {
	e := newEnv(t)
	asha := e.login(seed.StudentLogin)
	ravi := e.login(seed.Student2Login)

	// AT3: opening the app marks today present; the first one in takes seat 1.
	e.expect(e.do("GET", "/v1/me", ravi, nil), 200)
	e.expect(e.do("GET", "/v1/me", asha, nil), 200)
	e.expect(e.do("GET", "/v1/me", asha, nil), 200) // a second visit changes nothing
	var a attendanceResp
	e.expect(e.do("GET", "/v1/me/attendance", asha, nil), 200).json(t, &a)
	last := a.Days[len(a.Days)-1]
	if last.Status != string(domain.AttendancePresent) || last.Seat == nil || *last.Seat != 2 {
		t.Fatalf("today = %+v", last)
	}
	// The seed marks her present on days 1 and 2.
	if a.Present != 3 || a.Missed != 0 || a.Streak != 3 {
		t.Fatalf("present %d missed %d of %d", a.Present, a.Missed, len(a.Days))
	}

	// AT4: the next day starts pending until the student opens Stackstep.
	e.clock.Advance(24 * time.Hour)
	asha = e.login(seed.StudentLogin)
	e.expect(e.do("GET", "/v1/me/attendance", asha, nil), 200).json(t, &a)
	if got := a.Days[len(a.Days)-1].Status; got != string(domain.AttendancePending) || a.Streak != 3 {
		t.Fatalf("next day %s streak %d", got, a.Streak)
	}
	e.expect(e.do("GET", "/v1/me", asha, nil), 200)
	e.expect(e.do("GET", "/v1/me/attendance", asha, nil), 200).json(t, &a)
	if a.Streak != 4 || *a.Days[len(a.Days)-1].Seat != 1 {
		t.Fatalf("after visiting: streak %d seat %v", a.Streak, a.Days[len(a.Days)-1].Seat)
	}

	// AT5: no internship, no attendance.
	e.expect(e.do("GET", "/v1/me/attendance", e.login(seed.NoEnrollLogin), nil), 409)
}

func TestPeopleDirectoryAndProfile(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	tpo := e.login(seed.CollegeAdminLogin)
	asha := e.login(seed.StudentLogin)
	e.expect(e.do("GET", "/v1/me", asha, nil), 200)
	ashaID := e.userID(seed.StudentLogin)

	// PA1: the directory lists everyone, with filters for interns, applicants and staff.
	var page struct {
		Items []userRowResp `json:"items"`
	}
	e.expect(e.do("GET", "/v1/admin/users?kind=applicants", adm, nil), 200).json(t, &page)
	for _, r := range page.Items {
		if r.Enrollment != nil {
			t.Fatalf("applicant %s has an internship", r.User.GitHubLogin)
		}
	}
	e.expect(e.do("GET", "/v1/admin/users?kind=interns&q=asha", adm, nil), 200).json(t, &page)
	if len(page.Items) != 1 || page.Items[0].Cohort == nil || page.Items[0].LastSeen == nil {
		t.Fatalf("interns = %+v", page.Items)
	}
	e.expect(e.do("GET", "/v1/admin/users?kind=everyone", adm, nil), 422)
	// College admins only see their college; the indie student isn't in it.
	e.expect(e.do("GET", "/v1/admin/users?q="+seed.IndieStudentLogin, tpo, nil), 200).json(t, &page)
	if len(page.Items) != 0 {
		t.Fatalf("college admin sees %d outsiders", len(page.Items))
	}
	e.expect(e.do("GET", fmt.Sprintf("/v1/admin/users/%s", e.userID(seed.IndieStudentLogin)), tpo, nil), 404)
	e.expect(e.do("GET", "/v1/admin/users", asha, nil), 403)

	// PA2: a profile has the GitHub link, internships, attendance and notes.
	var p profileResp
	e.expect(e.do("GET", fmt.Sprintf("/v1/admin/users/%s", ashaID), adm, nil), 200).json(t, &p)
	if p.GitHubURL != "https://github.com/"+seed.StudentLogin || len(p.Enrollments) == 0 || p.Attendance == nil || p.Attendance.Present != 3 {
		t.Fatalf("profile = %+v", p)
	}

	// PA3: notes work like a to-do list; college admins can keep them too.
	var n staffNoteResp
	e.expect(e.do("POST", fmt.Sprintf("/v1/admin/users/%s/notes", ashaID), adm, map[string]any{"body": "  Call about the late hand-ins  "}), 201).json(t, &n)
	if n.Body != "Call about the late hand-ins" || n.Done || n.AuthorName == "" {
		t.Fatalf("note = %+v", n)
	}
	e.expect(e.do("POST", fmt.Sprintf("/v1/admin/users/%s/notes", ashaID), tpo, map[string]any{"body": "Met her at the drive"}), 201)
	e.expect(e.do("POST", fmt.Sprintf("/v1/admin/users/%s/notes", ashaID), adm, map[string]any{"body": " "}), 422)
	e.expect(e.do("PATCH", fmt.Sprintf("/v1/admin/notes/%s", n.ID), adm, map[string]any{"done": true}), 200).json(t, &n)
	if !n.Done {
		t.Fatal("note not ticked off")
	}
	e.expect(e.do("PATCH", fmt.Sprintf("/v1/admin/notes/%s", n.ID), adm, map[string]any{}), 422)
	e.expect(e.do("GET", fmt.Sprintf("/v1/admin/users/%s", ashaID), adm, nil), 200).json(t, &p)
	// Two seeded notes plus these two; open ones first.
	if len(p.Notes) != 4 || p.Notes[0].Done || p.Notes[1].Done || !p.Notes[2].Done || !p.Notes[3].Done {
		t.Fatalf("open notes should come first: %+v", p.Notes)
	}
	e.expect(e.do("DELETE", fmt.Sprintf("/v1/admin/notes/%s", n.ID), adm, nil), 204)
	e.expect(e.do("DELETE", fmt.Sprintf("/v1/admin/notes/%s", n.ID), adm, nil), 404)
}

func TestSignOutEverywhere(t *testing.T) {
	e := newEnv(t)
	adm := e.login(seed.AdminLogin)
	tpo := e.login(seed.CollegeAdminLogin)
	asha := e.login(seed.StudentLogin)
	ashaID := e.userID(seed.StudentLogin)

	// SO1: only platform admins, and never on themselves.
	e.expect(e.do("POST", fmt.Sprintf("/v1/admin/users/%s/sign-out", ashaID), tpo, nil), 403)
	e.expect(e.do("POST", fmt.Sprintf("/v1/admin/users/%s/sign-out", e.userID(seed.AdminLogin)), adm, nil), 422)

	// SO2: her current tokens stop working at once; signing in again works.
	e.expect(e.do("POST", fmt.Sprintf("/v1/admin/users/%s/sign-out", ashaID), adm, nil), 204)
	e.expect(e.do("GET", "/v1/me", asha, nil), 401)
	e.clock.Advance(2 * time.Second)
	e.expect(e.do("GET", "/v1/me", e.login(seed.StudentLogin), nil), 200)
	e.expect(e.do("GET", "/v1/me", adm, nil), 200)
}
